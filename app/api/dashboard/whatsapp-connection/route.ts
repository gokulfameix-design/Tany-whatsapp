import { NextRequest, NextResponse } from "next/server";
import { resolveDashboardSession } from "@/lib/admin/dashboard-access";
import { EntitlementError } from "@/lib/subscriptions/entitlements";
import { disconnectWhatsAppSetup } from "@/lib/whatsapp/setup-service";
import { getClientWhatsAppConnection } from "@/lib/whatsapp/client-connection";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

async function businessFor(request: NextRequest) {
  const session = await resolveDashboardSession(
    process.env.MESSAGING_SERVICE_SECRET ?? "",
    request.cookies.get("__Host-tany-dashboard")?.value ?? "",
  );
  return session?.role === "business" ? session.businessId : null;
}

function sameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    return (
      origin.origin === request.headers.get("origin") &&
      origin.host === request.nextUrl.host &&
      (origin.protocol === "https:" ||
        (origin.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const businessId = await businessFor(request);
  if (!businessId)
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Open WhatsApp from your Tany account." },
      { status: 401, headers },
    );
  try {
    return NextResponse.json(
      { ok: true, connection: await getClientWhatsAppConnection(businessId) },
      { headers },
    );
  } catch (error) {
    if (error instanceof EntitlementError)
      return NextResponse.json(error.details, { status: 403, headers });
    return NextResponse.json(
      { ok: false, message: "Could not load the WhatsApp connection." },
      { status: 503, headers },
    );
  }
}

export async function POST(request: NextRequest) {
  const businessId = await businessFor(request);
  if (!businessId)
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Open WhatsApp from your Tany account." },
      { status: 401, headers },
    );
  if (!sameOrigin(request))
    return NextResponse.json(
      { code: "INVALID_ORIGIN", message: "Invalid request origin." },
      { status: 403, headers },
    );
  try {
    const body = await request.json();
    if (body?.action !== "disconnect")
      return NextResponse.json(
        { code: "INVALID_ACTION", message: "Choose a valid connection action." },
        { status: 400, headers },
      );
    await disconnectWhatsAppSetup(businessId);
    return NextResponse.json(
      { ok: true, connection: await getClientWhatsAppConnection(businessId) },
      { headers },
    );
  } catch (error) {
    if (error instanceof EntitlementError)
      return NextResponse.json(error.details, { status: 403, headers });
    return NextResponse.json(
      { ok: false, message: "Could not update the WhatsApp connection." },
      { status: error instanceof SyntaxError ? 400 : 503, headers },
    );
  }
}
