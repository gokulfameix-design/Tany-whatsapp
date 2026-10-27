/** Portable server-to-server protocol. No Firebase, Meta, or browser credentials. */
export type IntegrationScope =
  { kind: "directory" } | { kind: "business"; businessId: string };
type Audience = "tany-messaging-v1" | "tany-dashboard-v1";
type Claims = { aud: Audience; exp: number; scope: IntegrationScope };
const enc = new TextEncoder();
const encode = (bytes: Uint8Array | ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const decode = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) =>
    char.charCodeAt(0),
  );
const key = (secret: string, usage: "sign" | "verify") =>
  crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
export async function signIntegrationAccess(
  secret: string,
  scope: IntegrationScope,
  now = Date.now(),
  audience: Audience = "tany-messaging-v1",
  durationSeconds = 120,
) {
  if (secret.length < 32)
    throw new Error("Integration secret is not configured.");
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > (audience === "tany-dashboard-v1" ? 3600 : 120)) throw new Error("Invalid credential duration.");
  const claims: Claims = {
    aud: audience,
    exp: Math.floor(now / 1000) + durationSeconds,
    scope,
  };
  const payload = encode(enc.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await key(secret, "sign"),
    enc.encode(payload),
  );
  return `${payload}.${encode(signature)}`;
}
export async function verifyIntegrationAccess(
  secret: string,
  token: string,
  expected: IntegrationScope,
  now = Date.now(),
  audience: Audience = "tany-messaging-v1",
): Promise<boolean> {
  if (secret.length < 32 || token.length > 4096) return false;
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra !== undefined) return false;
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await key(secret, "verify"),
        decode(signature),
        enc.encode(payload),
      ))
    )
      return false;
    const claims = JSON.parse(
      new TextDecoder().decode(decode(payload)),
    ) as Claims;
    if (
      claims.aud !== audience ||
      !Number.isInteger(claims.exp) ||
      claims.exp * 1000 <= now ||
      claims.exp * 1000 > now + (audience === "tany-dashboard-v1" ? 3600000 : 300000) ||
      claims.scope?.kind !== expected.kind
    )
      return false;
    return (
      expected.kind === "directory" ||
      (claims.scope.kind === "business" &&
        claims.scope.businessId === expected.businessId)
    );
  } catch {
    return false;
  }
}
