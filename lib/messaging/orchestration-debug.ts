/** Temporary orchestration diagnostics. Values, messages, errors and payloads are never serialized. */
const stageMarkers = {
  identity: ["[WA_IDENTITY_CHECK_START]", "[WA_IDENTITY_CHECK_DONE]"],
  automation: ["[WA_AUTOMATION_CHECK_START]", "[WA_AUTOMATION_CHECK_DONE]"],
  router: ["[WA_ROUTER_START]", "[WA_ROUTER_DONE]"],
  catalog: ["[WA_CATALOG_CHECK_START]", "[WA_CATALOG_CHECK_DONE]"],
} as const;
export type DebugStage = keyof typeof stageMarkers;
export type DebugMarker =
  | (typeof stageMarkers)[DebugStage][number]
  | "[WA_NULL_RESULT]"
  | "[WA_EARLY_RETURN]"
  | "[WA_AUTOMATION_RESULT]"
  | "[WA_REPLY_READY]";
export type DebugDetails = {
  handled?: boolean;
  terminal?: boolean;
  messageSent?: boolean;
  actionCount?: number;
  step?: string;
  result?: "null" | "undefined";
  outcome?: "ok" | "error";
  reason?: string;
};
export type DebugReporter = (
  marker: DebugMarker,
  details: DebugDetails,
) => void;
export function reportDebug(
  reporter: DebugReporter | undefined,
  marker: DebugMarker,
  details: DebugDetails,
) {
  try {
    reporter?.(marker, details);
  } catch {
    /* Diagnostics must not change behavior. */
  }
}
export function debugValue<T>(
  step: string,
  value: T,
  reporter?: DebugReporter,
): T {
  if (value === null || value === undefined)
    reportDebug(reporter, "[WA_NULL_RESULT]", {
      step,
      result: value === null ? "null" : "undefined",
    });
  return value;
}
export async function debugCall<T>(
  step: string,
  action: () => T | Promise<T>,
  reporter?: DebugReporter,
  stage?: DebugStage,
): Promise<T> {
  if (stage) reportDebug(reporter, stageMarkers[stage][0], { step });
  try {
    const value = debugValue(step, await action(), reporter);
    if (stage)
      reportDebug(reporter, stageMarkers[stage][1], { step, outcome: "ok" });
    return value;
  } catch (error) {
    if (stage)
      reportDebug(reporter, stageMarkers[stage][1], { step, outcome: "error" });
    throw error;
  }
}
export function debugEarlyReturn<T>(
  reason: string,
  value: T,
  reporter?: DebugReporter,
): T {
  reportDebug(reporter, "[WA_EARLY_RETURN]", { reason });
  return value;
}
