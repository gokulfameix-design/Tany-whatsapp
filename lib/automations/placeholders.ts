export const automationPlaceholders = [
  "business_name",
  "customer_name",
  "order_id",
  "booking_date",
  "booking_time",
  "amount",
] as const;
export type Placeholder = (typeof automationPlaceholders)[number];
const pattern = /\{\{\s*([^{}]*?)\s*\}\}/g;
export function validatePlaceholders(text: string) {
  const remainder = text.replace(pattern, (_token, name: string) => {
    if (!(automationPlaceholders as readonly string[]).includes(name.trim()))
      throw new Error(
        `Unsupported placeholder: ${name.trim()}. Use only supported automation placeholders.`,
      );
    return "";
  });
  if (remainder.includes("{{") || remainder.includes("}}"))
    throw new Error("Check placeholder braces.");
}
export function renderAutomationText(
  text: string,
  values: Partial<Record<Placeholder, string>>,
) {
  validatePlaceholders(text);
  return text.replace(pattern, (_token, name: string) => {
    const value = values[name.trim() as Placeholder];
    if (typeof value !== "string" || !value.trim())
      throw new Error("Required placeholder context unavailable");
    return value;
  });
}

export function automationPlaceholderValues(context: {
  business: Record<string, unknown>;
  customer: Record<string, unknown>;
  order: Record<string, unknown>;
  booking: Record<string, unknown>;
  payment: Record<string, unknown>;
}): Partial<Record<Placeholder, string>> {
  const string = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const amount =
    context.payment.amount ?? context.order.total ?? context.booking.amount;
  return {
    business_name: string(context.business.name),
    customer_name: string(context.customer.name),
    order_id: string(context.order.id),
    booking_date: string(context.booking.bookingDate),
    booking_time: string(context.booking.startTime),
    amount:
      typeof amount === "number" && Number.isFinite(amount) && amount >= 0
        ? amount.toFixed(2)
        : undefined,
  };
}
