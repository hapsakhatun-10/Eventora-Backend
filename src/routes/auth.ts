import { Router, Request, Response } from "express";
import passport from "passport";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { userCollection } from "../db";
import { FRONTEND_URL } from "../config";
import { generateToken, verifyToken } from "../utils/jwt";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!trimmedName || !normalizedEmail || !password) {
      res.status(400).json({ message: "Name, email, and password are required" });
      return;
    }

    if (!EMAIL_RE.test(normalizedEmail)) {
      res.status(400).json({ message: "Invalid email format" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }

    const existing = await userCollection.findOne({ email: normalizedEmail });
    if (existing) {
      res.status(409).json({ message: "Email already in use" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await userCollection.insertOne({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
    });

    const token = generateToken({
      userId: result.insertedId.toString(),
      name: trimmedName,
      email: normalizedEmail,
    });

    res.status(201).json({
      token,
      user: {
        id: result.insertedId.toString(),
        name: trimmedName,
        email: normalizedEmail,
      },
    });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const user = await userCollection.findOne({ email: normalizedEmail });
    if (!user || !user.password) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const token = generateToken({
      userId: user._id!.toString(),
      name: user.name,
      email: user.email,
    });

    res.json({
      token,
      user: {
        id: user._id!.toString(),
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/logout", (_req: Request, res: Response) => {
  res.json({ message: "Logged out" });
});

router.get("/me", (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }

  try {
    const token = header.split(" ")[1];
    const payload = verifyToken(token);
    res.json({
      user: {
        id: payload.userId,
        name: payload.name,
        email: payload.email,
      },
    });
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
});

router.get("/user/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }
    const user = await userCollection.findOne(
      { _id: new ObjectId(id) },
      { projection: { name: 1, email: 1, createdAt: 1 } }
    );
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.json({
      id: user._id!.toString(),
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: `${FRONTEND_URL}/login` }),
  (req: Request, res: Response) => {
    const user = req.user as any;
    const token = generateToken({
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
    });
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

export default router;
