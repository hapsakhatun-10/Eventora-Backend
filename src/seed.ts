import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";
import { client, connectDB, eventCollection, userCollection } from "./db";

interface SeedUser {
  _id: string;
  name: string;
  email: string;
  password: string;
  avatar?: string;
  provider?: string;
  role?: string;
  createdAt: string;
}

interface SeedEvent {
  _id: string;
  title: string;
  category: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  totalSeats: number;
  availableSeats: number;
  banner: string;
  images: string[];
  venue: string;
  city: string;
  address: string;
  shortDescription: string;
  description: string;
  eventType: string;
  locationTab: string;
  reservedSeating: boolean;
  onlineUrl: string;
  createdBy: string;
  createdByName: string;
  organizerId: string;
  organizerName: string;
  organizerEmail: string;
  organizerImage?: string;
  createdAt: string;
}

const shouldReset = process.argv.includes("--reset");

async function seed() {
  const resetMsg = shouldReset ? " (with --reset: dropping existing data)" : "";
  console.log(`Starting seed...${resetMsg}`);

  await connectDB();

  if (shouldReset) {
    console.log("Dropping existing collections...");
    await Promise.all([
      eventCollection.drop().catch(() => {}),
      userCollection.drop().catch(() => {}),
    ]);
    await Promise.all([
      eventCollection.createIndex({ createdAt: -1 }),
      eventCollection.createIndex({ createdBy: 1 }),
      eventCollection.createIndex({ category: 1 }),
      userCollection.createIndex({ email: 1 }, { unique: true }),
    ]);
  }

  const seedDir = join(__dirname, "..", "seed");

  const rawUsers: SeedUser[] = JSON.parse(
    readFileSync(join(seedDir, "users.json"), "utf-8")
  );
  const rawEvents: SeedEvent[] = JSON.parse(
    readFileSync(join(seedDir, "events.json"), "utf-8")
  );

  console.log(`Hashing passwords for ${rawUsers.length} users...`);
  const defaultPassword = await bcrypt.hash("password123", 12);

  const users = rawUsers.map((u) => ({
    _id: undefined,
    name: u.name,
    email: u.email,
    password: u.password.startsWith("$2b$") ? u.password : defaultPassword,
    avatar: u.avatar || "",
    provider: u.provider || "local",
    createdAt: u.createdAt,
  }));

  const events = rawEvents.map((e) => ({
    _id: undefined,
    title: e.title,
    category: e.category,
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    price: e.price,
    totalSeats: e.totalSeats,
    availableSeats: e.availableSeats,
    banner: e.banner,
    images: e.images || [],
    venue: e.venue || "",
    city: e.city || "",
    address: e.address || "",
    shortDescription: e.shortDescription || "",
    description: e.description || "",
    eventType: e.eventType || "single",
    locationTab: e.locationTab || "venue",
    reservedSeating: e.reservedSeating || false,
    onlineUrl: e.onlineUrl || "",
    createdBy: e.createdBy,
    createdByName: e.createdByName,
    organizerId: e.organizerId || "",
    organizerName: e.organizerName || "",
    organizerEmail: e.organizerEmail || "",
    organizerImage: e.organizerImage || "",
    createdAt: e.createdAt,
  }));

  console.log(`Inserting ${users.length} users...`);
  const userResult = await userCollection.insertMany(users as any);
  console.log(`Inserted ${userResult.insertedCount} users.`);

  const eventIdMap = new Map<string, string>();
  rawEvents.forEach((e, i) => {
    eventIdMap.set(e._id, Object.values(userResult.insertedIds)[i]?.toString() || e._id);
  });

  const mappedEvents = events.map((e, i) => {
    const original = rawEvents[i];
    return {
      ...e,
      createdBy: userResult.insertedIds[i]?.toString() || original.createdBy,
      organizerId: userResult.insertedIds[i]?.toString() || original.organizerId,
    };
  });

  console.log(`Inserting ${mappedEvents.length} events...`);
  const eventResult = await eventCollection.insertMany(mappedEvents as any);
  console.log(`Inserted ${eventResult.insertedCount} events.`);

  console.log("\nSeed completed successfully!");
  console.log(`  Users: ${userResult.insertedCount}`);
  console.log(`  Events: ${eventResult.insertedCount}`);
  console.log("\nDefault password for all users: password123");

  await client.close();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
