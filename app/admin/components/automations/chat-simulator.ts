import type { PreviewMessage } from "./preview-messages";

export type ChatAction = { id: string; label: string };
export type ChatEntry = { id: string; from: "customer" | "business"; text: string; actions?: ChatAction[]; kind?: "text" | "menu" | "order" };

const actions = (...values: [string, string][]): ChatAction[] => values.map(([id, label]) => ({ id, label }));

export function previewScenarioKey(templateId?: string, title?: string, vertical = "eats") {
  const candidate = `${templateId ?? ""} ${title ?? ""}`.toLowerCase();
  if (vertical === "motos") return `motos-${candidate.includes("test drive") ? "test-drive" : candidate.includes("vehicle") ? "vehicle" : "welcome"}`;
  if (vertical === "cabs") return `cabs-${candidate.includes("driver") ? "driver" : candidate.includes("fare") ? "fare" : candidate.includes("trip") ? "trip" : "welcome"}`;
  if (candidate.includes("welcome")) return "welcome";
  if (candidate.includes("confirm")) return "confirm";
  if (candidate.includes("preparing")) return "preparing";
  if (candidate.includes("out_for_delivery") || candidate.includes("out for delivery")) return "delivery";
  if (candidate.includes("delivered")) return "delivered";
  if (candidate.includes("closed")) return "closed";
  if (candidate.includes("no_reply") || candidate.includes("remind")) return "remind";
  if (candidate.includes("payment")) return "payment";
  if (candidate.includes("feedback")) return "feedback";
  if (candidate.includes("handoff") || candidate.includes("talk to staff")) return "staff";
  return "draft";
}

export function initialChat(scenario: string, businessName: string, messages: PreviewMessage[], useTemplateSample: boolean): ChatEntry[] {
  const templateText = messages[0]?.text || "Your message will appear here.";
  const sample = (fallback: string) => useTemplateSample ? fallback : templateText;
  const business = (id: string, text: string, list?: ChatAction[], kind: ChatEntry["kind"] = "text"): ChatEntry => ({ id, from: "business", text, actions: list, kind });
  switch (scenario) {
    case "motos-welcome": return [{ id: "customer-hi", from: "customer", text: "Hi" }, business("motos-welcome", "Welcome to Demo Motors. How can we help?", actions(["motos-browse", "Browse Cars"], ["motos-test-drive", "Book Test Drive"], ["motos-sales", "Talk to Sales"]))];
    case "motos-vehicle": return [business("motos-vehicle", "2019 Tata Nexon XZ+\n₹7,25,000\nAvailable", actions(["motos-test-drive", "Book Test Drive"], ["motos-details", "More Details"]), "order")];
    case "motos-test-drive": return [business("motos-drive", "Choose a test drive time.", actions(["motos-time", "Tomorrow 10:00 AM"], ["motos-sales", "Talk to Sales"]))];
    case "cabs-welcome": return [{ id: "customer-hi", from: "customer", text: "Hi" }, business("cabs-welcome", "Welcome to Demo Cabs. Where would you like to go?", actions(["cabs-book", "Book a Ride"], ["cabs-help", "Need Help"]))];
    case "cabs-fare": return [business("cabs-fare", "Chennai Central to T Nagar\nEstimated fare: ₹320", actions(["cabs-book", "Book Ride"]))];
    case "cabs-driver": return [business("cabs-driver", "Arun is on the way in a Swift (TN 01 AB 1234).", actions(["cabs-track", "Track Ride"]))];
    case "cabs-trip": return [business("cabs-trip", "Your trip is in progress from Chennai Central to T Nagar.", actions(["cabs-track", "Track Ride"]))];
    case "welcome": return [{ id: "customer-hi", from: "customer", text: "Hi" }, business("welcome", sample(`Welcome to ${businessName}! What would you like to do?`), actions(["start-order", "Start Order"], ["my-orders", "My Orders"], ["help", "Help"]))];
    case "confirm": return [{ id: "customer-order", from: "customer", text: "Place order" }, business("confirm", sample("Your order #1024 is confirmed."), actions(["view-order", "View Order"])), business("confirm-next", "We’ll update you when preparation starts.")];
    case "preparing": return [business("preparing", sample("Your order #1024 is being prepared."))];
    case "delivery": return [business("delivery", sample("Your order #1024 is on the way."), actions(["track-order", "Track Order"]))];
    case "delivered": return [business("delivered", sample("Your order #1024 has been delivered."), actions(["rate-order", "Rate Order"]))];
    case "closed": return [{ id: "customer-hi", from: "customer", text: "Hi" }, business("closed", sample(`Thanks for messaging ${businessName}. We’re currently closed.`)), business("closed-hours", "We’ll be available again at 9:00 AM.")];
    case "remind": return [business("remind", sample("Still interested in completing your order?"), actions(["continue-order", "Continue Order"], ["not-now", "Not Now"]))];
    case "payment": return [business("payment", sample("Payment is still pending for order #1024."), actions(["pay-now", "Pay Now"], ["view-order", "View Order"]))];
    case "feedback": return [business("feedback", sample("How was your order?"), actions(["great", "⭐ Great"], ["okay", "🙂 Okay"], ["need-help", "Need Help"]))];
    case "staff": return [{ id: "customer-staff", from: "customer", text: "Talk to staff" }, business("staff", sample("A team member will continue this conversation.")), business("staff-paused", "Automated replies are paused.")];
    default: return messages.map((message, index) => business(`draft-${index}`, message.text, message.choices?.map((label, choiceIndex) => ({ id: `draft-${index}-${choiceIndex}`, label })), message.kind === "list" ? "menu" : "text"));
  }
}

