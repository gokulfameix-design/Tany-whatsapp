import { debugCall } from "@/lib/messaging/orchestration-debug";
import { handleEatsCommerce } from "@/lib/messaging/flows/eats-commerce";
import { handleSportMessage } from "@/lib/messaging/flows/sport";
import { handleGamingMessage } from "@/lib/messaging/flows/gaming";
import { handleExpertMessage } from "@/lib/messaging/flows/expert";
import { handleMeatMessage } from "@/lib/messaging/flows/meat";
import { handleMedsMessage } from "@/lib/messaging/flows/meds";
import { handleGarageMessage } from "@/lib/messaging/flows/garage";
import { handleEcomMessage } from "@/lib/messaging/flows/ecom";
import { handleRetailMessage } from "@/lib/messaging/flows/retail";
import { handleCabsMessage } from "@/lib/messaging/flows/cabs";
import { handleEatsMessage } from "@/lib/messaging/flows/eats";
import { handleSalonMessage } from "@/lib/messaging/flows/salon";
import { handleMotosMessage } from "@/lib/messaging/flows/motos";
import { isTanyVertical } from "@/lib/messaging/vertical-config";
import { runClickFirst } from "@/lib/messaging/click-first";
import { saveCustomerMenu } from "@/lib/messaging/services/saved-customer-service";
import { catalogMenuReply } from "@/lib/whatsapp/catalog";
import { getAvailableCatalogItems } from "@/lib/messaging/services/catalog-service";
import { listReply } from "@/lib/messaging/replies";
import type {
  Business,
  FlowContext,
  FlowResult,
  IncomingMessageInput,
} from "@/lib/messaging/types";

export async function routeMessage(
  business: Business,
  input: string | IncomingMessageInput,
  context?: FlowContext,
): Promise<FlowResult> {
  if (!isTanyVertical(business.vertical)) {
    throw new Error(`Unsupported Tany vertical for business ${business.id}`);
  }
  const incoming =
    typeof input === "string" ? { type: "text" as const, text: input } : input;
  const flowContext = { ...context, business, incoming };
  const finish = async (result: FlowResult): Promise<FlowResult> => {
    const menuRequested = incoming.selectionId
      ? ["eats_start_order", "eats_shop_order", "eats_shop_menu", "eats_shop_continue"].includes(incoming.selectionId)
      : incoming.type === "text" && /^(start|start order|order now|order|view menu|menu|continue shopping)$/i.test(incoming.text.trim());
    if (business.vertical !== "eats" || !menuRequested) return result;
    if (result.reply.type === "product_sequence" && result.reply.products.length >= 1) {
      // Entry points load the whole menu, rather than the Firestore list page.
      const reply = await catalogMenuReply(business.id, await getAvailableCatalogItems(business.id), result.reply.fallback);
      return { ...result, reply, context: { ...result.context, eatsCommerce: true } };
    }
    if (!["text", "buttons", "list"].includes(result.reply.type)) return result;
    const fallback = result.reply.type === "buttons" ? listReply({ body: result.reply.body, buttonText: "View menu", sections: [{ rows: result.reply.buttons.map(button => ({ id: button.id, title: button.title })) }] }) : result.reply;
    if (fallback.type !== "text" && fallback.type !== "buttons" && fallback.type !== "list") return result;
    const reply = await debugCall("catalogMenuReply.entry", async () => catalogMenuReply(business.id, await getAvailableCatalogItems(business.id), fallback), context?.debugTrace, "catalog");
    return (reply.type === "product_list" || reply.type === "product_sequence") ? { ...result, reply, context: { ...result.context, eatsCommerce: true } } : { ...result, reply };
  };
  const handlers = {
    eats: (message: IncomingMessageInput) =>
      handleEatsMessage(message.text, flowContext),
    salon: (message: IncomingMessageInput) =>
      handleSalonMessage(message, flowContext),
    motos: (message: IncomingMessageInput) =>
      handleMotosMessage(message, flowContext),
    cabs: (message: IncomingMessageInput) =>
      handleCabsMessage(message, flowContext),
    retail: (message: IncomingMessageInput) =>
      handleRetailMessage(message, flowContext),
    ecom: (message: IncomingMessageInput) =>
      handleEcomMessage(message, flowContext),
    garage: (message: IncomingMessageInput) =>
      handleGarageMessage(message, flowContext),
    meds: (message: IncomingMessageInput) =>
      handleMedsMessage(message, flowContext),
    meat: (message: IncomingMessageInput) =>
      handleMeatMessage(message, flowContext),
    expert: (message: IncomingMessageInput) =>
      handleExpertMessage(message, flowContext),
    gaming: (message: IncomingMessageInput) =>
      handleGamingMessage(message, flowContext),
    sport: (message: IncomingMessageInput) =>
      handleSportMessage(message, flowContext),
  };
  const dispatch = (message: IncomingMessageInput) => {
    flowContext.incoming = message;
    return handlers[business.vertical](message);
  };
  if (business.vertical === "eats" && context?.customerPhone) {
    const commerce = await debugCall(
      "handleEatsCommerce",
      () => handleEatsCommerce(business, incoming, flowContext),
      context?.debugTrace,
      "catalog",
    );
    if (commerce) return finish(commerce);
  }
  if (!context?.clickFirst) return finish(await dispatch(incoming));
  const result = await runClickFirst(business, incoming, flowContext, dispatch);
  const { _clickMenu, ...businessContext } = result.context ?? {};
  if (context.customerPhone)
    await saveCustomerMenu(
      business.id,
      context.customerPhone,
      _clickMenu ?? null,
    );
  return finish({ ...result, context: businessContext });
}
