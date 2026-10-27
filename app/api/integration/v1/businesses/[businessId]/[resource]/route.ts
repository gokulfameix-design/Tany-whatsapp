import { createWorkspaceHandoff } from "@/lib/admin/workspace-handoff";
import { integrationResponse, IntegrationError } from "@/lib/integration/http";
import { integrationRead, integrationSetup, integrationTest } from "@/lib/integration/dashboard";
type Context = { params: Promise<{ businessId: string; resource: string }> };
export async function GET(request: Request, context: Context) {
  const { businessId, resource } = await context.params;
  return integrationResponse(request, { kind: "business", businessId }, () => integrationRead(businessId, resource));
}
export async function PATCH(request: Request, context: Context) {
  const { businessId, resource } = await context.params;
  return integrationResponse(request, { kind: "business", businessId }, async () => {
    if (resource !== "setup") throw new IntegrationError(405, "This resource is read only.");
    return integrationSetup(businessId, await request.json());
  });
}
export async function POST(request: Request, context: Context) {
  const { businessId, resource } = await context.params;
  return integrationResponse(request, { kind: "business", businessId }, async () => {
    if (resource === "workspace") return createWorkspaceHandoff(businessId);
    if (resource !== "test") throw new IntegrationError(405, "This resource is read only.");
    return integrationTest(businessId, await request.json());
  });
}
