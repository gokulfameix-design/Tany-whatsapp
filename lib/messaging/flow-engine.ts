import { isTanyVertical, verticalConfig } from "@/lib/messaging/vertical-config";
import { textReply } from "@/lib/messaging/replies";
import type { FlowContext, FlowResult, TanyVertical } from "@/lib/messaging/types";

export async function handleVerticalMessage(
  vertical: TanyVertical,
  text: string,
  context?: FlowContext
): Promise<FlowResult> {
  if (!isTanyVertical(vertical)) {
    throw new Error(`Unsupported Tany vertical: ${vertical}`);
  }
  if (context?.business && context.business.vertical !== vertical) {
    throw new Error("Flow vertical does not match business vertical");
  }
  const config = verticalConfig[vertical];
  return {
    state: config.startState,
    reply: textReply(`${config.defaultReply}: ${text}`),
    vertical: config.key,
    originalText: text,
  };
}
