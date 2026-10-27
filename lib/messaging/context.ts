import type { ConversationContext, JsonValue } from "@/lib/messaging/domain-types";

// Clone and validate at the boundary: undefined, non-finite numbers, custom
// prototypes and prototype-polluting keys are not valid conversation context.
function cloneJson(value: JsonValue, seen = new Set<object>()): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null || seen.has(value)) {
    throw new Error("Conversation context must contain finite, acyclic JSON values");
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) return Array.from(value, (entry) => cloneJson(entry, seen));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error("Conversation context must contain plain JSON objects");
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
      assertContextKey(key);
      return [key, cloneJson(entry, seen)];
    }));
  } finally {
    seen.delete(value);
  }
}

function assertContextKey(key: string) {
  if (["__proto__", "prototype", "constructor"].includes(key)) {
    throw new Error(`Unsafe context key: ${key}`);
  }
}

/** Immutable, top-level merge. Nested values are replaced as a whole. */
export function mergeConversationContext(
  current: ConversationContext = {},
  updates: ConversationContext = {}
): ConversationContext {
  for (const value of [current, updates]) {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error("Conversation context must be an object");
    }
  }
  return { ...(cloneJson(current) as ConversationContext), ...(cloneJson(updates) as ConversationContext) };
}

export function clearConversationContext(): ConversationContext {
  return {};
}

export function setContextValue(context: ConversationContext, key: string, value: JsonValue): ConversationContext {
  assertContextKey(key);
  return mergeConversationContext(context, { [key]: value });
}

export function getContextValue(context: ConversationContext, key: string): JsonValue | undefined {
  assertContextKey(key);
  return Object.prototype.hasOwnProperty.call(context, key) ? cloneJson(context[key]) : undefined;
}
