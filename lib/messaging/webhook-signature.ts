import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsAppSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature))
    return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature.slice(7), "hex"),
  );
}
