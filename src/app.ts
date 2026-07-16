import express from "express";
import cors from "cors";
import passport from "passport";
import { configurePassport } from "./passport";
import { FRONTEND_URL } from "./config";
import { connectDB } from "./db";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import paymentRoutes from "./routes/payments";
import followRoutes from "./routes/follows";
import favoriteRoutes from "./routes/favorites";

const app = express();

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

configurePassport();
app.use(passport.initialize());

app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.get("/", (_req, res) => {
  res.send("Event Management Server is Running");
});

app.use("/auth", authRoutes);
app.use("/events", eventRoutes);
app.use("/payments", paymentRoutes);
app.use("/follows", followRoutes);
app.use("/favorites", favoriteRoutes);

app.use(errorHandler);

export default app;
