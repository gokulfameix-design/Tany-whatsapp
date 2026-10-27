import type { FlowContext, FlowResult, IncomingMessageInput } from "@/lib/messaging/types";
import { handleAppointmentMessage } from "@/lib/messaging/flows/appointment-flow";

export function handleGarageMessage(input: string | IncomingMessageInput, context?: FlowContext, now = new Date()): Promise<FlowResult> {
  return handleAppointmentMessage("garage", input, context, now);
}
