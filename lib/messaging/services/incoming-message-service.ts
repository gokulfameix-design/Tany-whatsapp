import {
  debugCall,
  debugValue,
  debugEarlyReturn,
  reportDebug,
  type DebugReporter,
  type DebugStage,
} from "@/lib/messaging/orchestration-debug";
import { runAutomationEvent } from "@/lib/automations/automation-engine";
import { automationAccountReady } from "@/lib/whatsapp/runtime-account";
import { resolveProductSequenceForSend } from "@/lib/whatsapp/catalog";
import { deliverProductSequence } from "@/lib/whatsapp/product-sequence";
import {
  hasEntitlement,
  upgradeRequired,
} from "@/lib/subscriptions/entitlements";
import type { Business, IncomingMessageInput, MessagingReply } from "@/lib/messaging/types";
import { routeMessage } from "@/lib/messaging/router";
import { sendWhatsAppMessage } from "@/lib/messaging/whatsapp";
import { normalizeReply } from "@/lib/messaging/replies";
import {
  normalizeIncomingMessage,
  type IncomingWhatsAppMessage,
} from "@/lib/messaging/incoming";
import { getOrCreateCustomer } from "@/lib/messaging/services/customer-service";
import {
  getOrCreateConversation,
  updateConversationState,
} from "@/lib/messaging/services/conversation-service";
import { saveCustomerLocation } from "@/lib/messaging/services/location-service";
import {
  claimIncomingMessage,
  getPreparedMessageResult,
  getProductSequenceSkips,
  storeProductSequenceSkip,
  hasStoredReply,
  markMessageFailed,
  markMessageProcessed,
  storeOutgoingMessage,
  storePreparedMessageResult,
} from "@/lib/messaging/services/message-service";
import {
  clearPendingWhatsAppIntent,
  createOrReuseLinkSession,
  linkingReply,
  readPendingWhatsAppIntent,
  resolveWhatsAppIdentity,
  touchLinkedCustomer,
  whatsappPhone,
} from "@/lib/messaging/services/identity-service";
import {
  identityMenu,
  identityMenuAction,
  isIdentityGreeting,
  isPrimaryAction,
} from "@/lib/messaging/identity-menu";
import {
  loadSavedCustomer,
  rememberCustomerChoices,
} from "@/lib/messaging/services/saved-customer-service";

export type { IncomingWhatsAppMessage } from "@/lib/messaging/incoming";

export type IncomingMessageDebug = {
  trace?: DebugReporter;
  routed?: (state: string, replyType: string) => void;
  sendSuccess?: () => void;
  sendFailed?: (error: unknown) => void;
};
// Observability must never affect routing, delivery, retries or persistence.
function observe(callback: (() => void) | undefined) {
  try {
    callback?.();
  } catch {
    /* Ignore diagnostics failures. */
  }
}

