import { validatePlaceholders } from "@/lib/automations/placeholders";
export const triggerOptions = {
  "customer.message.received": "Customer message received",
  "keyword.matched": "Keyword matched",
  "order.created": "New order created",
  "order.status.changed": "Order status changed",
  "booking.created": "New booking created",
  "booking.status.changed": "Booking status changed",
  "payment.completed": "Payment completed",
  "conversation.no_reply": "No customer reply",
  "schedule.triggered": "Scheduled date/time",
  "conversation.started": "Conversation started",
} as const;
export type TriggerType = keyof typeof triggerOptions;
export const conditionOptions = {
  business_hours: "Business hours",
  customer_type: "New / returning customer",
  order_status: "Order status",
  booking_status: "Booking status",
  payment_status: "Payment status",
  keyword: "Message contains keyword",
  tag: "Customer tag",
  day: "Day of week",
  time_range: "Time range",
} as const;
export const actionOptions = {
  text: "Send text message",
  buttons: "Send WhatsApp buttons",
  list: "Send WhatsApp list",
  template: "Send template",
  location: "Ask for location",
  payment_link: "Send payment link",
  handoff: "Assign to human",
  tag: "Add customer tag",
  state: "Update conversation state",
  delay: "Wait / delay",
  end: "End automation",
} as const;
export type Condition = {
  type: keyof typeof conditionOptions;
  value: string;
  end?: string;
};
export type Action = {
  type: keyof typeof actionOptions;
  text?: string;
  choices?: string[];
  templateId?: string;
  parameters?: string[];
  value?: string;
  minutes?: number;
};
export type AutomationInput = {
  name: string;
  description: string;
  trigger: {
    type: TriggerType;
    keywords?: string[];
    hours?: number;
    at?: string;
  };
  conditions: Condition[];
  actions: Action[];
};
export type Automation = AutomationInput & {
  id: string;
  businessId: string;
  status: "draft" | "active" | "paused";
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
};
export type AutomationEvent = {
  id: string;
  type: Exclude<TriggerType, "keyword.matched">;
  businessId: string;
  customerId: string;
  conversationId?: string;
  entityId?: string;
  timestamp: string;
  payload: Record<string, unknown>;
  source?: "domain" | "customer" | "scheduler";
};
export type Run = {
  id: string;
  automationId: string;
  businessId: string;
  trigger: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  actionsExecuted: number;
  error: string | null;
};
export function validateAutomation(input: unknown): AutomationInput {
  const raw = input as AutomationInput;
  if (
    !raw ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    raw.name.length > 120 ||
    typeof raw.description !== "string" ||
    raw.description.length > 1000
  )
    throw new Error(
      "Enter a name (up to 120 characters) and a short description.",
    );
  if (!raw.trigger || !Object.hasOwn(triggerOptions, raw.trigger.type))
    throw new Error("Choose a supported trigger.");
  const trigger: AutomationInput["trigger"] = { type: raw.trigger.type };
  if (trigger.type === "keyword.matched") {
    if (
      !Array.isArray(raw.trigger.keywords) ||
      !raw.trigger.keywords.length ||
      raw.trigger.keywords.length > 20 ||
      raw.trigger.keywords.some(
        (k) =>
          typeof k !== "string" ||
          !k.trim() ||
          !/[\p{L}\p{N}]/u.test(k) ||
          k.length > 80,
      )
    )
      throw new Error("Add 1?20 keywords, up to 80 characters each.");
    trigger.keywords = [
      ...new Set(raw.trigger.keywords.map((k) => k.trim().toLowerCase())),
    ];
  }
  if (trigger.type === "conversation.no_reply") {
    if (
      !Number.isFinite(raw.trigger.hours) ||
      raw.trigger.hours! < 1 ||
      raw.trigger.hours! > 720
    )
      throw new Error("No-reply hours must be between 1 and 720.");
    trigger.hours = raw.trigger.hours;
  }
  if (trigger.type === "schedule.triggered") {
    if (!raw.trigger.at || !Number.isFinite(Date.parse(raw.trigger.at)))
      throw new Error("Choose a valid scheduled date/time.");
    trigger.at = new Date(raw.trigger.at).toISOString();
  }
  if (
    !Array.isArray(raw.conditions) ||
    raw.conditions.length > 20 ||
    !Array.isArray(raw.actions) ||
    !raw.actions.length ||
    raw.actions.length > 20
  )
    throw new Error("Use up to 20 conditions and 1?20 actions.");
  const conditions = raw.conditions.map((c) => {
    if (
      !c ||
      !Object.hasOwn(conditionOptions, c.type) ||
      typeof c.value !== "string" ||
      c.value.length > 120 ||
      typeof (c.end ?? "") !== "string"
    )
      throw new Error("Check the condition values.");
    if (
      ["time_range", "business_hours"].includes(c.type) &&
      (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.value) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.end ?? ""))
    )
      throw new Error("Enter start and end time in HH:MM format.");
    if (c.type === "customer_type" && !["new", "returning"].includes(c.value))
      throw new Error("Choose new or returning.");
    if (c.type === "day" && !/^[0-6](,[0-6])*$/.test(c.value))
      throw new Error(
        "Use day numbers 0?6, separated by commas (Sunday is 0).",
      );
    if (!["business_hours", "time_range"].includes(c.type) && !c.value.trim())
      throw new Error("Enter a condition value.");
    return {
      type: c.type,
      value: c.value.trim(),
      ...(c.end ? { end: c.end } : {}),
    };
  });
  const actions = raw.actions.map((a) => {
    if (!a || !Object.hasOwn(actionOptions, a.type))
      throw new Error("Choose a supported action.");
    const action: Action = { type: a.type };
    if (["text", "buttons", "list", "location"].includes(a.type)) {
      if (
        typeof a.text !== "string" ||
        !a.text.trim() ||
        a.text.length > (a.type === "text" ? 4096 : 1024)
      )
        throw new Error("Add a message within WhatsApp's length limit.");
      action.text = a.text.trim();
    }
    if (["buttons", "list"].includes(a.type)) {
      const max = a.type === "buttons" ? 3 : 10;
      const length = a.type === "buttons" ? 20 : 24;
      if (
        !Array.isArray(a.choices) ||
        !a.choices.length ||
        a.choices.length > max ||
        a.choices.some(
          (v) =>
            typeof v !== "string" || !v.trim() || Array.from(v).length > length,
        ) ||
        new Set(a.choices.map((v) => v.trim().toLowerCase())).size !==
          a.choices.length
      )
        throw new Error(
          `Use 1?${max} unique choices, up to ${length} characters each.`,
        );
      action.choices = a.choices.map((v) => v.trim());
    }
    if (a.type === "template") {
      if (
        typeof a.templateId !== "string" ||
        !a.templateId.trim() ||
        a.templateId.includes("/")
      )
        throw new Error("Choose an approved template.");
      if (
        !Array.isArray(a.parameters ?? []) ||
        (a.parameters ?? []).length > 20 ||
        (a.parameters ?? []).some(
          (p) => typeof p !== "string" || !p.trim() || p.length > 1000,
        )
      )
        throw new Error("Check template parameters.");
      action.templateId = a.templateId;
      action.parameters = a.parameters ?? [];
    }
    if (["tag", "state"].includes(a.type)) {
      if (
        typeof a.value !== "string" ||
        !/^[a-zA-Z0-9 _:-]{1,80}$/.test(a.value)
      )
        throw new Error("Use a short tag or state name.");
      action.value = a.value;
    }
    if (a.type === "delay") {
      if (!Number.isInteger(a.minutes) || a.minutes! < 1 || a.minutes! > 43200)
        throw new Error("Delay must be 1?43,200 minutes.");
      action.minutes = a.minutes;
    }
    if (action.text) validatePlaceholders(action.text);
    action.parameters?.forEach(validatePlaceholders);
    if (action.choices?.some((c) => c.includes("{{") || c.includes("}}")))
      throw new Error(
        "Use placeholders in message text or template parameters, not choice labels.",
      );
    return action;
  });
  return {
    name: raw.name.trim(),
    description: raw.description.trim(),
    trigger,
    conditions,
    actions,
  };
}
