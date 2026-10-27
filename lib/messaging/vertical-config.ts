import type { TanyVertical } from "@/lib/messaging/types";

type VerticalConfig<K extends TanyVertical> = {
  key: K;
  label: string;
  startState: `${K}_start`;
  defaultReply: string;
};

export const verticalConfig = {
  motos: { key: "motos", label: "Tany Motos", startState: "motos_start", defaultReply: "Vehicle request received" },
  eats: { key: "eats", label: "Tany Eats", startState: "eats_start", defaultReply: "Food request received" },
  cabs: { key: "cabs", label: "Tany Cabs", startState: "cabs_start", defaultReply: "Cab request received" },
  ecom: { key: "ecom", label: "Tany Ecom", startState: "ecom_start", defaultReply: "Shopping request received" },
  expert: { key: "expert", label: "Tany Expert", startState: "expert_start", defaultReply: "Expert request received" },
  gaming: { key: "gaming", label: "Tany Gaming", startState: "gaming_start", defaultReply: "Gaming request received" },
  garage: { key: "garage", label: "Tany Garage", startState: "garage_start", defaultReply: "Garage request received" },
  meat: { key: "meat", label: "Tany Meat", startState: "meat_start", defaultReply: "Meat request received" },
  meds: { key: "meds", label: "Tany Meds", startState: "meds_start", defaultReply: "Pharmacy request received" },
  retail: { key: "retail", label: "Tany Retail", startState: "retail_start", defaultReply: "Retail request received" },
  salon: { key: "salon", label: "Tany Salon", startState: "salon_start", defaultReply: "Salon request received" },
  sport: { key: "sport", label: "Tany Sport", startState: "sport_start", defaultReply: "Sport request received" },
} as const satisfies { [K in TanyVertical]: VerticalConfig<K> };

export function isTanyVertical(value: unknown): value is TanyVertical {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(verticalConfig, value);
}
