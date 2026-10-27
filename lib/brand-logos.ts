import type { TanyVertical } from "@/lib/messaging/types";

type LogoAsset = { src: string; width: number; height: number };
type BrandLogos = { icon: LogoAsset; wordmark: LogoAsset };

export const tanyLogos: BrandLogos = {
  icon: { src: "/brands/tany-icon.png", width: 320, height: 320 },
  wordmark: { src: "/brands/tany-logo.png", width: 916, height: 320 },
};

/** Original light-theme assets published by app.tany.in; never recolor or crop. */
export const verticalLogos = {
  motos: product("tanymotos", 251, 41),
  eats: product("tanyeats", 207, 41),
  cabs: product("tanycabs", 217, 44),
  ecom: product("tanyecom", 231, 41),
  expert: product("tanyexpert", 259, 41),
  gaming: product("tanygaming", 277, 44),
  garage: product("tanygarage", 268, 41),
  meat: product("tanymeat", 222, 41),
  meds: product("tanymeds", 230, 44),
  retail: product("tanyretail", 225, 44),
  salon: product("tanysalon", 229, 44),
  sport: product("tanysport", 232, 41),
} satisfies Record<TanyVertical, BrandLogos>;

function product(name: string, width: number, height: number): BrandLogos {
  return {
    icon: { src: `/brands/${name}-icon.svg`, width: 240, height: 240 },
    wordmark: { src: `/brands/${name}-wordmark.svg`, width, height },
  };
}

export function getBrandLogos(vertical?: TanyVertical): BrandLogos {
  return vertical ? verticalLogos[vertical] : tanyLogos;
}
