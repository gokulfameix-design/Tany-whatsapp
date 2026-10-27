import { NextRequest, NextResponse } from "next/server";
import { dashboardAccess } from "@/lib/admin/dashboard-access";
import { EntitlementError, requireWhatsAppEntitlement } from "@/lib/subscriptions/entitlements";
import { activateWhatsAppSetup, disconnectWhatsAppSetup, getWhatsAppSetup, saveWhatsAppSetup, SetupError, testWhatsAppSetup } from "@/lib/whatsapp/setup-service";

type Context = { params: Promise<{ businessId: string }> };
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
async function handle(request: NextRequest, context: Context, mutate: boolean) {
  const { businessId } = await context.params;
  const access = process.env.NODE_ENV === "development" ? "admin" : await dashboardAccess(
    process.env.MESSAGING_SERVICE_SECRET ?? "", request.cookies.get("__Host-tany-dashboard")?.value ?? "", businessId,
  );
  if (!access) return NextResponse.json({ code: "UNAUTHORIZED", message: "Business access required." }, { status: 401, headers });
  try {
    await requireWhatsAppEntitlement(businessId);
    if (mutate) {
      const origin = request.headers.get("origin");
      let sameOrigin = false;
      try {
        const parsed = new URL(origin ?? "");
        sameOrigin = parsed.origin === origin && parsed.host === (request.headers.get("host") ?? new URL(request.url).host) &&
          (parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)));
      } catch { /* Reject missing or malformed origins. */ }
      if (!sameOrigin)
        return NextResponse.json({ code: "INVALID_ORIGIN", message: "Invalid request origin." }, { status: 403, headers });
      const input = await request.json();
      const action = input?.action;
      let account;
      if (action === "save") account = await saveWhatsAppSetup(businessId, input.details);
      else if (action === "test") account = await testWhatsAppSetup(businessId, input);
      else if (action === "activate") account = await activateWhatsAppSetup(businessId);
      else if (action === "disconnect") account = await disconnectWhatsAppSetup(businessId);
      else throw new SetupError("INVALID_ACTION", "Choose a valid setup action.");
      return NextResponse.json({ ok: true, account }, { headers });
    }
    return NextResponse.json({ ok: true, account: await getWhatsAppSetup(businessId) }, { headers });
  } catch (error) {
    if (error instanceof EntitlementError) return NextResponse.json(error.details, { status: 403, headers });
    if (error instanceof SetupError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status, headers });
    return NextResponse.json({ ok: false, message: "Could not complete this step. Please try again." }, { status: error instanceof SyntaxError ? 400 : 503, headers });
  }
}
export async function GET(request: NextRequest, context: Context) { return handle(request, context, false); }
export async function POST(request: NextRequest, context: Context) { return handle(request, context, true); }
