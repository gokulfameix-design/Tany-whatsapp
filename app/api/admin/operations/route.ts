import { NextRequest, NextResponse } from "next/server";
import { getOperationsData } from "@/lib/admin/operations-service";
import { OperationsAccessError } from "@/lib/admin/client-access";
import { mutateClientOperations, sendOperatorMessage } from "@/lib/admin/client-operations";
import { EntitlementError } from "@/lib/subscriptions/entitlements";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
async function handle(request: NextRequest, mutate: boolean) {
  // Standalone internal console only. The separate client API keeps signed scope checks.
  const principal = { role: "admin" as const };
  try {
    const requested = request.nextUrl.searchParams.get("businessId") ?? undefined;
    if (!mutate) return NextResponse.json({ ok: true, data: { ...await getOperationsData(requested), audience: "admin" } }, { headers });
    let sameOrigin = false;
    try {
      const origin = new URL(request.headers.get("origin") ?? "");
      sameOrigin = origin.origin === request.headers.get("origin") && origin.host === (request.headers.get("host") ?? request.nextUrl.host) && (origin.protocol === "https:" || (origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)));
    } catch { /* Invalid origins are denied. */ }
    if (!sameOrigin) throw new OperationsAccessError("INVALID_ORIGIN", "Invalid request origin.");
    const input = await request.json();
    if (typeof input?.action !== "string") throw new OperationsAccessError("INVALID_INPUT", "Choose an action.", 400);
    const result = input.action === "send" ? await sendOperatorMessage(principal, requested, input.input, true) : await mutateClientOperations(principal, requested, input.action, input.input, true);
    return NextResponse.json({ ok: true, result }, { headers });
  } catch (error) {
    if (error instanceof EntitlementError) return NextResponse.json(error.details, { status: 403, headers });
    if (error instanceof OperationsAccessError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status, headers });
    return NextResponse.json({ ok: false, message: "Could not complete this action. Please try again." }, { status: error instanceof SyntaxError ? 400 : 503, headers });
  }
}
export async function GET(request: NextRequest) { return handle(request, false); }
export async function POST(request: NextRequest) { return handle(request, true); }
