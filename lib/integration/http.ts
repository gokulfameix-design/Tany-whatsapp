import { EntitlementError } from "@/lib/subscriptions/entitlements";
import "server-only";
import { verifyIntegrationAccess, type IntegrationScope } from "@/lib/integration/access";
import { AdminValidationError } from "@/lib/admin/validation";

export class IntegrationError extends Error { constructor(public status: number, message: string) { super(message); } }
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization", "X-Content-Type-Options": "nosniff" };
export async function integrationResponse(request: Request, scope: IntegrationScope, handler: () => Promise<unknown>) {
  const secret = process.env.MESSAGING_SERVICE_SECRET ?? "";
  if (secret.length < 32) return Response.json({ error: "Integration is not configured." }, { status: 503, headers });
  const token = request.headers.get("authorization")?.match(/^Bearer ([^ ]+)$/)?.[1] ?? "";
  if (!await verifyIntegrationAccess(secret, token, scope)) return Response.json({ error: "Unauthorized integration scope." }, { status: 401, headers });
  try { return Response.json({ version: 1, data: await handler() }, { headers }); }
  catch (error) {
    if (error instanceof EntitlementError) return Response.json(error.details, { status: 403, headers });
    if (error instanceof IntegrationError) return Response.json({ error: error.message }, { status: error.status, headers });
    if (error instanceof AdminValidationError) return Response.json({ error: "Invalid input.", fields: error.errors }, { status: 400, headers });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
    return Response.json({ error: "Messaging service is temporarily unavailable." }, { status: 503, headers });
  }
}
