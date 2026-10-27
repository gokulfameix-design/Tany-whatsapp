import type { OperationsData } from "@/lib/admin/operations-types";
const day = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
export function operationsMetrics(data: OperationsData, now = new Date()) {
  const today = data.messages.filter(message => message.at && day(new Date(message.at)) === day(now));
  return {
    today: today.length,
    incoming: today.filter(m => m.direction === "incoming").length,
    outgoing: today.filter(m => m.direction === "outgoing").length,
    delivered: today.filter(m => ["delivered", "read"].includes(m.status)).length,
    read: today.filter(m => m.status === "read").length,
    failed: today.filter(m => m.status === "failed").length,
    active: data.conversations.filter(c => !["completed", "cancelled", "unknown"].includes(c.status)).length,
    handoffs: data.conversations.filter(c => c.status === "handed_off").length,
  };
}
