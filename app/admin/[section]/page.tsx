import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { OperationsPage } from "../components/operations-page";
import { LoadingPanel } from "../components/shared";
import { operationSections } from "@/lib/admin/operations-types";
async function Section({ params }: { params: Promise<{ section: string }> }) {
  await connection();
  const { section } = await params;
  if (!operationSections.some((value) => value === section)) notFound();
  return (
    <OperationsPage section={section as (typeof operationSections)[number]} />
  );
}
export default function AdminSection(props: {
  params: Promise<{ section: string }>;
}) {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <Section {...props} />
    </Suspense>
  );
}
