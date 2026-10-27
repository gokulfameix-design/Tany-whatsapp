# WhatsApp identity and Tany account linking

## Runtime flow

The production webhook validates `X-Hub-Signature-256` against the exact raw request body using `META_APP_SECRET`. Missing/invalid signatures fail closed before any identity, customer or order writes. Signature checks apply in every environment; local webhook fixtures must also be signed. A missing production app secret returns an explicit configuration error (503), while missing or invalid signatures return 401. Signature diagnostics log only header/secret presence and valid/invalid markers.

After business lookup, `processIncomingMessage` normalizes the sender phone and checks `whatsapp_identities/{phone}`. A phone alone is never treated as a Tany account. Unknown phones get a reusable, business-scoped link session and an interactive CTA URL pointing to `https://tany-messaging-185656276893.asia-south1.run.app/connect/whatsapp?token=...`; routing, customer creation and order/booking flows stop at this gate. Duplicate message IDs remain deduplicated. The webhook HTTP response contains neither the link capability nor a Firebase UID.

Session tokens use 32 cryptographically random bytes encoded as 64 hex characters, expire after 15 minutes and are consumed once. Session reuse is transactional and limited to the same phone/business with an unexpired unused token. Session contents and identity records are server-only.

With server-only `DEMO_AUTH_MODE=true`, the branded connect page shows the session phone and **Continue as Demo User**. No password, OTP or Firebase login is used. Confirmation validates the token, derives `demo_<phone>` only from the validated server session, and commits the same atomic linking transaction. Arbitrary submitted UID/phone/business fields are ignored. Foreign origins are rejected. A demo identity does not create a Firebase Auth user. The flag is enabled in local `.env.local` and documented in `.env.example`; set it explicitly in Cloud Run when deploying.

With `DEMO_AUTH_MODE=false` (or unset), the existing `tany-whatsapp` Firebase Auth page/API remains available. It verifies revoked/anonymous credentials as before. The demo service itself rejects calls when disabled. Public responses never contain UIDs. Neither mode links an account on a GET/page visit.

The atomic link transaction reads the original session, existing identity, scoped customer and business before writing. It updates the global identity, merges `uid`, `linkedToTany`, `phone` and `businessId` into the existing customer, and consumes the session. A different existing UID blocks the entire transaction. Existing customer names, metadata, timestamps, locations, conversations and order/booking history are retained. There is no relink feature.

After commit the service attempts to send “✅ Your Tany account is connected.” followed by a three-button menu. The session records notification progress; a second attempt cannot claim the same notification. Send failure does not roll back a successful link or imply account-link failure: the success screen tells the user to send Hi to continue. This is an at-most-once notification attempt, not an exactly-once delivery guarantee. Crash recovery of an in-flight notification is not automatic.

Linked messages update lastSeenAt and attach the same verified identity to that business's customer record. Generic Hi/Hello/Start replies use the existing reply engine with Start/History/Help buttons. Eats has Start Order / My Orders / Help; Salon has Book Appointment / My Bookings / Help; Motos has Browse Cars / Book Test Drive / Help. History queries require both businessId and customerPhone. Typed inputs still reach the original handlers. The Start action invokes the existing vertical reset behavior; payment/completion protections remain owned by those handlers.

A short original typed intent can be retained privately in the linking session and customer. Greetings and control commands are excluded. It resumes only when the linked user explicitly chooses Start, after the existing flow resets. No original CONFIRM, CANCEL or payment command is auto-replayed. A new ordinary typed message supersedes the pending intent. The pending intent is cleared only after the new reply is durably prepared, supporting the existing retry path. Neither a link click nor consent alone creates an order or booking.

## Collections and rules

- `whatsapp_identities/{phone}`: phone, uid, linked, linkedAt, lastSeenAt.
- `whatsapp_link_sessions/{token}`: token, whatsappPhone, businessId, expiresAt, used, createdAt; optional pendingIntent, usedAt and notificationStatus.
- Existing `customers/{businessId_phone}`: uid and linkedToTany added with merge semantics; optional pendingWhatsAppIntent is private orchestration data.

`firestore.rules` denies client reads/writes to every collection in this Admin-SDK-owned service; Firebase Auth does not require Firestore reads. No rules were previously present in this repository. Review these rules against any existing production clients before deploying them. A broader allow rule elsewhere would defeat a narrow deny, so do not simply append identity match clauses to an allow-all ruleset. No rules or application changes are deployed automatically by this implementation.

## Deployment requirements

1. Deploy to `https://tany-messaging-185656276893.asia-south1.run.app` so the connect page/API and generated CTA use the same service. Set `DEMO_AUTH_MODE=true` on Cloud Run to enable demo login; editing local environment files does not change a deployed service.
2. To restore real login later, set `DEMO_AUTH_MODE=false`, enable the intended Firebase Auth providers in `tany-whatsapp`, and authorize the deployed service domain. Existing demo identities are retained; conversion/relinking to real UIDs needs an explicit migration flow.
3. Configure server-only `META_APP_SECRET` as well as the existing Meta sender credentials. Keep all secrets out of NEXT_PUBLIC variables. The literal CTA label “Login / Create Account” is compacted to **Login/Create Account** for the 20-character WhatsApp transport limit.
4. Deploy the reviewed Firestore rules using your normal deployment workflow. `firebase.json` points to the new server-only rules. Consider an `expiresAt` TTL policy for expired session cleanup; runtime expiry checks do not depend on TTL deletion.
5. Exclude token query strings and Authorization headers from platform/access logs and analytics. The connect page sets no-referrer/noindex headers and removes a consumed token from the browser history entry. Application debug logging masks link URLs and 64-character link tokens and never logs identity UIDs.

Firebase authentication follows the official [ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens) and [session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions) contracts.

## Verification

`scripts/test-whatsapp-identity.cjs` covers the unknown/known gate; CTA payload; session reuse, random tokens, expiry, single use and concurrent claims; conflicting UID rejection; preservation of customer and paid-order history; verified Auth/origin enforcement; safe DTOs; click-first menus and typed fallback; pending-intent resume; and signed production webhook checks. Existing vertical tests explicitly seed a linked fixture user rather than bypassing the production identity gate.

Run:

```text
node scripts/test-all-flows.cjs
npx tsc --noEmit
npm run lint
npm run build
```

The regression harness uses in-memory Firestore, mocked Firebase token verification and a mocked Meta sender. Tests do not sign in real users, change production Firestore, send live messages, or prove that deployed routing/Auth providers are configured.
