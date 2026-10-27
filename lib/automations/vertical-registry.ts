import type { Action, AutomationInput, Condition, TriggerType } from "@/lib/automations/model";

export type ActiveAutomationVertical = "eats" | "motos" | "cabs";
export type VerticalTemplate = AutomationInput & { id: string; vertical: ActiveAutomationVertical; category: string; recommended: boolean; active: boolean };
export type VerticalDataAdapter = { entity: "order" | "vehicle" | "ride"; hooks: readonly string[] };
type VerticalDefinition = {
  label: string; description: string; supportedTriggers: readonly string[]; supportedActions: readonly string[];
  automationTriggers: readonly TriggerType[]; automationActions: readonly Action["type"][];
  featureFlags: Readonly<Record<string, boolean>>; adapter: VerticalDataAdapter; templates: readonly VerticalTemplate[];
};

const text = (text: string): Action[] => [{ type: "text", text }];
const make = (vertical: ActiveAutomationVertical, key: string, name: string, description: string, category: string, trigger: AutomationInput["trigger"], actions: Action[], recommended = false): VerticalTemplate => ({ id: `${vertical}_${key}`, vertical, name, description, category, recommended, active: true, trigger, conditions: [], actions });
const status = (vertical: ActiveAutomationVertical, key: string, name: string, description: string, state: string, message: string, entity: "order" | "booking" = "order"): VerticalTemplate => ({ ...make(vertical, key, name, description, entity === "order" ? "Orders" : "Rides", { type: `${entity}.status.changed` as TriggerType }, text(message)), conditions: [{ type: (entity === "order" ? "order_status" : "booking_status") as Condition["type"], value: state }] });

