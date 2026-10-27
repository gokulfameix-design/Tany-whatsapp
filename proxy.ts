import { NextResponse } from "next/server";

/** Standalone internal console: client subscription/login policy belongs to the integration APIs. */
export async function proxy() {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/admin/:path*", "/business/:path*", "/dashboard/:path*"] };
