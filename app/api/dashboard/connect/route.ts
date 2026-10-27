import { NextRequest, NextResponse } from "next/server";
import { consumeWorkspaceHandoff } from "@/lib/admin/workspace-handoff";
import { signIntegrationAccess } from "@/lib/integration/access";
import { EntitlementError } from "@/lib/subscriptions/entitlements";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
  try {
    const secret = process.env.MESSAGING_SERVICE_SECRET ?? "";
    if (secret.length < 32) return NextResponse.json({ message: "Workspace access is not configured." }, { status: 503, headers });
    const businessId = await consumeWorkspaceHandoff(request.nextUrl.searchParams.get("token") ?? "");
    const credential = await signIntegrationAccess(secret, { kind: "business", businessId }, Date.now(), "tany-dashboard-v1", 3600);
    // A relative Location retains the user's public service origin behind Cloud Run.
    const response = new NextResponse(null, { status: 303, headers: { ...headers, Location: `/business/${encodeURIComponent(businessId)}` } });
    response.cookies.set("__Host-tany-dashboard", credential, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 3600 });
    return response;
  } catch (error) {
    return NextResponse.json(error instanceof EntitlementError ? error.details : { message: "This workspace link is invalid or expired. Open WhatsApp again from Tany." }, { status: error instanceof EntitlementError ? 403 : 400, headers });
  }
}
