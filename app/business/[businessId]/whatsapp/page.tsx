import { Suspense } from "react";
import { connection } from "next/server";
import { OperationsPage } from "@/app/admin/components/operations-page";
import { LoadingPanel } from "@/app/admin/components/shared";
async function Accounts({ params }: { params: Promise<{ businessId: string }> }) {
  await connection();
  const { businessId } = await params;
  return <OperationsPage businessId={businessId} section="whatsapp-accounts" />;
}
export default function Page(props: { params: Promise<{ businessId: string }> }) {
  return <Suspense fallback={<LoadingPanel />}><Accounts {...props} /></Suspense>;
}
