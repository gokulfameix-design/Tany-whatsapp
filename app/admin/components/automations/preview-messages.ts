import type { Action } from "@/lib/automations/model";

// Presentation values only. Never used by the automation engine or persisted.
export type PreviewMessage = {
  kind: "text" | "buttons" | "list" | "url" | "product" | "location";
  text: string;
  choices?: string[];
  footer?: string;
};
export function previewText(text: string, businessName: string) {
  const samples: Record<string, string> = { business_name: businessName, customer_name: "Alex", order_id: "#1024", booking_date: "28 October", booking_time: "10:00 AM", amount: "450" };
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => samples[key] ?? match);
}
export function previewMessages(actions: Action[], businessName: string, templates: { id: string; body: string }[] = []): PreviewMessage[] {
  return actions.flatMap((action): PreviewMessage[] => {
    const text = previewText(action.text ?? "", businessName);
    switch (action.type) {
      case "text": return [{ kind: "text", text }];
      case "buttons": case "list": return [{ kind: action.type, text, choices: action.choices?.map(c => previewText(c, businessName)) ?? [] }];
      case "location": return [{ kind: "location", text: text || "Please share your location." }];
      case "template": {
        const source = templates.find(t => t.id === action.templateId)?.body;
        const body = source?.replace(/\{\{(\d+)\}\}/g, (match, n: string) => action.parameters?.[Number(n) - 1] ?? match);
        return [{ kind: "text", text: body ? previewText(body, businessName) : "Choose a WhatsApp template to preview its message." }];
      }
      case "payment_link": return [{ kind: "url", text: "Complete payment for your request.", choices: ["Pay securely"] }];
      default: return []; // Internal actions are not customer messages.
    }
  });
}
