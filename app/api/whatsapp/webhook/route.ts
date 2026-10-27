import {
  debugCall,
  debugValue,
  reportDebug,
  type DebugReporter,
} from "@/lib/messaging/orchestration-debug";
import { recordDeliveryReceipts } from "@/lib/admin/delivery-receipts";
import { NextRequest, NextResponse } from "next/server";
import { findBusinessByPhoneNumberId } from "@/lib/messaging/business";
import { processIncomingMessage } from "@/lib/messaging/services/incoming-message-service";
import {
  safeWhatsAppDebugText,
  safeWhatsAppError,
} from "@/lib/messaging/debug-log";
import { verifyWhatsAppSignature } from "@/lib/messaging/webhook-signature";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const trace: DebugReporter = (marker, details) =>
    console.info(marker, details);
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    const appSecret = process.env.META_APP_SECRET;
    console.info("[WA_SIGNATURE_CHECK]", {
      hasHeader: Boolean(signature),
      hasAppSecret: Boolean(appSecret),
    });
    if (!appSecret && process.env.NODE_ENV === "production") {
      console.error("[WA_WEBHOOK_ERROR]", {
        error: "WhatsApp webhook signature validation is not configured.",
      });
      reportDebug(trace, "[WA_EARLY_RETURN]", {
        reason: "signature_configuration_missing",
      });
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp webhook signature validation is not configured.",
        },
        { status: 503 },
      );
    }
    if (!verifyWhatsAppSignature(rawBody, signature, appSecret ?? "")) {
      console.info("[WA_SIGNATURE_INVALID]");
      reportDebug(trace, "[WA_EARLY_RETURN]", { reason: "invalid_signature" });
      return NextResponse.json(
        { success: false, error: "Invalid webhook signature." },
        { status: 401 },
      );
    }
    console.info("[WA_SIGNATURE_VALID]");
    const body = (() => {
      try {
        return JSON.parse(rawBody);
      } catch {
        // JSON parser errors can include raw payload fragments.
        throw new Error("Invalid webhook JSON.");
      }
    })();

    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    console.info("[WA_WEBHOOK_RECEIVED]", {
      eventType: safeWhatsAppDebugText(body?.entry?.[0]?.changes?.[0]?.field),
      phoneNumberId: safeWhatsAppDebugText(value?.metadata?.phone_number_id),
      from: safeWhatsAppDebugText(message?.from),
      messageType: safeWhatsAppDebugText(message?.type),
      textOrSelectionTitle: safeWhatsAppDebugText(
        message?.type === "text"
          ? message?.text?.body
          : message?.interactive?.type === "button_reply"
            ? message?.interactive?.button_reply?.title
            : message?.interactive?.type === "list_reply"
              ? message?.interactive?.list_reply?.title
              : message?.type === "button"
                ? message?.button?.text
                : null,
        true,
      ),
    });

    if (Array.isArray(value?.statuses) && value?.metadata?.phone_number_id) {
      const receiptBusiness = debugValue(
        "findBusinessByPhoneNumberId.receipts",
        await findBusinessByPhoneNumberId(value.metadata.phone_number_id),
        trace,
      );
      if (receiptBusiness)
        await recordDeliveryReceipts(receiptBusiness.id, value.statuses);
    }

    if (!message) {
      reportDebug(trace, "[WA_EARLY_RETURN]", {
        reason: "no_incoming_message",
      });
      return NextResponse.json({ success: true });
    }

    const receivedPhoneNumberId = value?.metadata?.phone_number_id;

    if (!receivedPhoneNumberId) {
      reportDebug(trace, "[WA_EARLY_RETURN]", {
        reason: "missing_phone_number_id",
      });
      return NextResponse.json({
        success: true,
        skipped: "missing_phone_number_id",
      });
    }

    const business = debugValue(
      "findBusinessByPhoneNumberId",
      await findBusinessByPhoneNumberId(receivedPhoneNumberId),
      trace,
    );

    if (!business) {
      reportDebug(trace, "[WA_EARLY_RETURN]", { reason: "business_not_found" });
      console.info("[WA_BUSINESS_NOT_FOUND]", {
        phoneNumberId: safeWhatsAppDebugText(receivedPhoneNumberId),
      });
      return NextResponse.json({
        success: true,
        skipped: "business_not_found",
      });
    }

    console.info("[WA_BUSINESS_FOUND]", {
      businessId: safeWhatsAppDebugText(business.id),
      vertical: safeWhatsAppDebugText(business.vertical),
    });
    const result = await debugCall(
      "processIncomingMessage",
      () =>
        processIncomingMessage(business, message, {
          trace,
          routed: (state, replyType) =>
            console.info("[WA_ROUTED]", {
              state: safeWhatsAppDebugText(state),
              replyType: safeWhatsAppDebugText(replyType),
            }),
          sendSuccess: () => console.info("[WA_SEND_SUCCESS]"),
          sendFailed: (error) =>
            console.error("[WA_SEND_FAILED]", {
              error: safeWhatsAppError(error),
            }),
        }),
      trace,
    );
    if (result == null || (!("reply" in result) && !("skipped" in result)))
      reportDebug(trace, "[WA_EARLY_RETURN]", { reason: "no_reply" });
    return NextResponse.json(result);
  } catch (error) {
    reportDebug(trace, "[WA_EARLY_RETURN]", { reason: "webhook_error" });
    console.error("[WA_WEBHOOK_ERROR]", { error: safeWhatsAppError(error) });

    return NextResponse.json(
      {
        success: false,
        error: "WhatsApp message processing failed.",
      },
      { status: 500 },
    );
  }
}
