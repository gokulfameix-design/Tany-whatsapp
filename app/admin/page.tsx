import { Suspense } from "react";
import { connection } from "next/server";
import { OperationsPage } from "./components/operations-page";
import { LoadingPanel } from "./components/shared";
async function Overview() {
  await connection();
  return <OperationsPage />;
}
export default function AdminHome() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <Overview />
    </Suspense>
  );
}
