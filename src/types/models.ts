import { ObjectId } from "mongodb";

export interface UserDocument {
  _id?: ObjectId;
  name: string;
  email: string;
  password?: string;
  avatar?: string;
  provider?: string;
  createdAt: string;
}

export interface EventDocument {
  _id?: ObjectId;
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
  createdBy: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface TicketDocument {
  _id?: ObjectId;
  userId: string;
  eventId: string;
  sessionId?: string;
  ticketCode: string;
  quantity: number;
  totalPaid: number;
  status: "confirmed" | "cancelled" | "pending";
  createdAt: string;
}

export interface FollowDocument {
  _id?: ObjectId;
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface FavoriteDocument {
  _id?: ObjectId;
  userId: string;
  eventId: string;
  createdAt: string;
}
