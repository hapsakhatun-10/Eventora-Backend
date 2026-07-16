import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { followCollection, userCollection } from "../db";
import { withAuth } from "../middleware/auth";

const router = Router();

router.post("/toggle", withAuth, async (req: Request, res: Response) => {
  try {
    const { userId: targetUserId } = req.body;

    if (!targetUserId || !ObjectId.isValid(targetUserId)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    if (targetUserId === req.user!.userId) {
      res.status(400).json({ message: "You cannot follow yourself" });
      return;
    }

    const targetUser = await userCollection.findOne({ _id: new ObjectId(targetUserId) });
    if (!targetUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const existing = await followCollection.findOne({
      followerId: req.user!.userId,
      followingId: targetUserId,
    });

    if (existing) {
      await followCollection.deleteOne({ _id: existing._id });
      res.json({ following: false });
    } else {
      await followCollection.insertOne({
        followerId: req.user!.userId,
        followingId: targetUserId,
        createdAt: new Date().toISOString(),
      });
      res.json({ following: true });
    }
  } catch (error) {
    console.error("Toggle follow error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

router.get("/check/:userId", withAuth, async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.userId as string;

    if (!targetUserId || !ObjectId.isValid(targetUserId)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const existing = await followCollection.findOne({
      followerId: req.user!.userId,
      followingId: targetUserId,
    });

    res.json({ following: !!existing });
  } catch (error) {
    console.error("Check follow error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

router.get("/list", withAuth, async (req: Request, res: Response) => {
  try {
    const follows = await followCollection
      .find({ followerId: req.user!.userId })
      .sort({ createdAt: -1 })
      .toArray();

    const followingIds = follows.map((f) => f.followingId);
    const validIds = followingIds.filter((id) => ObjectId.isValid(id));

    const users = await userCollection
      .find({ _id: { $in: validIds.map((id) => new ObjectId(id)) } })
      .project({ name: 1, email: 1, createdAt: 1 })
      .toArray();

    const userMap = new Map(users.map((u) => [u._id!.toString(), u]));

    const following = follows.map((f) => ({
      followId: f._id!.toString(),
      createdAt: f.createdAt,
      user: userMap.get(f.followingId) || null,
    }));

    res.json({ following });
  } catch (error) {
    console.error("Fetch following list error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

router.get("/followers/:userId", async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.userId as string;

    if (!targetUserId || !ObjectId.isValid(targetUserId)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const follows = await followCollection
      .find({ followingId: targetUserId })
      .sort({ createdAt: -1 })
      .toArray();

    const followerIds = follows.map((f) => f.followerId);
    const validIds = followerIds.filter((id) => ObjectId.isValid(id));

    const users = await userCollection
      .find({ _id: { $in: validIds.map((id) => new ObjectId(id)) } })
      .project({ name: 1, email: 1, createdAt: 1 })
      .toArray();

    const userMap = new Map(users.map((u) => [u._id!.toString(), u]));

    const followers = follows.map((f) => ({
      user: userMap.get(f.followerId) || null,
      createdAt: f.createdAt,
    }));

    res.json({ followers, count: follows.length });
  } catch (error) {
    console.error("Fetch followers error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

export default router;
