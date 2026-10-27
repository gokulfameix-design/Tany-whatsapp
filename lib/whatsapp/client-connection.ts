import "server-only";
import { getWhatsAppSetup } from "@/lib/whatsapp/setup-service";
import { requireWhatsAppEntitlement } from "@/lib/subscriptions/entitlements";

export type ClientWhatsAppConnection = {
  status:
    | "not_connected"
    | "pending"
    | "testing"
    | "connected"
    | "error"
    | "disconnected";
  displayName: string;
  displayPhone: string;
  catalogConnected: boolean;
  health: "not_available" | "configured" | "verified" | "needs_attention";
  setupMessage: string;
};

/** A deliberately small client projection. Meta identifiers and secret references stay server-side. */
export async function getClientWhatsAppConnection(
  businessId: string,
): Promise<ClientWhatsAppConnection> {
  await requireWhatsAppEntitlement(businessId);
  const setup = await getWhatsAppSetup(businessId);
  if (!setup)
    return {
      status: "not_connected",
      displayName: "",
      displayPhone: "",
      catalogConnected: false,
      health: "not_available",
      setupMessage: "",
    };

  const health =
    setup.status === "error"
      ? "needs_attention"
      : setup.status === "connected" && setup.validationMode === "live"
        ? "verified"
        : setup.status === "connected"
          ? "configured"
          : "not_available";
  return {
    status: setup.status,
    displayName: setup.displayName,
    displayPhone: setup.displayPhone,
    catalogConnected: Boolean(setup.catalogEnabled && setup.catalogId),
    health,
    setupMessage: setup.status === "error" ? setup.testMessage : "",
  };
}
