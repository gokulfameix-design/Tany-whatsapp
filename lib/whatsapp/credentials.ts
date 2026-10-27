import "server-only";

/** Secret Manager secrets must be mounted as allowlisted environment variables. */
export function accountAccessToken(secretName: string, businessId: string): string | null {
  const allowed = (process.env.WHATSAPP_TOKEN_SECRET_NAMES ?? "").split(",").map(s => s.trim());
  if (!/^[A-Z][A-Z0-9_]{2,100}$/.test(secretName) || !allowed.includes(secretName)) return null;
  try {
    const bindings = JSON.parse(process.env.WHATSAPP_TOKEN_SECRET_BINDINGS ?? "{}");
    if (bindings[businessId] !== secretName) return null;
  } catch { return null; }
  return process.env[secretName] || null;
}
