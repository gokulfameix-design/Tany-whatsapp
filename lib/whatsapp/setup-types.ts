export type SetupStatus =
  | "pending"
  | "testing"
  | "connected"
  | "error"
  | "disconnected";
export type WhatsAppSetup = {
  catalogId?: string;
  catalogEnabled?: boolean;
  accountId: string;
  businessId: string;
  vertical: string;
  setupType: "existing" | "new";
  displayName: string;
  displayPhone: string;
  businessName: string;
  phoneNumberId: string;
  wabaId: string;
  tokenSecretName: string;
  status: SetupStatus;
  setupStep: number;
  validationMode: "live" | "manual_test" | null;
  testPassed: boolean;
  testMessage: string;
};
