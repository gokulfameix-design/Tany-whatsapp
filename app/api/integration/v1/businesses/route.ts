import { integrationResponse } from "@/lib/integration/http";
import { integrationBusinesses } from "@/lib/integration/dashboard";
export async function GET(request: Request) {
  return integrationResponse(request, { kind: "directory" }, integrationBusinesses);
}
