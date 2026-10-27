import { catalogSettingsData } from "@/lib/whatsapp/catalog";
import { getAvailableCatalogItems } from "@/lib/messaging/services/catalog-service";
import { WhatsAppCatalogSettings } from "./whatsapp-catalog-settings";
import { AutomationPage } from "./automations/automation-page";
import { getOperationsData } from "@/lib/admin/operations-service";
import type { OperationSection } from "@/lib/admin/operations-types";
import { OperationsPanel } from "./operations-panel";

export async function OperationsPage({
  businessId,
  section = "overview",
}: {
  businessId?: string;
  section?: OperationSection;
}) {
  if (section === "automations")
    return <AutomationPage businessId={businessId} />;
  return (
    <>
      <OperationsPanel
        key={`${businessId ?? "admin"}/${section}`}
        data={{ ...(await getOperationsData(businessId)), audience: "admin" }}
        section={section}
      />
      {section === "settings" && businessId && (
        <WhatsAppCatalogSettings
          businessId={businessId}
          config={await catalogSettingsData(businessId)}
          products={(await getAvailableCatalogItems(businessId))
            .filter((p) => p.type === "product")
            .map((p) => ({ id: p.id, name: p.name }))}
        />
      )}
    </>
  );
}
