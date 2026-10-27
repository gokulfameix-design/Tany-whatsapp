import type { ProductAutomationTemplate } from "@/lib/automations/product-templates";

export const eatsFilters = ["Recommended", "Orders", "Payments", "Support", "All"] as const;
export type EatsFilter = (typeof eatsFilters)[number];
type CardCopy = { name: string; category: "Orders" | "Payments" | "Support"; recommended?: boolean; when: string; does: string };
const copy: Record<string, CardCopy> = {
  eats_welcome_product: { name: "Welcome Customer", category: "Support", recommended: true, when: "Customer sends their first message", does: "Sends a welcome message and shows Start Order, My Orders and Help" },
  eats_confirmation: { name: "Confirm Order", category: "Orders", recommended: true, when: "An order is confirmed", does: "Sends the customer an order confirmation" },
  eats_preparing: { name: "Preparing Order", category: "Orders", when: "The kitchen starts preparing the order", does: "Lets the customer know their order is being prepared" },
  eats_out_for_delivery: { name: "Out for Delivery", category: "Orders", when: "Delivery starts", does: "Notifies the customer that the order is on the way" },
  eats_delivered: { name: "Order Delivered", category: "Orders", when: "The order is marked delivered", does: "Sends a delivery confirmation" },
  eats_closed: { name: "We’re Closed", category: "Support", when: "A customer messages outside business hours", does: "Sends an automatic closed-hours reply" },
  eats_no_reply: { name: "Remind Customer", category: "Support", when: "A customer has not replied or completed the next step", does: "Sends one friendly reminder" },
  eats_payment: { name: "Payment Reminder", category: "Payments", recommended: true, when: "A payment is still pending", does: "Reminds the customer using the existing valid payment link" },
  eats_feedback: { name: "Ask for Feedback", category: "Support", when: "An order is delivered", does: "Asks the customer for a rating or feedback" },
  eats_handoff: { name: "Talk to Staff", category: "Support", when: "A customer asks for human help", does: "Pauses bot replies and hands the conversation to staff" },
};
// Presentation only: keep the original template object for draft creation.
export function eatsTemplateCards(templates: ProductAutomationTemplate[], filter: EatsFilter) {
  return Object.entries(copy).flatMap(([id, display]) => {
    const template = templates.find(t => t.id === id && t.vertical === "eats" && t.active);
    return template && (filter === "All" || (filter === "Recommended" ? display.recommended : display.category === filter))
      ? [{ template, display }] : [];
  });
}
