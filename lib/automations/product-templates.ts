import type { TanyVertical } from "@/lib/messaging/types";
import type {
  AutomationInput,
  Action,
  Condition,
} from "@/lib/automations/model";
import { isTanyVertical } from "@/lib/messaging/vertical-config";
export type ProductAutomationTemplate = AutomationInput & {
  id: string;
  vertical: TanyVertical;
  category: string;
  recommended: boolean;
  active: boolean;
};
type Product = {
  welcome: string;
  primary: string;
  entity: "order" | "booking";
  completion: string;
  followup: string;
};
const products: Record<TanyVertical, Product> = {
  motos: {
    welcome: "Welcome & Browse Cars",
    primary: "Browse Cars",
    entity: "booking",
    completion: "completed",
    followup: "your vehicle enquiry",
  },
  eats: {
    welcome: "Welcome & Start Order",
    primary: "Start Order",
    entity: "order",
    completion: "delivered",
    followup: "your food order",
  },
  cabs: {
    welcome: "Welcome & Book Ride",
    primary: "Book Ride",
    entity: "booking",
    completion: "completed",
    followup: "your ride",
  },
  ecom: {
    welcome: "Welcome & Shop",
    primary: "Shop / Get Quote",
    entity: "order",
    completion: "delivered",
    followup: "your shopping request",
  },
  expert: {
    welcome: "Welcome & Consult",
    primary: "Book Consultation",
    entity: "booking",
    completion: "completed",
    followup: "your consultation",
  },
  gaming: {
    welcome: "Welcome & Book Session",
    primary: "Book Session",
    entity: "booking",
    completion: "completed",
    followup: "your gaming session",
  },
  garage: {
    welcome: "Welcome & Book Service",
    primary: "Book Service",
    entity: "booking",
    completion: "completed",
    followup: "your vehicle service",
  },
  meat: {
    welcome: "Welcome & Order Meat",
    primary: "Order Meat",
    entity: "order",
    completion: "delivered",
    followup: "your meat order",
  },
  meds: {
    welcome: "Welcome & Find Product",
    primary: "Find Product",
    entity: "order",
    completion: "delivered",
    followup: "your product request",
  },
  retail: {
    welcome: "Welcome & Shop Products",
    primary: "Shop Products",
    entity: "order",
    completion: "delivered",
    followup: "your shopping order",
  },
  salon: {
    welcome: "Welcome & Book",
    primary: "Book Appointment",
    entity: "booking",
    completion: "completed",
    followup: "your appointment",
  },
  sport: {
    welcome: "Welcome & Book Activity",
    primary: "Book Activity",
    entity: "booking",
    completion: "completed",
    followup: "your activity booking",
  },
};
const text = (value: string): Action[] => [{ type: "text", text: value }];
const template = (
  vertical: TanyVertical,
  key: string,
  name: string,
  description: string,
  category: string,
  trigger: AutomationInput["trigger"],
  actions: Action[],
  conditions: Condition[] = [],
  recommended = false,
): ProductAutomationTemplate => ({
  id: `${vertical}_${key}`,
  vertical,
  name,
  description,
  category,
  recommended,
  active: true,
  trigger,
  conditions,
  actions,
});
const keyword = (
  vertical: TanyVertical,
  key: string,
  name: string,
  description: string,
  keywords: string[],
  message: string,
  tag: string,
) =>
  template(
    vertical,
    key,
    name,
    description,
    "Enquiries",
    { type: "keyword.matched", keywords },
    [...text(message), { type: "tag", value: tag }],
  );
const confirmation = (vertical: TanyVertical, name: string) => {
  const p = products[vertical];
  return template(
    vertical,
    "confirmation",
    name,
    "Notify customers only after their request is confirmed.",
    "Confirmations",
    { type: `${p.entity}.status.changed` },
    text(
      p.entity === "order"
        ? "Your order {{order_id}} with {{business_name}} is confirmed."
        : "Your booking with {{business_name}} is confirmed for {{booking_date}} at {{booking_time}}.",
    ),
    [
      {
        type: p.entity === "order" ? "order_status" : "booking_status",
        value: "confirmed",
      },
    ],
    true,
  );
};
const reminder = (vertical: TanyVertical, key: string, name: string) =>
  template(
    vertical,
    key,
    name,
    "Choose a reminder date/time before publishing. Sends only for a confirmed booking with a saved date and time.",
    "Reminders",
    { type: "schedule.triggered", at: "" },
    text(
      "Reminder from {{business_name}}: your booking is on {{booking_date}} at {{booking_time}}. Reply if you need help.",
    ),
    [{ type: "booking_status", value: "confirmed" }],
  );
