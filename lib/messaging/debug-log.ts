/** Temporary WhatsApp diagnostics: never serialize arbitrary objects or error stacks. */
export function safeWhatsAppDebugText(value: unknown, redactPersonalData = false): string | null {
  if (typeof value !== "string") return null;
  let text = value;
  for (const [key, secret] of Object.entries(process.env)) {
    if (/TOKEN|SECRET|PASSWORD|PRIVATE_KEY/i.test(key) && secret) {
      text = text.split(secret).join("[REDACTED]");
    }
  }
  text = text
    .replace(/\b[a-f0-9]{64}\b/gi, "[TOKEN REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/((?:access[_-]?token|app[_-]?secret|verify[_-]?token|password)\s*[=:]\s*)[^\s,;&]+/gi, "$1[REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[URL REDACTED]")
    .replace(/[\r\n\t\x00-\x1f\x7f]/g, " ");
  if (redactPersonalData) {
    if (/\b(?:password|passcode|otp|address|prescription|diagnosis|account number|card number)\b/i.test(text)) return "[SENSITIVE TEXT REDACTED]";
    text = text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[EMAIL REDACTED]")
      .replace(/\d(?:[\d .()-]*\d){3,}/g, "[NUMBER REDACTED]");
  }
  return text.slice(0, 300);
}

export function safeWhatsAppError(error: unknown): string {
  return safeWhatsAppDebugText(error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown webhook error", true) ?? "Unknown webhook error";
}