const eats: VerticalTemplate[] = [
  make("eats", "welcome_product", "Welcome Customer", "Greet customers and show ordering choices.", "Recommended", { type: "customer.message.received" }, [{ type: "buttons", text: "Welcome to {{business_name}}! What would you like to do?", choices: ["Start Order", "My Orders", "Help"] }], true),
  make("eats", "start_order", "Start Order", "Show the menu when a customer is ready to order.", "Orders", { type: "keyword.matched", keywords: ["start", "order"] }, [{ type: "list", text: "Choose a menu category.", choices: ["Menu", "My Orders", "Help"] }]),
  status("eats", "confirmation", "Confirm Order", "Confirm an accepted order.", "confirmed", "Your order {{order_id}} is confirmed.", "order"),
  status("eats", "preparing", "Preparing Order", "Tell customers when preparation starts.", "preparing", "Your order {{order_id}} is being prepared."),
  status("eats", "out_for_delivery", "Out for Delivery", "Tell customers their order is on the way.", "out_for_delivery", "Your order {{order_id}} is out for delivery."),
  status("eats", "delivered", "Order Delivered", "Confirm delivery.", "delivered", "Your order {{order_id}} has been delivered."),
  make("eats", "payment", "Payment Reminder", "Send the existing payment link only when payment is pending.", "Payments", { type: "order.status.changed" }, [{ type: "payment_link" }], true),
  make("eats", "feedback", "Ask for Feedback", "Ask for a rating after delivery.", "Support", { type: "order.status.changed" }, [{ type: "buttons", text: "How was your order?", choices: ["Great", "Okay", "Need Help"] }]),
  make("eats", "closed", "We’re Closed", "Reply outside business hours.", "Support", { type: "customer.message.received" }, text("Thanks for messaging {{business_name}}. We’re currently closed.")),
  make("eats", "handoff", "Talk to Staff", "Pause replies and hand the conversation to staff.", "Support", { type: "keyword.matched", keywords: ["staff", "help"] }, [...text("A team member will help shortly."), { type: "handoff" }]),
];
const motos: VerticalTemplate[] = [
  make("motos", "welcome_lead", "Welcome Lead", "Welcome a vehicle buyer.", "Recommended", { type: "customer.message.received" }, [{ type: "buttons", text: "Welcome to {{business_name}}. How can we help?", choices: ["Browse Cars", "Book Test Drive", "Talk to Sales"] }], true),
  make("motos", "vehicle_details", "Vehicle Details", "Share details for a selected vehicle.", "Vehicles", { type: "keyword.matched", keywords: ["vehicle", "details"] }, text("2019 Tata Nexon XZ+ is available for ₹7,25,000.")),
  make("motos", "vehicle_availability", "Vehicle Availability", "Confirm whether a vehicle is available.", "Vehicles", { type: "keyword.matched", keywords: ["available", "availability"] }, text("The 2019 Tata Nexon XZ+ is currently available.")),
  make("motos", "test_drive", "Book Test Drive", "Help a lead request a test drive.", "Test drives", { type: "keyword.matched", keywords: ["test drive"] }, [{ type: "buttons", text: "Choose a test drive time.", choices: ["Tomorrow 10:00 AM", "Tomorrow 3:00 PM", "Talk to Sales"] }], true),
  make("motos", "test_drive_confirmation", "Test Drive Confirmation", "Confirm the test drive appointment.", "Test drives", { type: "booking.status.changed" }, text("Your test drive is confirmed for 28 October at 10:00 AM.")),
  make("motos", "finance", "Finance Enquiry", "Send a safe finance enquiry response.", "Finance", { type: "keyword.matched", keywords: ["finance", "loan"] }, text("Our sales team can discuss finance options for your selected vehicle.")),
  make("motos", "lead_followup", "Follow Up Lead", "Follow up with an inactive lead.", "Follow-up", { type: "conversation.no_reply", hours: 24 }, text("Still interested in the 2019 Tata Nexon XZ+?")),
  make("motos", "vehicle_sold", "Vehicle Sold", "Let a lead know a selected vehicle has sold.", "Vehicles", { type: "keyword.matched", keywords: ["sold"] }, text("This vehicle has sold. We can show similar options.")),
  make("motos", "similar_vehicles", "Suggest Similar Vehicles", "Offer comparable available vehicles.", "Vehicles", { type: "keyword.matched", keywords: ["similar"] }, text("We can suggest similar available vehicles within your budget.")),
  make("motos", "handoff", "Talk to Sales", "Assign a lead to the sales team.", "Support", { type: "keyword.matched", keywords: ["sales", "staff"] }, [...text("A sales specialist will continue this conversation."), { type: "handoff" }]),
];
const cabs: VerticalTemplate[] = [
  make("cabs", "welcome_rider", "Welcome Rider", "Welcome a rider and offer booking choices.", "Recommended", { type: "customer.message.received" }, [{ type: "buttons", text: "Welcome to {{business_name}}. Where would you like to go?", choices: ["Book a Ride", "Track Ride", "Need Help"] }], true),
  make("cabs", "book_ride", "Book a Ride", "Collect pickup and drop locations.", "Rides", { type: "keyword.matched", keywords: ["ride", "book"] }, [{ type: "location", text: "Please share your pickup location." }]),
  make("cabs", "fare_estimate", "Fare Estimate", "Show a fare estimate for the selected route.", "Rides", { type: "keyword.matched", keywords: ["fare", "estimate"] }, [{ type: "buttons", text: "Chennai Central to T Nagar is estimated at ₹320.", choices: ["Book Ride", "Change Route"] }]),
  make("cabs", "ride_confirmed", "Ride Confirmed", "Confirm a booked ride.", "Rides", { type: "booking.status.changed" }, text("Your ride from Chennai Central to T Nagar is confirmed.")),
  make("cabs", "driver_assigned", "Driver Assigned", "Share assigned driver details.", "Rides", { type: "booking.status.changed" }, text("Arun is on the way in a Swift (TN 01 AB 1234).")),
  make("cabs", "driver_arriving", "Driver Arriving", "Tell a rider their driver is arriving.", "Rides", { type: "booking.status.changed" }, text("Arun will arrive shortly in the Swift (TN 01 AB 1234).")),
  make("cabs", "trip_started", "Trip Started", "Notify when a trip starts.", "Rides", { type: "booking.status.changed" }, text("Your trip has started.")),
  make("cabs", "trip_completed", "Trip Completed", "Confirm trip completion.", "Rides", { type: "booking.status.changed" }, text("Your trip is complete. Fare: ₹320.")),
  make("cabs", "payment", "Payment Reminder", "Send the existing pending payment link.", "Payments", { type: "booking.status.changed" }, [{ type: "payment_link" }]),
  make("cabs", "help", "Need Help", "Hand a ride issue to support.", "Support", { type: "keyword.matched", keywords: ["help", "support"] }, [...text("A support team member will help shortly."), { type: "handoff" }]),
];

