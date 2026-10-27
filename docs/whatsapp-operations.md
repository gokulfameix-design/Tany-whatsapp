# WhatsApp Operations Dashboard

`/` opens `/admin`. Super Admin and each `/business/{businessId}` workspace now use the same ten WhatsApp modules: overview, inbox, contacts, templates, campaigns, automations, message status, webhook health, WhatsApp accounts and settings. Section URLs use `/inbox`, `/contacts`, `/templates`, `/campaigns`, `/automations`, `/message-status`, `/webhook-health`, `/whatsapp-accounts`, `/settings`.

Legacy business/catalog/order/booking code and URLs are retained for the future main admin. They are absent from the sidebar and command menu. The existing `/business/{businessId}/whatsapp` local-test screen also remains available.

The workspace switcher includes every active business, including workspaces with test Phone Number IDs such as `demo-motos`. A selectable workspace does not imply a live Meta connection. Products without an active business remain disabled as Coming Soon. The Super Admin connected-account aggregation still excludes test IDs.

## Data and behavior

- `operations-service.ts` is a server-only projection over existing businesses, messages, conversations and customers. Every business query includes a `businessId` predicate, with an additional ownership check before projection. Super Admin explicitly aggregates active businesses with numeric WhatsApp Phone Number IDs. No global unscoped message/contact query is used.
- Account DTOs contain only approved identity/status fields. Raw settings, credentials, prepared replies, conversation context and provider error strings never enter operations DTOs. Failure reasons are deliberately generic; restricted server logs retain the details.
- Message processing and delivery states are separate. A processed outgoing message is **unknown**, not sent/delivered/read. `deliveryStatus` records are displayed if present. The existing webhook currently records processing, not delivery receipts.
- Inbox selection filters both `businessId` and customer phone, even when two businesses share the same customer. Handoff writes only the scoped conversation status. The incoming service continues to record messages but pauses bot routing/sending while status is `handed_off`. Returning to bot resumes the existing flow state on the next incoming message. An already in-flight reply may finish before a concurrent handoff takes effect.
- Sending, attachment and location controls are disabled. Template selection creates a page-local draft; it does not send or claim to render template parameters.
- Contacts include only customers with a conversation or incoming message in that business. Unread counts are shown only if recorded; the dashboard does not invent read tracking.
- Templates read top-level `templates` records scoped by business: `name`, `language`, `category`, `status`, `updatedAt`. The read projection is the boundary for a future Meta template provider; no client calls to Meta are made.
- Campaigns read top-level `campaigns` records. Creation validates an approved template in the same business and always writes `draft`, regardless of the requested schedule. Audience is a planning description, not an executable recipient list. Campaign dispatch is unavailable.
- Automation and settings preferences persist at `businesses/{id}/whatsappOperations/config`, separate from flow settings. Rule toggles are saved configuration only; they do not add dispatch/scheduler behavior or replace the twelve vertical flows. Settings preferences are not yet enforced by the engine. Inbox human ownership is enforced immediately for subsequent processing.
- Provider connection verification, account quality/subscription, duplicate-event telemetry and webhook latency remain explicitly unknown / not instrumented. Configured account IDs do not imply successful connectivity. Account diagnostics and test validation are local only.
- Original Tany logos already present under `public/brands` are reused without recoloring. Dates and “today” boundaries use Asia/Kolkata.

## Production access

The pre-existing standalone dashboard had no authentication. Production now fails closed through `proxy.ts` for `/admin/*` and `/business/*`, with additional scope checks in operations reads/actions, legacy mutations, local test validation and workspace switching. Development (`next dev`) retains trusted local access.

A trusted server-side Tany admin gateway must issue `__Host-tany-dashboard` as an HTTPS, HttpOnly, SameSite=Lax or Strict cookie with Path=/, no Domain, and a lifetime no longer than the signed token. Use `signIntegrationAccess(MESSAGING_SERVICE_SECRET, scope, Date.now(), "tany-dashboard-v1")` on that trusted server. Never place the service secret in browser code, a URL or local storage. Tokens expire after 120 seconds and must be refreshed by the gateway. There is no new login or cookie-issuance endpoint in this service.

Dashboard `directory` scope means Super Admin. Dashboard `business` scope permits only that exact workspace and its mutations; the switcher never reads other business profiles. The audience is intentionally separate: an existing `tany-messaging-v1` integration directory token cannot authorize dashboard access, and dashboard tokens cannot access the integration API. Existing integration API contracts remain unchanged. Without gateway integration, production standalone pages return 401; they do not fall back to anonymous access.

## Validation

`node scripts/test-all-flows.cjs` includes the operations, account privacy, admin services and signed integration API suites in addition to all existing flow regressions. The operations suite verifies inbox/contact isolation, same-phone cross-tenant selection, account secret exclusion, delivery/processing separation, health truthfulness, workspace scope, token audience/expiry checks, campaign safety and handoff behavior. Also run `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

Firestore behavior and Meta sending are mocked in automated tests; tests do not write production data or send live messages. Browser visual QA requires an available connected browser.
