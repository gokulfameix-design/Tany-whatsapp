import "server-only";

/** Explicit server-only switch; unset/false keeps the real Firebase auth path. */
export function demoAuthEnabled() {
  return process.env.DEMO_AUTH_MODE === "true";
}
