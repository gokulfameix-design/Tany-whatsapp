import { eatsOrderingMenu } from "@/lib/messaging/flows/eats-commerce";
import "server-only";
import { buttonReply } from "@/lib/messaging/replies";
import type {
  Business,
  ConversationState,
  FlowResult,
  IncomingMessageInput,
} from "@/lib/messaging/types";
import { listRecentCustomerRequests } from "@/lib/messaging/services/customer-history-service";

const bookings = new Set([
  "motos",
  "salon",
  "cabs",
  "garage",
  "expert",
  "gaming",
  "sport",
]);
export const verticalPrimaryActions: Record<
  Business["vertical"],
  { id: string; title: string }
> = {
  motos: { id: "motos_browse", title: "Browse Cars" },
  eats: { id: "eats_start_order", title: "Start Order" },
  cabs: { id: "cabs_book_ride", title: "Book Ride" },
  ecom: { id: "ecom_shop", title: "Shop / Get Quote" },
  expert: { id: "expert_book", title: "Book Consultation" },
  gaming: { id: "gaming_book", title: "Book Session" },
  garage: { id: "garage_book", title: "Book Service" },
  meat: { id: "meat_order", title: "Order Meat" },
  meds: { id: "meds_find", title: "Find Product" },
  retail: { id: "retail_shop", title: "Shop Products" },
  salon: { id: "salon_book", title: "Book Appointment" },
  sport: { id: "sport_book", title: "Book Activity" },
};
export function isPrimaryAction(
  vertical: Business["vertical"],
  input: IncomingMessageInput,
) {
  return (
    input.selectionId === "tany:start" ||
    input.selectionId === `${vertical}_recent` ||
    input.selectionId === verticalPrimaryActions[vertical].id ||
    (!input.selectionId &&
      (input.text.trim().toLowerCase() ===
        verticalPrimaryActions[vertical].title.toLowerCase() ||
        /^(start order|start booking|book appointment|browse cars)$/i.test(
          input.text.trim(),
        )))
  );
}
export function identityMenu(vertical: Business["vertical"]) {
  if (vertical === "eats") return eatsOrderingMenu();
  const start = verticalPrimaryActions[vertical];
  const history = bookings.has(vertical) ? "My Bookings" : "My Orders";
  return buttonReply({
    body: "What would you like to do?",
    buttons: [
      { id: start.id, title: start.title },
      {
        id: `${vertical}_history`,
        title: history,
      },
      { id: `${vertical}_help`, title: "Help" },
    ],
  });
}
export function isIdentityGreeting(input: IncomingMessageInput) {
  return input.type === "text" && /^(hi|hello|start)$/i.test(input.text.trim());
}
/** Shared account menu handling; the vertical handlers remain the owners of order/booking logic. */
export async function identityMenuAction(
  business: Business,
  phone: string,
  input: IncomingMessageInput,
  conversation: ConversationState,
): Promise<FlowResult | null> {
  const command =
    input.selectionId === `${business.vertical}_history`
      ? "tany:history"
      : input.selectionId === `${business.vertical}_help`
        ? "tany:help"
        : (input.selectionId ?? input.text.trim().toLowerCase());
  if (
    ![
      "tany:help",
      "tany:history",
      "help",
      "my orders",
      "my bookings",
      "tany:test-drive",
      "book test drive",
    ].includes(command)
  )
    return null;
  let body =
    "Choose Start to begin, or type your request. Reply RESET to restart or CANCEL to cancel an unfinished request.";
  if (["tany:history", "my orders", "my bookings"].includes(command)) {
    const collection = bookings.has(business.vertical) ? "bookings" : "orders";
    const rows = await listRecentCustomerRequests(
      business.id,
      phone,
      collection === "bookings" ? "booking" : "order",
    );
    body = rows.length
      ? rows
          .map((row) => `${row.title}: ${row.status.replaceAll("_", " ")}`)
          .join("\n")
      : `No ${collection} found for this WhatsApp number at ${business.name}.`;
  }
  if (command === "tany:test-drive" || command === "book test drive")
    body =
      "Browse cars first, select a vehicle, then choose Book Test Drive. Type a model or budget to browse.";
  return {
    state: conversation.state,
    context: conversation.context,
    status: conversation.status,
    vertical: business.vertical,
    originalText: input.text,
    reply: ["tany:history", "my orders", "my bookings"].includes(command)
      ? buttonReply({
          body,
          buttons: [
            {
              id: verticalPrimaryActions[business.vertical].id,
              title: verticalPrimaryActions[business.vertical].title,
            },
            { id: `${business.vertical}_recent`, title: "Use recent choice" },
            { id: `${business.vertical}_help`, title: "Help" },
          ],
        })
      : { ...identityMenu(business.vertical), body },
  };
}
