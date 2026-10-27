import { Suspense } from "react";
import { connection } from "next/server";
import { loadBusiness } from "@/app/business/_components/load-business";
import { OperationsPage } from "@/app/admin/components/operations-page";
import { LoadingPanel } from "@/app/admin/components/shared";
async function Overview({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  await connection();
  const { businessId } = await params;
  await loadBusiness(businessId);
  return <OperationsPage businessId={businessId} />;
}
export default function BusinessOverview(props: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <Overview {...props} />
    </Suspense>
  );
}
