import type { AutomationInput } from "@/lib/automations/model";
const base = (
  name: string,
  type: AutomationInput["trigger"]["type"],
  text: string,
): AutomationInput => ({
  name,
  description: "Editable starter automation",
  trigger: { type },
  conditions: [],
  actions: [{ type: "text", text }],
});
export const starterTemplates: Record<string, AutomationInput> = {
  welcome: {
    ...base("Welcome Message", "keyword.matched", "Welcome! How can we help?"),
    trigger: { type: "keyword.matched", keywords: ["hi", "hello"] },
    actions: [
      {
        type: "buttons",
        text: "Welcome! How can we help? You can also type your request.",
        choices: ["Start", "Help", "Talk to Staff"],
      },
    ],
  },
  order: base(
    "Order Confirmation",
    "order.created",
    "We have received your order. Our team will confirm the details.",
  ),
  booking: base(
    "Booking Confirmation",
    "booking.created",
    "We have received your booking request.",
  ),
  appointment: {
    ...base(
      "Appointment Reminder",
      "schedule.triggered",
      "This is a reminder about your appointment. Reply if you need help.",
    ),
    trigger: { type: "schedule.triggered", at: "" },
    conditions: [{ type: "booking_status", value: "confirmed" }],
  },
  payment: {
    ...base(
      "Payment Reminder",
      "order.status.changed",
      "Your payment is pending.",
    ),
    conditions: [{ type: "payment_status", value: "pending" }],
    actions: [{ type: "payment_link" }],
  },
  status: base(
    "Order Status Update",
    "order.status.changed",
    "Your order status has been updated. Reply for assistance.",
  ),
  followup: {
    ...base(
      "No Reply Follow-up",
      "conversation.no_reply",
      "Do you still need help? Reply whenever you are ready.",
    ),
    trigger: { type: "conversation.no_reply", hours: 2 },
  },
  feedback: {
    ...base(
      "Feedback Request",
      "booking.status.changed",
      "How was your experience? We'd love your feedback.",
    ),
    conditions: [{ type: "booking_status", value: "completed" }],
  },
  handoff: {
    ...base(
      "Human Handoff",
      "keyword.matched",
      "Our team will help you shortly.",
    ),
    trigger: { type: "keyword.matched", keywords: ["human", "staff", "agent"] },
    actions: [
      { type: "text", text: "Our team will help you shortly." },
      { type: "handoff" },
    ],
  },
  closed: {
    ...base(
      "Business Closed Reply",
      "customer.message.received",
      "We are currently closed. Our team will get back to you.",
    ),
    conditions: [{ type: "time_range", value: "20:00", end: "09:00" }],
  },
};
