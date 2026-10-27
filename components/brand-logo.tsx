import Image from "next/image";
import { cn } from "@/lib/utils";
import { getBrandLogos } from "@/lib/brand-logos";
import { verticalConfig } from "@/lib/messaging/vertical-config";
import type { TanyVertical } from "@/lib/messaging/types";

export function BrandLogo({
  vertical,
  variant = "icon",
  decorative = false,
  className,
}: {
  vertical?: TanyVertical;
  variant?: "icon" | "wordmark";
  decorative?: boolean;
  className?: string;
}) {
  const asset = getBrandLogos(vertical)[variant];
  return (
    <Image
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={decorative ? "" : vertical ? verticalConfig[vertical].label : "Tany"}
      sizes={variant === "icon" ? "32px" : "180px"}
      className={cn(
        "shrink-0 object-contain",
        variant === "icon" ? "size-8" : "h-7 w-auto max-w-full",
        className,
      )}
    />
  );
}