export function continueChat(action: ChatAction): ChatEntry[] {
  const customer: ChatEntry = { id: `customer-${action.id}`, from: "customer", text: action.label };
  const reply = (id: string, text: string, next?: ChatAction[], kind: ChatEntry["kind"] = "text"): ChatEntry => ({ id, from: "business", text, actions: next, kind });
  switch (action.id) {
    case "motos-browse": return [customer, reply("motos-list", "Available vehicle\n2019 Tata Nexon XZ+\n₹7,25,000", actions(["motos-test-drive", "Book Test Drive"], ["motos-details", "More Details"]), "order")];
    case "motos-test-drive": return [customer, reply("motos-times", "Choose a sample test drive time.", actions(["motos-time", "Tomorrow 10:00 AM"], ["motos-sales", "Talk to Sales"]))];
    case "motos-time": return [customer, reply("motos-confirm", "Your sample test drive is booked for tomorrow at 10:00 AM.")];
    case "motos-details": return [customer, reply("motos-detail", "2019 Tata Nexon XZ+\n₹7,25,000\nAvailable")];
    case "motos-sales": return [customer, reply("motos-sales-reply", "A sales specialist will continue this conversation.")];
    case "cabs-book": return [customer, reply("cabs-pickup", "Pickup: Chennai Central\nDrop: T Nagar\nEstimated fare: ₹320", actions(["cabs-confirm", "Confirm Ride"], ["cabs-help", "Need Help"]), "order")];
    case "cabs-confirm": return [customer, reply("cabs-confirmed", "Your sample ride is confirmed. Arun will arrive in a Swift (TN 01 AB 1234).", actions(["cabs-track", "Track Ride"]))];
    case "cabs-track": return [customer, reply("cabs-tracking", "Arun is arriving shortly. Your trip will continue to T Nagar.")];
    case "cabs-help": return [customer, reply("cabs-help-reply", "A support team member will help shortly.")];
    case "start-order": return [customer, reply("choose-menu", "Welcome to Tany Eats! What would you like to order?", actions(["chicken", "Chicken Biriyani"], ["mutton", "Mutton Biriyani"], ["dosa", "Dosa"], ["idli", "Idli"]), "menu")];
    case "my-orders": return [customer, reply("latest-order", "Here’s your latest order\nOrder #1024\nPreparing\n₹420", actions(["view-order", "View Order"], ["track-order", "Track Order"]), "order")];
    case "help": return [customer, reply("help-menu", "How can we help?", actions(["talk-staff", "Talk to Staff"], ["order-help", "Order Help"], ["payment-help", "Payment Help"]))];
    case "chicken": case "mutton": case "dosa": case "idli": return [customer, reply("cart", `${action.label} added to your sample cart.`, actions(["view-cart", "View Cart"], ["more-items", "More Items"], ["checkout", "Checkout"]))];
    case "view-order": return [customer, reply("order-detail", "Order #1024 is being prepared.", actions(["track-order", "Track Order"]))];
    case "track-order": return [customer, reply("tracking", "Your order is with the kitchen. We’ll let you know when it is on the way.")];
    case "rate-order": return [customer, reply("rating", "Thanks. Choose a rating for this sample order.", actions(["great", "⭐ Great"], ["okay", "🙂 Okay"], ["need-help", "Need Help"]))];
    case "talk-staff": return [customer, reply("staff-help", "A team member will continue this conversation."), reply("staff-pause", "Automated replies are paused.")];
    case "order-help": return [customer, reply("order-help-reply", "We can help with your sample order. A team member will reply shortly.")];
    case "payment-help": return [customer, reply("payment-help-reply", "We can help with payment for order #1024. A team member will reply shortly.")];
    case "pay-now": return [customer, reply("pay", "This would open the existing secure payment link in WhatsApp. No payment is made in this preview.")];
    case "great": case "okay": case "need-help": return [customer, reply("feedback-thanks", action.id === "need-help" ? "Thanks. A team member will help shortly." : "Thanks for your feedback.")];
    case "continue-order": case "more-items": return [customer, reply("more-menu", "Here are more sample menu items.", actions(["mutton", "Mutton Biriyani"], ["dosa", "Dosa"], ["idli", "Idli"]), "menu")];
    case "not-now": return [customer, reply("not-now-reply", "No problem. We’ll be here when you’re ready.")];
    case "view-cart": return [customer, reply("cart-detail", "Sample cart\nChicken Biriyani · ₹220\nTotal · ₹220", actions(["checkout", "Checkout"], ["more-items", "More Items"]), "order")];
    case "checkout": return [customer, reply("checkout-reply", "This would continue to the existing checkout flow. Nothing happens in this preview.")];
    default: return [customer, reply(`reply-${action.id}`, "Thanks. This is a sample response for the preview.")];
  }
}