const orderStatus = (
  vertical: TanyVertical,
  key: string,
  name: string,
  status: string,
  message: string,
) =>
  template(
    vertical,
    key,
    name,
    `Notify customers when their order changes to ${status.replaceAll("_", " ")}.`,
    "Order updates",
    { type: "order.status.changed" },
    text(message),
    [{ type: "order_status", value: status }],
  );
function common(vertical: TanyVertical) {
  const p = products[vertical];
  return [
    template(
      vertical,
      "welcome",
      "Welcome",
      "Greet customers with your business name and a useful next step.",
      "Common",
      { type: "keyword.matched", keywords: ["hi", "hello"] },
      [
        {
          type: "buttons",
          text: "Welcome to {{business_name}}! How can we help? You can also type your request.",
          choices: [
            p.primary,
            p.entity === "order" ? "My Orders" : "My Bookings",
            "Help",
          ],
        },
      ],
    ),
    template(
      vertical,
      "closed",
      "Business Closed",
      "Reply outside your opening hours. Edit the default 20:00-09:00 hours before publishing.",
      "Common",
      { type: "customer.message.received" },
      text(
        "Thanks for contacting {{business_name}}. We are currently closed. Our team will reply when we reopen.",
      ),
      [{ type: "time_range", value: "20:00", end: "09:00" }],
    ),
    template(
      vertical,
      "no_reply",
      "No Reply Follow-up",
      `Follow up once when a customer has not replied about ${p.followup}. Uses the existing reply-window safeguards.`,
      "Common",
      { type: "conversation.no_reply", hours: 2 },
      text(
        `Checking in from {{business_name}} about ${p.followup}. Do you still need help?`,
      ),
    ),
    template(
      vertical,
      "payment",
      "Payment Reminder",
      "Send only an existing valid payment link for this customer's pending payment. No payment link is created.",
      "Common",
      { type: `${p.entity}.status.changed` },
      [{ type: "payment_link" }],
      [{ type: "payment_status", value: "pending" }],
    ),
    template(
      vertical,
      "feedback",
      "Feedback",
      `Ask for feedback after ${p.followup} is ${p.completion}.`,
      "Common",
      { type: `${p.entity}.status.changed` },
      text(
        `Thank you for choosing {{business_name}} for ${p.followup}. How was your experience?`,
      ),
      [
        {
          type: p.entity === "order" ? "order_status" : "booking_status",
          value: p.completion,
        },
      ],
    ),
    template(
      vertical,
      "handoff",
      "Human Handoff",
      "Let customers ask for staff. Bot replies stay paused until staff resumes the conversation.",
      "Common",
      {
        type: "keyword.matched",
        keywords: ["human", "staff", "agent", "talk to staff"],
      },
      [
        ...text("The {{business_name}} team will help you shortly."),
        { type: "handoff" },
      ],
    ),
  ];
}
function specific(vertical: TanyVertical): ProductAutomationTemplate[] {
  const p = products[vertical];
  const welcome = template(
    vertical,
    "welcome_product",
    p.welcome,
    `Welcome customers and offer ${p.primary.toLowerCase()}, recent requests or help.`,
    "Welcome",
    { type: "keyword.matched", keywords: ["hi", "hello"] },
    [
      {
        type: "buttons",
        text: "Welcome to {{business_name}}! Choose below or type your request.",
        choices: [
          p.primary,
          p.entity === "order" ? "My Orders" : "My Bookings",
          "Help",
        ],
      },
    ],
    [],
    true,
  );
  const followup = (key: string, name: string, hours = 4, tag?: string) =>
    template(
      vertical,
      key,
      name,
      tag
        ? `Follow up on confirmed bookings tagged ${tag} by staff. Does not infer a missed appointment.`
        : `Follow up on unanswered messages about ${p.followup}.`,
      "Follow-ups",
      { type: "conversation.no_reply", hours },
      text(`Hello from {{business_name}}. Can we help with ${p.followup}?`),
      tag
        ? [
            { type: "booking_status", value: "confirmed" },
            { type: "tag", value: tag },
          ]
        : [],
    );
  switch (vertical) {
    case "salon":
      return [
        welcome,
        confirmation(vertical, "Booking Confirmation"),
        reminder(vertical, "appointment_reminder", "Appointment Reminder"),
        followup(
          "missed_appointment",
          "Missed Appointment Follow-up",
          24,
          "missed_appointment",
        ),
      ];
    case "eats":
      return [
        welcome,
        confirmation(vertical, "Order Confirmation"),
        orderStatus(
          vertical,
          "preparing",
          "Preparing",
          "preparing",
          "{{business_name}} is preparing your order {{order_id}}.",
        ),
        orderStatus(
          vertical,
          "out_for_delivery",
          "Out for Delivery",
          "out_for_delivery",
          "Your order {{order_id}} from {{business_name}} is out for delivery.",
        ),
        orderStatus(
          vertical,
          "delivered",
          "Delivered",
          "delivered",
          "Your order {{order_id}} from {{business_name}} has been delivered.",
        ),
      ];
    case "motos":
      return [
        welcome,
        keyword(
          vertical,
          "vehicle_enquiry",
          "Vehicle Enquiry",
          "Collect vehicle enquiries for the dealership team.",
          ["car", "vehicle"],
          "Welcome to {{business_name}}. Share a model or budget, or choose Browse Cars.",
          "vehicle_enquiry",
        ),
        confirmation(vertical, "Test Drive Booking"),
        reminder(vertical, "test_drive_reminder", "Test Drive Reminder"),
        keyword(
          vertical,
          "price_enquiry",
          "Price Enquiry",
          "Route pricing enquiries to your dealership team.",
          ["price", "cost"],
          "The {{business_name}} team can help with pricing. Which vehicle are you interested in?",
          "price_enquiry",
        ),
        keyword(
          vertical,
          "finance_enquiry",
          "Finance Enquiry",
          "Collect finance enquiries without promising approval or rates.",
          ["finance", "loan", "emi"],
          "The {{business_name}} team can discuss available finance options. Which vehicle are you considering?",
          "finance_enquiry",
        ),
        followup("lead_followup", "Lead Follow-up"),
      ];
    case "cabs":
      return [
        welcome,
        confirmation(vertical, "Ride Confirmation"),
        reminder(vertical, "ride_reminder", "Pickup Reminder"),
        keyword(
          vertical,
          "fare_enquiry",
          "Fare Enquiry",
          "Ask for route details before estimating a fare.",
          ["fare", "price"],
          "Share pickup and destination with {{business_name}} so we can help with a fare estimate.",
          "fare_enquiry",
        ),
        followup("ride_followup", "Ride Follow-up"),
      ];
    case "ecom":
      return [
        welcome,
        keyword(
          vertical,
          "quote_enquiry",
          "Quote Enquiry",
          "Collect purchase requirements and budget.",
          ["quote", "bulk"],
          "Welcome to {{business_name}}. Tell us the product, quantity and budget for your quote.",
          "quote_enquiry",
        ),
        confirmation(vertical, "Order Confirmation"),
        orderStatus(
          vertical,
          "dispatch",
          "Order Dispatched",
          "out_for_delivery",
          "Your order {{order_id}} from {{business_name}} is on its way.",
        ),
        orderStatus(
          vertical,
          "delivered",
          "Delivery Confirmation",
          "delivered",
          "Your order {{order_id}} from {{business_name}} has been delivered.",
        ),
      ];
    case "expert":
      return [
        welcome,
        confirmation(vertical, "Consultation Confirmation"),
        reminder(vertical, "consultation_reminder", "Consultation Reminder"),
        keyword(
          vertical,
          "service_enquiry",
          "Consultation Enquiry",
          "Help customers choose an appropriate service.",
          ["consultation", "expert", "service"],
          "Tell {{business_name}} what kind of consultation you need. Our team will help with available services.",
          "consultation_enquiry",
        ),
        followup("consultation_followup", "Consultation Follow-up"),
      ];
    case "gaming":
      return [
        welcome,
        confirmation(vertical, "Session Confirmation"),
        reminder(vertical, "session_reminder", "Session Reminder"),
        keyword(
          vertical,
          "station_enquiry",
          "Station Availability",
          "Collect console or station preferences without promising availability.",
          ["console", "station", "availability"],
          "Which console or station would you like at {{business_name}}? Share your preferred date and time.",
          "station_enquiry",
        ),
        followup("session_followup", "Session Follow-up"),
      ];
    case "garage":
      return [
        welcome,
        confirmation(vertical, "Service Booking Confirmation"),
        reminder(vertical, "service_reminder", "Service Reminder"),
        keyword(
          vertical,
          "estimate_enquiry",
          "Repair Estimate Enquiry",
          "Collect vehicle and service details before quoting.",
          ["repair", "estimate", "quote"],
          "Share your vehicle and service needs with {{business_name}} so our team can help with an estimate.",
          "repair_enquiry",
        ),
        followup("service_followup", "Service Follow-up"),
      ];
    case "meat":
      return [
        welcome,
        confirmation(vertical, "Order Confirmation"),
        keyword(
          vertical,
          "cut_enquiry",
          "Cut & Weight Enquiry",
          "Help customers choose item, cut and weight.",
          ["cut", "weight"],
          "Tell {{business_name}} your preferred meat, cut and weight. Our team will help with availability.",
          "cut_enquiry",
        ),
        orderStatus(
          vertical,
          "preparing",
          "Order Preparing",
          "preparing",
          "{{business_name}} is preparing your order {{order_id}}.",
        ),
        orderStatus(
          vertical,
          "delivery",
          "Out for Delivery",
          "out_for_delivery",
          "Your order {{order_id}} from {{business_name}} is out for delivery.",
        ),
      ];
    case "meds":
      return [
        welcome,
        keyword(
          vertical,
          "product_enquiry",
          "Product Availability",
          "Ask about product availability only. Does not diagnose, recommend treatment or prescribe.",
          ["product", "stock", "availability"],
          "Share the product name with {{business_name}} to check availability. We cannot diagnose or prescribe.",
          "product_enquiry",
        ),
        keyword(
          vertical,
          "prescription",
          "Prescription Assistance",
          "Ask staff about prescription requirements without advising on medicine use.",
          ["prescription"],
          "The {{business_name}} pharmacy team can explain prescription requirements for your requested product. Do not send sensitive medical details here.",
          "prescription_assistance",
        ),
        confirmation(vertical, "Order Confirmation"),
        orderStatus(
          vertical,
          "delivery",
          "Delivery Update",
          "out_for_delivery",
          "Your order {{order_id}} from {{business_name}} is out for delivery.",
        ),
      ];
    case "retail":
      return [
        welcome,
        keyword(
          vertical,
          "product_enquiry",
          "Product & Variant Enquiry",
          "Collect product, size or colour preferences.",
          ["product", "size", "colour", "color"],
          "Which product or variant would you like from {{business_name}}? Share your preference and quantity.",
          "product_enquiry",
        ),
        confirmation(vertical, "Order Confirmation"),
        orderStatus(
          vertical,
          "ready",
          "Order Ready",
          "ready",
          "Your order {{order_id}} from {{business_name}} is ready.",
        ),
        orderStatus(
          vertical,
          "delivery",
          "Delivery Update",
          "out_for_delivery",
          "Your order {{order_id}} from {{business_name}} is out for delivery.",
        ),
      ];
    case "sport":
      return [
        welcome,
        confirmation(vertical, "Activity Booking Confirmation"),
        reminder(vertical, "activity_reminder", "Activity Reminder"),
        keyword(
          vertical,
          "venue_enquiry",
          "Venue & Class Enquiry",
          "Collect activity and venue or class preferences.",
          ["venue", "class", "activity"],
          "Which activity, venue or class are you interested in at {{business_name}}? Share your preferred date and time.",
          "activity_enquiry",
        ),
        followup("activity_followup", "Activity Follow-up"),
      ];
  }
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
// Private source catalogue: every caller receives an independent copy.
const catalogue = Object.fromEntries(
  (Object.keys(products) as TanyVertical[]).map((v) => [
    v,
    [...specific(v), ...common(v)],
  ]),
) as Record<TanyVertical, ProductAutomationTemplate[]>;
export function templatesForVertical(
  vertical: unknown,
): ProductAutomationTemplate[] {
  return isTanyVertical(vertical)
    ? copy(catalogue[vertical].filter((t) => t.active))
    : [];
}
export function cloneProductTemplate(
  vertical: unknown,
  templateId: string,
  now = Date.now(),
): AutomationInput {
  const source = templatesForVertical(vertical).find(
    (t) => t.id === templateId,
  );
  if (!source) throw new Error("Template is unavailable for this product.");
  const { name, description, trigger, conditions, actions } = source;
  // A draft must have a valid date. It is never active until reviewed and published.
  if (trigger.type === "schedule.triggered")
    trigger.at = new Date(now + 86400000).toISOString();
  return copy({ name, description, trigger, conditions, actions });
}
