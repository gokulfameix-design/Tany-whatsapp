export type CommerceVertical = "retail" | "ecom" | "meds" | "meat";
export type AppointmentVertical = "garage" | "expert" | "gaming" | "sport";
export type BatchVertical = CommerceVertical | AppointmentVertical | "cabs";
export type CatalogItem = { id: string; name: string; price: number; aliases: string[]; variants?: string[]; metadata?: import("@/lib/messaging/domain-types").ConversationContext };
export type CommerceConfig = { firstStep: "product" | "category" | "item"; location: boolean; catalog: CatalogItem[] };
export const commerceConfigs: Record<CommerceVertical, CommerceConfig> = {
  retail: { firstStep: "product", location: false, catalog: [] },
  ecom: { firstStep: "category", location: false, catalog: [] },
  meds: { firstStep: "product", location: true, catalog: [] },
  meat: { firstStep: "item", location: true, catalog: [] },
};
export const appointmentConfigs: Record<AppointmentVertical, { firstStep: "service" | "station" | "activity"; payment: boolean; catalog: CatalogItem[] }> = {
  garage: { firstStep: "service", payment: false, catalog: [] },
  expert: { firstStep: "service", payment: true, catalog: [] },
  gaming: { firstStep: "station", payment: true, catalog: [] },
  sport: { firstStep: "activity", payment: true, catalog: [] },
};
