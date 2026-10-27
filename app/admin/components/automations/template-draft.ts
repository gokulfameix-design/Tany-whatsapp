import type { AutomationInput } from "@/lib/automations/model";
import type { ProductAutomationTemplate } from "@/lib/automations/product-templates";

/**
 * Client-only template selection. This creates an unsaved editor draft and
 * deliberately has no server action, route, or persistence dependency.
 */
export function templateToAutomationInput(
  template: ProductAutomationTemplate,
): AutomationInput {
  const { name, description, trigger, conditions, actions } = template;
  return JSON.parse(
    JSON.stringify({ name, description, trigger, conditions, actions }),
  ) as AutomationInput;
}
