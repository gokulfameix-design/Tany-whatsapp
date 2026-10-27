import type { FlowContext, FlowResult, IncomingMessageInput } from "@/lib/messaging/types";
import { handleCommerceMessage } from "@/lib/messaging/flows/commerce-flow";

export function handleEcomMessage(input: string | IncomingMessageInput, context?: FlowContext): Promise<FlowResult> {
  return handleCommerceMessage("ecom", input, context);
}
