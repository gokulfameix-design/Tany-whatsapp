import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { routeMessage } from "@/lib/messaging/router";
import type { Business } from "@/lib/messaging/types";
import { getOrCreateCustomer } from "@/lib/messaging/services/customer-service";
import { getOrCreateConversation, updateConversationState } from "@/lib/messaging/services/conversation-service";
import { getOrder } from "@/lib/messaging/services/order-service";
import { saveCustomerLocation, type LocationInput } from "@/lib/messaging/services/location-service";
import { customerDocumentId } from "@/lib/messaging/services/shared";

function parseLocation(value: unknown): LocationInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.latitude !== "number" || !Number.isFinite(data.latitude) || Math.abs(data.latitude) > 90 ||
      typeof data.longitude !== "number" || !Number.isFinite(data.longitude) || Math.abs(data.longitude) > 180 ||
      (data.address !== undefined && data.address !== null && typeof data.address !== "string") ||
      (data.label !== undefined && data.label !== null && typeof data.label !== "string")) return null;
  return { latitude: data.latitude, longitude: data.longitude, address: data.address as string | null | undefined, label: data.label as string | null | undefined, source: "manual" };
}

export async function POST(req: NextRequest) {
  // Check before parsing or performing any Firestore operations.
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  }
  const { businessId, customerPhone, message, location: locationValue } = body as Record<string, unknown>;
  if (typeof businessId !== "string" || typeof customerPhone !== "string" || typeof message !== "string" ||
      (!message.trim() && locationValue === undefined)) {
    return NextResponse.json({ error: "businessId, customerPhone and message are required strings" }, { status: 400 });
  }
  try { customerDocumentId(businessId, customerPhone); }
  catch { return NextResponse.json({ error: "Invalid businessId or customerPhone" }, { status: 400 }); }
  const location = locationValue === undefined ? null : parseLocation(locationValue);
  if (locationValue !== undefined && !location) {
    return NextResponse.json({ error: "location must contain valid latitude/longitude and optional address/label" }, { status: 400 });
  }

  try {
    const snapshot = await adminDb.collection("businesses").doc(businessId).get();
    if (!snapshot.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
    const data = snapshot.data();
    if (data?.vertical !== "eats" || data.active !== true) {
      return NextResponse.json({ error: "An active Eats business is required" }, { status: 400 });
    }
    if (typeof data.name !== "string" || typeof data.whatsappPhoneNumberId !== "string") {
      return NextResponse.json({ error: "Invalid business configuration" }, { status: 400 });
    }
    const business: Business = {
      id: snapshot.id, name: data.name, vertical: "eats",
      whatsappPhoneNumberId: data.whatsappPhoneNumberId, active: true,
    };
    const key = { businessId, customerPhone };
    await getOrCreateCustomer({ businessId, phone: customerPhone });
    let conversation = await getOrCreateConversation({ ...key, vertical: "eats" });
    // Optional manual coordinates allow the whole flow to be tested without Meta.
    if (location) {
      await saveCustomerLocation({ ...key, location });
      conversation = await getOrCreateConversation({ ...key, vertical: "eats" });
    }
    const result = await routeMessage(business, message, { customerPhone, conversation });
    const saved = await updateConversationState({
      ...key, state: result.state, status: result.status, context: result.context,
      lastIncomingText: message, pendingReply: result.reply.body,
    });
    const orderId = typeof saved.context.orderId === "string" ? saved.context.orderId : undefined;
    const order = orderId ? await getOrder(orderId) : null;
    return NextResponse.json({
      ...key, state: saved.state, reply: result.reply.body, structuredReply: result.reply, context: saved.context,
      ...(orderId ? { orderId } : {}),
      ...(order?.paymentId ? { paymentId: order.paymentId } : {}),
    });
  } catch (error) {
    console.error("Development Eats test error:", error);
    return NextResponse.json({ error: "Eats test failed; see the development server log" }, { status: 500 });
  }
}
