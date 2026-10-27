import type { TanyVertical } from "@/lib/messaging/types";
import type { ConversationContext } from "@/lib/messaging/domain-types";

export type AdminBusiness = {
  id: string;
  name: string;
  vertical: TanyVertical;
  active: boolean;
  whatsappPhoneNumberId: string;
  settings: ConversationContext;
};
export type BusinessListItem = AdminBusiness & { catalogCount: number };
export type BusinessStats = {
  catalog: number;
  conversations: number;
  orders: number;
  bookings: number;
};
export type AdminCatalogItem = {
  id: string;
  type: string;
  name: string;
  category: string | null;
  description: string;
  price: number;
  available: boolean;
  metadata: ConversationContext;
};
export type ActionState = {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
  businessId?: string;
};

export type WorkspaceOption = Pick<
  AdminBusiness,
  "id" | "name" | "vertical" | "active"
>;
