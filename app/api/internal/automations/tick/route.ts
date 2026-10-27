import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processAutomationWork } from "@/lib/automations/worker";
export async function POST(request: NextRequest) {
  const secret = process.env.AUTOMATION_WORKER_SECRET;
  if (!secret || secret.length < 32)
    return NextResponse.json(
      { error: "Worker configuration required" },
      { status: 503 },
    );
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body.businessId !== "string")
      throw new Error("Invalid business");
    await processAutomationWork(body.businessId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Worker failed; inspect automation runs" },
      { status: 400 },
    );
  }
}
