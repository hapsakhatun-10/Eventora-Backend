import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { eventCollection } from "../db";
import { withAuth } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { uploadToImgbb } from "../services/imgbb";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    const conditions: object[] = [];

    const categories = req.query.categories as string;
    if (categories) {
      const categoryList = categories.split(",").map((c) => c.trim()).filter(Boolean);
      if (categoryList.length > 0) {
        filter.category = { $in: categoryList };
      }
    }

    const search = (req.query.search as string || "").trim();
    if (search) {
      conditions.push({
        $or: [
          { title: { $regex: search, $options: "i" } },
          { shortDescription: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      });
    }

    const location = (req.query.location as string || "").trim();
    if (location) {
      conditions.push({
        $or: [
          { city: { $regex: location, $options: "i" } },
          { venue: { $regex: location, $options: "i" } },
          { address: { $regex: location, $options: "i" } },
        ],
      });
    }

    if (conditions.length > 0) {
      filter.$and = conditions;
    }

    const [events, total] = await Promise.all([
      eventCollection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      eventCollection.countDocuments(filter),
    ]);

    res.json({
      events,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/my", withAuth, async (req: Request, res: Response) => {
  try {
    const events = await eventCollection
      .find({ createdBy: req.user!.userId })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ events });
  } catch (error) {
    console.error("Error fetching user events:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/batch", async (req: Request, res: Response) => {
  try {
    const idsParam = req.query.ids as string;
    if (!idsParam) {
      res.json({ events: [] });
      return;
    }
    const ids = idsParam.split(",").filter((id) => ObjectId.isValid(id));
    if (ids.length === 0) {
      res.json({ events: [] });
      return;
    }
    const events = await eventCollection
      .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } })
      .toArray();
    res.json({ events });
  } catch (error) {
    console.error("Error fetching events batch:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid event ID" });
      return;
    }
    const event = await eventCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }
    res.json(event);
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/:id", withAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid event ID" });
      return;
    }
    const event = await eventCollection.findOne({ _id: new ObjectId(id) });
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }
    if (event.createdBy !== req.user!.userId) {
      res.status(403).json({ message: "You can only delete your own events" });
      return;
    }
    await eventCollection.deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post(
  "/",
  withAuth,
  upload.fields([
    { name: "banner", maxCount: 1 },
    { name: "images", maxCount: 8 },
  ]),
  async (req: Request, res: Response) => {
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        res.status(400).json({ message: "Request body is required" });
        return;
      }

      const { title, category, date, startTime, endTime } = req.body;

      if (!title || !category || !date || !startTime || !endTime) {
        res.status(400).json({
          message:
            "Missing required fields: title, category, date, startTime, endTime",
        });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

      let bannerUrl = "";
      if (files?.banner?.[0]) {
        try {
          bannerUrl = await uploadToImgbb(
            files.banner[0].buffer,
            files.banner[0].originalname
          );
        } catch (err) {
          console.error("Banner upload failed, continuing without banner:", err);
        }
      }

      let imageUrls: string[] = [];
      if (files?.images) {
        const results = await Promise.allSettled(
          files.images.map((file) => uploadToImgbb(file.buffer, file.originalname))
        );
        imageUrls = results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
          .map((r) => r.value);
      }

      const {
        shortDescription,
        description,
        venue,
        city,
        address,
        onlineUrl,
        eventType,
        locationTab,
        reservedSeating,
        price: rawPrice,
        totalSeats: rawTotalSeats,
      } = req.body;

      const event = {
        title: title.trim(),
        category,
        date,
        startTime,
        endTime,
        shortDescription: shortDescription || "",
        description: description || "",
        venue: venue || "",
        city: city || "",
        address: address || "",
        onlineUrl: onlineUrl || "",
        eventType: eventType || "single",
        locationTab: locationTab || "venue",
        reservedSeating: reservedSeating === "true",
        price: Number(rawPrice) || 0,
        totalSeats: Number(rawTotalSeats) || 0,
        availableSeats: Number(rawTotalSeats) || 0,
        banner: bannerUrl,
        images: imageUrls,
        createdBy: req.user!.userId,
        createdByName: req.user!.name || "Organizer",
        organizerId: req.user!.userId,
        organizerName: req.user!.name || "Organizer",
        organizerEmail: req.user!.email || "",
        createdAt: new Date().toISOString(),
      };

      const result = await eventCollection.insertOne(event);
      res.status(201).json({
        message: "Event created successfully",
        eventId: result.insertedId,
      });
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

export default router;
