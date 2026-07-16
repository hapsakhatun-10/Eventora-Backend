import Stripe from "stripe";
import crypto from "crypto";
import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { eventCollection, ticketCollection } from "../db";
import { withAuth } from "../middleware/auth";
import { STRIPE_SECRET_KEY, FRONTEND_URL } from "../config";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-06-24.dahlia" });

function generateTicketCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

const router = Router();

router.post("/checkout", withAuth, async (req: Request, res: Response) => {
  try {
    const { eventId, quantity: rawQty = 1 } = req.body;
    const quantity = Number(rawQty) || 1;

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      res.status(400).json({ message: "Quantity must be between 1 and 10" });
      return;
    }

    if (!eventId || !ObjectId.isValid(eventId)) {
      res.status(400).json({ message: "Invalid event ID" });
      return;
    }

    const event = await eventCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    if (!event.price || event.price <= 0) {
      res.status(400).json({ message: "This is a free event" });
      return;
    }

    if (event.createdBy === req.user!.userId) {
      res.status(400).json({ message: "You cannot book your own event" });
      return;
    }

    if (event.availableSeats < quantity) {
      res.status(400).json({ message: "Not enough seats available" });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: event.title,
              description: `${event.date}${event.startTime ? ` at ${event.startTime}` : ""}${event.venue ? ` - ${event.venue}` : ""}`,
            },
            unit_amount: Math.round(event.price * 100),
          },
          quantity,
        },
      ],
      mode: "payment",
      success_url: `${FRONTEND_URL}/tickets?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/event/${eventId}`,
      metadata: {
        eventId,
        userId: req.user!.userId,
        quantity: String(quantity),
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    const message =
      error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

router.post("/confirm", withAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      res.status(400).json({ message: "Session ID is required" });
      return;
    }

    const existingTicket = await ticketCollection.findOne({
      sessionId,
      userId: req.user!.userId,
      status: "confirmed",
    });
    if (existingTicket) {
      res.json({ ticket: existingTicket, alreadyConfirmed: true });
      return;
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      res.status(400).json({ message: "Payment not completed" });
      return;
    }

    const metadata = session.metadata;
    const eventId = metadata?.eventId;
    const quantity = Number(metadata?.quantity) || 1;
    const ticketId = metadata?.ticketId;

    if (metadata?.userId !== req.user!.userId) {
      res.status(403).json({ message: "This session does not belong to you" });
      return;
    }

    if (!eventId || !ObjectId.isValid(eventId)) {
      res.status(400).json({ message: "Invalid session metadata" });
      return;
    }

    const seatUpdate = await eventCollection.findOneAndUpdate(
      { _id: new ObjectId(eventId), availableSeats: { $gte: quantity } },
      { $inc: { availableSeats: -quantity } } as any,
      { returnDocument: "after" }
    );
    if (!seatUpdate) {
      res.status(400).json({ message: "Not enough seats available" });
      return;
    }

    const ticketCode = generateTicketCode();
    const ticket = {
      userId: req.user!.userId,
      eventId,
      sessionId,
      ticketCode,
      quantity,
      totalPaid: (seatUpdate.price || 0) * quantity,
      status: "confirmed" as const,
      createdAt: new Date().toISOString(),
    };

    try {
      await ticketCollection.insertOne(ticket);
    } catch (err: any) {
      if (err.code === 11000) {
        await eventCollection.updateOne(
          { _id: new ObjectId(eventId) },
          { $inc: { availableSeats: quantity } } as any
        );
        const existing = await ticketCollection.findOne({ sessionId, userId: req.user!.userId });
        res.json({ ticket: existing, alreadyConfirmed: true });
        return;
      }
      throw err;
    }

    if (ticketId && ObjectId.isValid(ticketId)) {
      await ticketCollection.deleteOne({ _id: new ObjectId(ticketId) });
    }

    res.json({ ticket });
  } catch (error) {
    console.error("Confirm reservation error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

router.post("/reserve-free", withAuth, async (req: Request, res: Response) => {
  try {
    const { eventId, quantity: rawQty = 1 } = req.body;
    const quantity = Number(rawQty) || 1;

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      res.status(400).json({ message: "Quantity must be between 1 and 10" });
      return;
    }

    if (!eventId || !ObjectId.isValid(eventId)) {
      res.status(400).json({ message: "Invalid event ID" });
      return;
    }

    const event = await eventCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    if (event.createdBy === req.user!.userId) {
      res.status(400).json({ message: "You cannot reserve your own event" });
      return;
    }

    const existingTicket = await ticketCollection.findOne({
      userId: req.user!.userId,
      eventId,
      status: "confirmed",
    });
    if (existingTicket) {
      res.status(400).json({ message: "You already have a ticket for this event" });
      return;
    }

    const existingPending = await ticketCollection.findOne({
      userId: req.user!.userId,
      eventId,
      status: "pending",
    });
    if (existingPending) {
      res.status(400).json({ message: "You already have a pending booking for this event" });
      return;
    }

    const seatUpdate = await eventCollection.findOneAndUpdate(
      { _id: new ObjectId(eventId), availableSeats: { $gte: quantity } },
      { $inc: { availableSeats: -quantity } } as any,
      { returnDocument: "after" }
    );
    if (!seatUpdate) {
      res.status(400).json({ message: "Not enough seats available" });
      return;
    }

    const ticketCode = generateTicketCode();
    const ticket = {
      userId: req.user!.userId,
      eventId,
      sessionId: "",
      ticketCode,
      quantity,
      totalPaid: 0,
      status: "confirmed" as const,
      createdAt: new Date().toISOString(),
    };

    await ticketCollection.insertOne(ticket);

    res.json({ ticket });
  } catch (error) {
    console.error("Reserve free event error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

router.post("/book", withAuth, async (req: Request, res: Response) => {
  try {
    const { eventId, quantity: rawQty = 1 } = req.body;
    const quantity = Number(rawQty) || 1;

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      res.status(400).json({ message: "Quantity must be between 1 and 10" });
      return;
    }

    if (!eventId || !ObjectId.isValid(eventId)) {
      res.status(400).json({ message: "Invalid event ID" });
      return;
    }

    const event = await eventCollection.findOne({ _id: new ObjectId(eventId) });
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    if (event.createdBy === req.user!.userId) {
      res.status(400).json({ message: "You cannot book your own event" });
      return;
    }

    const existingConfirmed = await ticketCollection.findOne({
      userId: req.user!.userId,
      eventId,
      status: "confirmed",
    });
    if (existingConfirmed) {
      res.status(400).json({ message: "You already have a ticket for this event" });
      return;
    }

    const existingPending = await ticketCollection.findOne({
      userId: req.user!.userId,
      eventId,
      status: "pending",
    });
    if (existingPending) {
      res.status(400).json({ message: "You already have a pending booking for this event" });
      return;
    }

    const ticketCode = generateTicketCode();
    const ticket = {
      userId: req.user!.userId,
      eventId,
      sessionId: "",
      ticketCode,
      quantity,
      totalPaid: 0,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };

    await ticketCollection.insertOne(ticket);

    res.json({ ticket });
  } catch (error) {
    console.error("Book event error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

router.post("/pay-pending", withAuth, async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.body;

    if (!ticketId || !ObjectId.isValid(ticketId)) {
      res.status(400).json({ message: "Invalid ticket ID" });
      return;
    }

    const ticket = await ticketCollection.findOne({
      _id: new ObjectId(ticketId),
      userId: req.user!.userId,
      status: "pending",
    });
    if (!ticket) {
      res.status(404).json({ message: "Pending ticket not found" });
      return;
    }

    const event = await eventCollection.findOne({ _id: new ObjectId(ticket.eventId) });
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    if (event.availableSeats < ticket.quantity) {
      res.status(400).json({ message: "Not enough seats available" });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: event.title,
              description: `${event.date}${event.startTime ? ` at ${event.startTime}` : ""}${event.venue ? ` - ${event.venue}` : ""}`,
            },
            unit_amount: Math.round(event.price * 100),
          },
          quantity: ticket.quantity,
        },
      ],
      mode: "payment",
      success_url: `${FRONTEND_URL}/tickets?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/tickets`,
      metadata: {
        eventId: ticket.eventId,
        userId: req.user!.userId,
        quantity: String(ticket.quantity),
        ticketId: ticket._id!.toString(),
      },
    });

    await ticketCollection.updateOne(
      { _id: new ObjectId(ticketId) },
      { $set: { sessionId: session.id } }
    );

    res.json({ url: session.url });
  } catch (error) {
    console.error("Pay pending error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

router.get("/my-tickets", withAuth, async (req: Request, res: Response) => {
  try {
    const tickets = await ticketCollection
      .find({ userId: req.user!.userId, status: { $in: ["confirmed", "pending"] } })
      .sort({ createdAt: -1 })
      .toArray();

    const eventIds = [...new Set(tickets.map((t) => t.eventId))];
    const validIds = eventIds.filter((id) => ObjectId.isValid(id));
    const events = await eventCollection
      .find({ _id: { $in: validIds.map((id) => new ObjectId(id)) } })
      .toArray();

    const eventMap = new Map(events.map((e) => [e._id!.toString(), e]));

    const ticketsWithEvents = tickets.map((ticket) => ({
      ...ticket,
      event: eventMap.get(ticket.eventId) || null,
    }));

    res.json({ tickets: ticketsWithEvents });
  } catch (error) {
    console.error("Fetch my tickets error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message });
  }
});

router.get("/session/:sessionId", withAuth, async (req: Request, res: Response) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId as string);
    res.json({
      status: session.status,
      payment_status: session.payment_status,
      metadata: session.metadata,
    });
  } catch (error) {
    console.error("Stripe session fetch error:", error);
    res.status(500).json({ message: "Failed to retrieve session" });
  }
});

export default router;
