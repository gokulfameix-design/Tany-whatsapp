import { Button } from "@/components/ui/button";

import { Card } from "@/components/ui/card";

import Link from "next/link";

export default function BusinessNotFound() {
  return (
    <Card className="gap-0 py-0 shadow-sm space-y-4 p-8">
      <h1 className="text-xl font-semibold">Business not found</h1>
      <p className="text-sm text-muted-foreground">
        This business is missing or its profile is incomplete.
      </p>
      <Button asChild variant="outline">
        <Link href="/admin/businesses">Back to businesses</Link>
      </Button>
    </Card>
  );
}
