import { MongoClient, ServerApiVersion, Collection } from "mongodb";
import { MONGODB_URI, DB_NAME } from "./config";
import { EventDocument, UserDocument, TicketDocument, FollowDocument, FavoriteDocument } from "./types/models";

export const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

export let eventCollection: Collection<EventDocument>;
export let userCollection: Collection<UserDocument>;
export let ticketCollection: Collection<TicketDocument>;
export let followCollection: Collection<FollowDocument>;
export let favoriteCollection: Collection<FavoriteDocument>;

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) return;

  await client.connect();
  const db = client.db(DB_NAME);
  eventCollection = db.collection<EventDocument>("events");
  userCollection = db.collection<UserDocument>("users");
  ticketCollection = db.collection<TicketDocument>("tickets");
  followCollection = db.collection<FollowDocument>("follows");
  favoriteCollection = db.collection<FavoriteDocument>("favorites");

  await Promise.all([
    eventCollection.createIndex({ createdAt: -1 }),
    eventCollection.createIndex({ createdBy: 1 }),
    eventCollection.createIndex({ category: 1 }),
    userCollection.createIndex({ email: 1 }, { unique: true }),
    ticketCollection.createIndex({ userId: 1 }),
    ticketCollection.createIndex({ eventId: 1 }),
    ticketCollection.createIndex({ sessionId: 1 }, { sparse: true }),
    followCollection.createIndex({ followerId: 1, followingId: 1 }, { unique: true }),
    followCollection.createIndex({ followingId: 1 }),
    favoriteCollection.createIndex({ userId: 1, eventId: 1 }, { unique: true }),
    favoriteCollection.createIndex({ userId: 1 }),
  ]);

  isConnected = true;
  console.log("Connected to MongoDB");
}
