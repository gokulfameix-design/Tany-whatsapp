import { debugCall } from "@/lib/messaging/orchestration-debug";
import type { FlowContext, TanyVertical } from "@/lib/messaging/types";
import {
  getAvailableCatalogItems,
  type CatalogItem,
} from "@/lib/messaging/services/catalog-service";
import { getBusinessConfig } from "@/lib/messaging/services/business-config-service";

export const missingCatalogReply =
  "This business has not configured its catalog yet.";
export const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is string => typeof entry === "string" && !!entry.trim(),
      )
    : [];
export const aliasesFor = (item: CatalogItem) => [
  ...new Set([
    item.name.toLowerCase(),
    ...stringList(item.metadata.aliases).map((alias) => alias.toLowerCase()),
  ]),
];
export async function loadBusinessData(
  flow: FlowContext | undefined,
  vertical: TanyVertical,
) {
  const id = flow?.business?.id ?? flow?.conversation?.businessId;
  if (!id) return { config: null, items: [] as CatalogItem[] };
  if (flow?.business && flow.business.vertical !== vertical)
    throw new Error("Business vertical does not match flow");
  if (
    flow?.conversation &&
    (flow.conversation.businessId !== id ||
      flow.conversation.vertical !== vertical)
  )
    throw new Error("Conversation does not match business");
  const config = await debugCall(
    "getBusinessConfig",
    () => getBusinessConfig(id),
    flow?.debugTrace,
    "catalog",
  );
  if (!config?.active || config.vertical !== vertical)
    return { config: null, items: [] as CatalogItem[] };
  const items = (
    await debugCall(
      "getAvailableCatalogItems",
      () => getAvailableCatalogItems(id),
      flow?.debugTrace,
      "catalog",
    )
  ).filter((item) => item.metadata.stock !== 0);
  return { config, items };
}
