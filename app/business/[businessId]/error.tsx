"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.error("[WORKSPACE_ERROR]", {
      name: error.name,
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <Card role="alert" className="mx-auto max-w-lg gap-4 p-6">
      <h1 className="text-lg font-semibold">Business data is unavailable</h1>
      <p className="text-sm text-muted-foreground">
        Check the Firestore connection, then try again.
      </p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
