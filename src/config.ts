export const PORT = process.env.PORT || 5000;
export const MONGODB_URI = process.env.MONGODB_URI as string;
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
export const JWT_SECRET =
  process.env.JWT_SECRET || "evento-jwt-secret-change-in-production";
export const JWT_EXPIRES_IN = "7d";
export const DB_NAME = "evento";
export const IMGBB_API_KEY = process.env.IMGBB_API_KEY as string;
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string;
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY as string;