export async function processIncomingMessage(
  business: Business,
  message: IncomingWhatsAppMessage,
  debug?: IncomingMessageDebug,
) {
  const call = <T>(step: string, action: () => T | Promise<T>) => {
    const stage: DebugStage | undefined =
      step === "resolveWhatsAppIdentity"
        ? "identity"
        : [
              "hasEntitlement",
              "automationAccountReady",
              "runAutomationEvent",
            ].includes(step)
          ? "automation"
          : undefined;
    return debugCall(step, action, debug?.trace, stage);
  };
  const early = <T>(reason: string, value: T) =>
    debugEarlyReturn(reason, value, debug?.trace);
  if (
    !(await call("hasEntitlement", () =>
      hasEntitlement(business.id, "whatsappAutomation"),
    ))
  )
    return early("subscription_required", {
      ...upgradeRequired,
      skipped: "subscription_required",
    });
  if (
    !(await call("automationAccountReady", () =>
      automationAccountReady(business.id, business.whatsappPhoneNumberId),
    ))
  )
    return early("whatsapp_setup_inactive", {
      success: true,
      skipped: "whatsapp_setup_inactive",
    });
  const { from, id: messageId, type } = message;
  if (!from || !messageId || !type)
    throw new Error("Incoming message is missing from, id or type");
  whatsappPhone(from);
  const normalized = debugValue(
    "normalizeIncomingMessage",
    normalizeIncomingMessage(message),
    debug?.trace,
  );
  const input: IncomingMessageInput = normalized.selectionId?.startsWith(
    "auto:",
  )
    ? {
        type: "text" as const,
        text: normalized.selectionTitle ?? normalized.text,
      }
    : normalized;
  input.messageId = messageId;
  const text = input.text;
  const claim = await call("claimIncomingMessage", () =>
    claimIncomingMessage({
      businessId: business.id,
      vertical: business.vertical,
      customerPhone: from,
      messageId,
      type,
      text,
      whatsappTimestamp: message.timestamp ?? null,
      rawMessageType: type,
      ...(input.selectionId === undefined
        ? {}
        : {
            selectionId: input.selectionId,
            selectionTitle: input.selectionTitle,
          }),
      ...(input.location === undefined ? {} : { location: input.location }),
    }),
  );
  if (!claim)
    return early("duplicate_message", {
      success: true,
      skipped: "duplicate_message",
    });

  try {
    const identity = await call("resolveWhatsAppIdentity", () =>
      resolveWhatsAppIdentity(from),
    );
    if (!identity) {
      const token = await call("createOrReuseLinkSession", () =>
        createOrReuseLinkSession(
          from,
          business.id,
          input.type === "text" ? input.text : undefined,
        ),
      );
      const reply = debugValue(
        "normalizeReply.linking",
        normalizeReply(
          debugValue("linkingReply", linkingReply(token), debug?.trace),
        ),
        debug?.trace,
      );
      reportDebug(debug?.trace, "[WA_REPLY_READY]", { step: "linkingReply" });
      // Gate responses never include the link capability or a UID in the HTTP webhook response.
      if (!(await call("hasStoredReply", () => hasStoredReply(messageId)))) {
        const sent = await call("sendWhatsAppMessage", () =>
          sendWhatsAppMessage({
            phoneNumberId: business.whatsappPhoneNumberId,
            to: from,
            reply,
          }),
        ).then(
          (sent) => {
            observe(() => debug?.sendSuccess?.());
            return sent;
          },
          (error) => {
            observe(() => debug?.sendFailed?.(error));
            throw error;
          },
        );
        await call("storeOutgoingMessage", () =>
          storeOutgoingMessage({
            incomingMessageId: messageId,
            businessId: business.id,
            vertical: business.vertical,
            customerPhone: from,
            messageId: sent?.messages?.[0]?.id ?? `reply:${messageId}`,
            type: "interactive",
            text: reply.body,
            body: reply.body,
            replyType: reply.type,
            whatsappTimestamp: null,
          }),
        );
      }
      await call("markMessageProcessed", () => markMessageProcessed(claim));
      return early("account_link_required", {
        success: true,
        businessId: business.id,
        skipped: "account_link_required",
      });
    }
    await call("getOrCreateCustomer", () =>
      getOrCreateCustomer({ businessId: business.id, phone: from }),
    );
    await call("touchLinkedCustomer", () =>
      touchLinkedCustomer(business.id, identity),
    );
    let conversation = await call("getOrCreateConversation", () =>
      getOrCreateConversation({
        businessId: business.id,
        customerPhone: from,
        vertical: business.vertical,
      }),
    );
    // Human ownership pauses automatic replies without replacing any vertical flow.
    if (conversation.status === "handed_off") {
      await call("updateConversationState", () =>
        updateConversationState({
          businessId: business.id,
          customerPhone: from,
          state: conversation.state,
          status: "handed_off",
          lastIncomingText: text,
        }),
      );
      await call("markMessageProcessed", () => markMessageProcessed(claim));
      return early("human_handoff", {
        success: true,
        businessId: business.id,
        skipped: "human_handoff",
      });
    }
    const automationEvent = {
      businessId: business.id,
      customerId: conversation.id,
      conversationId: conversation.id,
      timestamp: new Date().toISOString(),
      payload: { text },
      source: "customer" as const,
    };
    const automated = await call("runAutomationEvent", () =>
      runAutomationEvent({
        ...automationEvent,
        id: `incoming:${messageId}`,
        type: "customer.message.received",
      }),
    );
    reportDebug(debug?.trace, "[WA_AUTOMATION_RESULT]", {
      handled: automated.handled,
      terminal: automated.terminal,
      messageSent: automated.messageSent,
      actionCount: automated.actionCount,
    });
    if (automated.terminal === true) {
      await call("markMessageProcessed", () => markMessageProcessed(claim));
      return early("automation_handled", {
        success: true,
        businessId: business.id,
        skipped: "automation_handled",
      });
    }
    if (input.location) {
      await call("saveCustomerLocation", () =>
        saveCustomerLocation({
          businessId: business.id,
          customerPhone: from,
          location: input.location!,
        }),
      );
      // Refresh context so future flows can consume the newly stored location.
      conversation = await call("getOrCreateConversation", () =>
        getOrCreateConversation({
          businessId: business.id,
          customerPhone: from,
          vertical: business.vertical,
        }),
      );
    }
    const prepared = await call("getPreparedMessageResult", () =>
      getPreparedMessageResult(claim),
    );
    const startRequested = debugValue(
      "isPrimaryAction",
      isPrimaryAction(business.vertical, input),
      debug?.trace,
    );
    const flowInput = startRequested
      ? {
          type: "text" as const,
          text: business.vertical === "eats" ? "START" : "RESET",
        }
      : input;
    const pendingIntent = await call("readPendingWhatsAppIntent", () =>
      readPendingWhatsAppIntent(business.id, from),
    );
    let routed = await debugCall(
      "router",
      async () =>
        prepared ??
        (await call("identityMenuAction", () =>
          identityMenuAction(business, from, input, conversation),
        )) ??
        (await call("routeMessage", () =>
          routeMessage(business, flowInput, {
            debugTrace: debug?.trace,
            customerPhone: from,
            conversation,
            clickFirst: true,
            useRecent: input.selectionId === `${business.vertical}_recent`,
          }),
        )),
      debug?.trace,
      "router",
    );
    // Resume only after the customer explicitly chooses Start. Never auto-confirm or pay.
    if (!prepared && startRequested && pendingIntent) {
      conversation = await call("getOrCreateConversation", () =>
        getOrCreateConversation({
          businessId: business.id,
          customerPhone: from,
          vertical: business.vertical,
        }),
      );
      routed = await debugCall(
        "routeMessage.pendingIntent",
        () =>
          routeMessage(
            business,
            { type: "text", text: pendingIntent },
            {
              customerPhone: from,
              conversation,
              clickFirst: true,
              debugTrace: debug?.trace,
            },
          ),
        debug?.trace,
        "router",
      );
    }
    const greetingName =
      !prepared && isIdentityGreeting(input)
        ? (
            await call("loadSavedCustomer", () =>
              loadSavedCustomer(business.id, from),
            )
          ).name
        : "";
    const result =
      !prepared && isIdentityGreeting(input) && routed.reply.type !== "product_list" && routed.reply.type !== "product_sequence"
        ? {
            ...routed,
            reply: {
              ...debugValue(
                "identityMenu",
                identityMenu(business.vertical),
                debug?.trace,
              ),
              body:
                business.vertical === "eats"
                  ? `${greetingName ? `Hello ${greetingName}.\n` : ""}Welcome to Tany Eats at ${business.name}! Choose an option or type your order.`
                  : `${greetingName ? `Hello ${greetingName}.\n` : ""}${routed.reply.body}\n\nWhat would you like to do?`,
            },
          }
        : routed;
    const normalizedReply = debugValue(
      "normalizeReply",
      normalizeReply(debugValue("router.reply", result.reply, debug?.trace)),
      debug?.trace,
    );
    const reply = normalizedReply.type === "product_sequence"
      ? await call("resolveProductSequenceForSend", () => resolveProductSequenceForSend(business.id, normalizedReply))
      : normalizedReply;
    reportDebug(debug?.trace, "[WA_REPLY_READY]", { step: "normalizeReply" });
    if (!prepared && result.context)
      await call("rememberCustomerChoices", () =>
        rememberCustomerChoices(business.id, from, result.context!),
      );
    observe(() => debug?.routed?.(result.state, reply.type));
    if (!prepared) {
      await call("updateConversationState", () =>
        updateConversationState({
          businessId: business.id,
          customerPhone: from,
          state: result.state,
          status: result.status,
          context: result.context,
          lastIncomingText: text,
          pendingReply: reply.body,
        }),
      );
      await call("storePreparedMessageResult", () =>
        storePreparedMessageResult(claim, { ...result, reply }),
      );
    }
    if (
      pendingIntent &&
      !isIdentityGreeting(input) &&
      !["tany:help", "tany:history"].includes(input.selectionId ?? "") &&
      !/^(help|my orders|my bookings)$/i.test(input.text.trim())
    )
      await call("clearPendingWhatsAppIntent", () =>
        clearPendingWhatsAppIntent(business.id, from, pendingIntent),
      );

    const sequence = reply.type === "product_sequence" ? reply : null;
    const sendReply = async (outgoingReply: MessagingReply, key = "final", index?: number) => {
      const outgoingKey = key === "final" ? messageId : `${messageId}:${key}`;
      if (await call("hasStoredReply", () => hasStoredReply(outgoingKey))) return;
      const sent = await call("sendWhatsAppMessage", () =>
        sendWhatsAppMessage({
          phoneNumberId: business.whatsappPhoneNumberId,
          to: from,
          reply: outgoingReply,
          ...(sequence && outgoingReply.type === "product" ? { sequenceIndex: index } : {}),
        }),
      ).then(
        (sent) => {
          observe(() => debug?.sendSuccess?.());
          return sent;
        },
        (error) => {
          observe(() => debug?.sendFailed?.(error));
          throw error;
        },
      );
      if (reply.type === "product_sequence" && !sent?.messages?.[0]?.id) throw new Error("WhatsApp product sequence send was not confirmed.");
      await call("storeOutgoingMessage", () =>
        storeOutgoingMessage({
          incomingMessageId: outgoingKey,
          businessId: business.id,
          vertical: result.vertical,
          customerPhone: from,
          messageId: sent?.messages?.[0]?.id ?? `reply:${outgoingKey}`,
          type: outgoingReply.type === "text" ? "text" : "interactive",
          text: outgoingReply.body,
          whatsappTimestamp: null,
          replyType: outgoingReply.type,
          body: outgoingReply.body,
          reply: outgoingReply,
        }),
      );
    };
    if (sequence) await deliverProductSequence(sequence, sendReply, {
      skipped: await getProductSequenceSkips(claim),
      isNativeSent: index => hasStoredReply(`${messageId}:catalog:${index}`),
      onSkip: (index, skip) => storeProductSequenceSkip(claim, index, skip),
    });
    else await sendReply(reply);
    await call("markMessageProcessed", () => markMessageProcessed(claim));
    return {
      success: true,
      businessId: business.id,
      vertical: result.vertical,
      state: result.state,
      reply: reply.body,
      structuredReply: reply,
    };
  } catch (error) {
    await call("markMessageFailed", () => markMessageFailed(claim, error));
    throw error;
  }
}