export const verticalRegistry: Record<ActiveAutomationVertical, VerticalDefinition> = {
  eats: { label: "Tany Eats", description: "Order and delivery automations", supportedTriggers: ["customer.message", "order.created", "order.confirmed", "order.preparing", "order.out_for_delivery", "order.delivered", "payment.pending", "business.closed"], supportedActions: ["send_text", "buttons", "list", "wait", "assign_staff", "pause_automation", "payment_cta", "location", "end", "show_menu", "show_order_status", "feedback"], automationTriggers: ["customer.message.received", "keyword.matched", "order.created", "order.status.changed", "booking.created", "booking.status.changed", "payment.completed", "conversation.no_reply", "schedule.triggered", "conversation.started"], automationActions: ["text", "buttons", "list", "template", "location", "payment_link", "handoff", "tag", "state", "delay", "end"], featureFlags: { catalog: true, booking: false, ride: false }, adapter: { entity: "order", hooks: ["menu", "order_status", "payment"] }, templates: eats },
  motos: { label: "Tany Motos", description: "Vehicle leads and test-drive automations", supportedTriggers: ["customer.message", "lead.created", "vehicle.enquiry", "test_drive.requested", "test_drive.confirmed", "finance.enquiry", "vehicle.sold", "lead.inactive"], supportedActions: ["send_text", "buttons", "list", "wait", "assign_staff", "pause_automation", "end", "show_vehicle", "send_vehicle_details", "request_test_drive", "finance_cta", "suggest_alternatives", "assign_sales_staff"], automationTriggers: ["customer.message.received", "keyword.matched", "booking.created", "booking.status.changed", "conversation.no_reply"], automationActions: ["text", "buttons", "list", "delay", "handoff", "end"], featureFlags: { catalog: false, vehicle_cards: true, test_drive: true, ride: false }, adapter: { entity: "vehicle", hooks: ["vehicle", "test_drive", "finance"] }, templates: motos },
  cabs: { label: "Tany Cabs", description: "Ride booking and trip-status automations", supportedTriggers: ["customer.message", "ride.requested", "ride.confirmed", "driver.assigned", "driver.arriving", "trip.started", "trip.completed", "payment.pending", "ride.cancelled"], supportedActions: ["send_text", "buttons", "list", "wait", "assign_staff", "pause_automation", "payment_cta", "location", "end", "collect_pickup", "collect_drop", "show_fare_estimate", "show_driver_details", "show_trip_status"], automationTriggers: ["customer.message.received", "keyword.matched", "booking.created", "booking.status.changed", "conversation.no_reply"], automationActions: ["text", "buttons", "list", "delay", "handoff", "payment_link", "location", "end"], featureFlags: { catalog: false, test_drive: false, ride: true, location: true }, adapter: { entity: "ride", hooks: ["pickup", "drop", "fare", "driver", "trip_status"] }, templates: cabs },
};
export function isActiveAutomationVertical(value: unknown): value is ActiveAutomationVertical { return typeof value === "string" && Object.hasOwn(verticalRegistry, value); }
export function getVerticalDefinition(vertical: unknown) { return isActiveAutomationVertical(vertical) ? verticalRegistry[vertical] : null; }
export function templatesForRegisteredVertical(vertical: unknown): VerticalTemplate[] { const definition = getVerticalDefinition(vertical); return definition ? JSON.parse(JSON.stringify(definition.templates)) : []; }
export function assertVerticalAutomationAllowed(vertical: unknown, input: AutomationInput) { const definition = getVerticalDefinition(vertical); if (!definition) return input; if (!definition.automationTriggers.includes(input.trigger.type)) throw new Error("This trigger is not available for this product."); if (input.actions.some(action => !definition.automationActions.includes(action.type))) throw new Error("This action is not available for this product."); return input; }
