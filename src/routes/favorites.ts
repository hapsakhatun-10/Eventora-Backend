import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { favoriteCollection } from "../db";
import { withAuth } from "../middleware/auth";

const router = Router();

router.post("/toggle", withAuth, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.body;

    if (!eventId || !ObjectId.isValid(eventId)) {
      res.status(400).json({ message: "Invalid event ID" });
      return;
    }

    const existing = await favoriteCollection.findOne({
      userId: req.user!.userId,
      eventId,
    });

    if (existing) {
      await favoriteCollection.deleteOne({ _id: existing._id });
      res.json({ favorited: false });
    } else {
      await favoriteCollection.insertOne({
        userId: req.user!.userId,
        eventId,
        createdAt: new Date().toISOString(),
      });
      res.json({ favorited: true });
    }
  } catch (error) {
    console.error("Toggle favorite error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

router.get("/ids", withAuth, async (req: Request, res: Response) => {
  try {
    const favorites = await favoriteCollection
      .find({ userId: req.user!.userId })
      .sort({ createdAt: -1 })
      .toArray();

    const ids = favorites.map((f) => f.eventId);
    res.json({ ids });
  } catch (error) {
    console.error("Fetch favorite ids error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

router.get("/check/:eventId", withAuth, async (req: Request, res: Response) => {
  try {
    const eventId = req.params.eventId as string;

    if (!eventId || !ObjectId.isValid(eventId)) {
      res.status(400).json({ message: "Invalid event ID" });
      return;
    }

    const existing = await favoriteCollection.findOne({
      userId: req.user!.userId,
      eventId,
    });

    res.json({ favorited: !!existing });
  } catch (error) {
    console.error("Check favorite error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

export default router;
