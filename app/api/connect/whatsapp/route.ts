import { EntitlementError } from "@/lib/subscriptions/entitlements";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import {
  completeDemoLinkSession,
  completeLinkSession,
  inspectLinkSession,
  LinkingError,
  notifyAccountLinked,
} from "@/lib/messaging/services/identity-service";

import { demoAuthEnabled } from "@/lib/messaging/auth-mode";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const response = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers });
export async function POST(request: NextRequest) {
  // Next may normalize request.url to an internal hostname. Compare the browser
  // origin to the actual HTTP Host instead; do not trust X-Forwarded-Host.
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    const parsed = new URL(origin ?? "");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    sameOrigin = parsed.origin === origin && parsed.host === host &&
      (parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)));
  } catch { /* Malformed/missing origins are rejected. */ }
  if (!sameOrigin)
    return response({ error: "Invalid request origin." }, 403);
  let uid = "";
  if (!demoAuthEnabled()) {
    const credential = request.headers
      .get("authorization")
      ?.match(/^Bearer ([^ ]+)$/)?.[1];
    if (!credential)
      return response({ error: "Please sign in to continue." }, 401);
    try {
      const verified = await adminAuth.verifyIdToken(credential, true);
      if (verified.firebase.sign_in_provider === "anonymous")
        return response({ error: "Sign in to a Tany account to continue." }, 401);
      uid = verified.uid;
    } catch {
      return response(
        { error: "Your sign-in has expired. Please sign in again." },
        401,
      );
    }
  }
  try {
    const input: unknown = await request.json();
    if (
      !input ||
      typeof input !== "object" ||
      !("token" in input) ||
      typeof input.token !== "string" ||
      !("action" in input)
    )
      return response({ error: "Invalid link request." }, 400);
    if (input.action === "inspect") {
      const session = await inspectLinkSession(input.token);
      return response({ phone: `+${session.whatsappPhone}` });
    }
    if (input.action !== "confirm")
      return response({ error: "Invalid link request." }, 400);
    const scope = demoAuthEnabled()
      ? await completeDemoLinkSession(input.token)
      : await completeLinkSession(input.token, uid);
    let notificationSent = false;
    try {
      notificationSent = await notifyAccountLinked(input.token, scope);
    } catch {
      /* Link is already committed; do not invite duplicate confirmation. */
    }
    return response({ ok: true, notificationSent });
  } catch (error) {
    if (error instanceof EntitlementError) return response(error.details, 403);
    if (error instanceof LinkingError) {
      const messages = {
        invalid:
          "This link is invalid. Send a WhatsApp message for a new link.",
        expired:
          "This link has expired. Send a WhatsApp message for a new link.",
        used: "This link has already been used. Return to WhatsApp.",
        conflict:
          "This WhatsApp number is already connected to another account. Relinking is not available.",
        unavailable: "This business is currently unavailable.",
      };
      return response(
        { error: messages[error.code] },
        error.code === "conflict" ? 409 : 400,
      );
    }
    return response(
      { error: "Could not connect your account. Please try again." },
      503,
    );
  }
}
