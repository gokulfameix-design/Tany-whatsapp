# Client WhatsApp operations workspace

The existing messaging service remains a separate workspace. The client switcher contains **Product Dashboard** and **WhatsApp Dashboard**. The product destination is the server-configured `TANY_PRODUCT_DASHBOARD_URL` (default `https://app.tany.in/dashboard`); it never embeds a messaging credential. This change does not modify the main product application or introduce another authentication system.

## Authentication and access

The Product Dashboard now has a lightweight workspace switcher on desktop and mobile. Its server action resolves the authenticated Tany membership and an administrator-provisioned `TANY_MESSAGING_BUSINESS_BINDINGS` mapping (main dealer UUID to messaging business ID). It calls the existing signed business-scoped integration protocol to request a handoff. The service stores only a hash of a random, single-use, 60-second capability in `dashboard_handoffs`, rechecks entitlement at exchange, and issues an HttpOnly/Secure/SameSite=Lax `__Host-tany-dashboard` cookie with a signed one-hour `tany-dashboard-v1` assertion. No account credentials are exposed to the browser. Existing trusted-gateway dashboard assertions are still supported. `resolveDashboardSession` derives the business from its verified scope. A URL/query/body business ID cannot select a different business. Expiry, signature and audience are verified; ordinary integration API tokens cannot become dashboard sessions. `/dashboard` opens the authenticated business workspace (or `/admin` for Super Admin). The existing local development administrator mode remains explicit and unchanged.

Client navigation is Overview, Inbox, Contacts, Templates, Campaigns, Automations, Message Status, Settings. Direct client visits to Webhook Health, WhatsApp Accounts and Setup Requests are rejected, as are legacy product/diagnostic pages for a business session. Client layouts and projections contain no account IDs, secret references, raw account settings, Firebase UIDs or operational diagnostics. API writes require a same-origin request and a verified session. Admin actions independently recheck scope.

Every client page/read/write requires an active `whatsappAutomation` entitlement. A denied client gets the existing locked upgrade screen. An entitled but unconnected client gets the setup card. Connected clients get the full operations panel. Existing connected legacy accounts are supported as well as wizard-connected accounts. Changes in entitlement/connection status are rechecked during polling and before sends. Browser hiding is not the access boundary.

Super Admin retains all-business Overview, WhatsApp Accounts, Message Status, Webhook Health, Setup Requests, plus existing operations pages. Admin aggregation includes inactive, unconfigured and unentitled businesses for visibility; automation mutations/sends still require entitlement. Setup requests are projected from each business's canonical account document, without credentials.

## Operations

- Overview metrics use India Standard Time for today's messages, incoming, outgoing, recorded delivered/read/failed counts. Active conversations and handoffs are current scoped conversation totals. Recent conversations and failures use the same business projection.
- The inbox displays customer name/phone, last message, timestamp, unread count, human/bot status, a message thread, receipt statuses, composer, template picker and existing handoff controls. Client data refreshes every eight seconds without discarding drafts. Read markers use `conversations.dashboardReadAt`; new incoming records after that watermark become unread without altering flow state.
- Operator replies require human handoff and a connected entitled business. Recipient and sender account are resolved server-side. Free text is allowed only within 24 hours of the latest incoming customer message. Outside that window, use an approved business-owned text template. Body parameters are required and validated; templates with unsupported media/header/button components fail clearly instead of sending an incorrect payload.
- `/api/dashboard/operations` provides scoped read, read-marker, handoff, configuration, campaign-draft and send operations. Client body fields cannot set another business or customer. Text replies reuse the current sender; template requests resolve credentials only on the server. Operator messages are stored with source `operator`, durable status and a per-business request ID. A repeated request cannot send twice. Uncertain/failed sends are not silently retried; inspect status before composing another attempt.
- Contacts/templates/campaigns/automation preferences/settings remain scoped to the business. Campaign drafts do not dispatch a broadcast. Existing automation preferences are persisted without changing the flow engine; human handoff remains immediate. No order, payment, booking, router or vertical-flow logic is changed.

## Delivery metadata

The existing raw-body/HMAC-verified webhook path accepts delivery receipt metadata. `message_delivery_events` stores only businessId, messageId, status, provider timestamp and creation time, with deterministic deduplication. Each update/query is business-scoped; receipts cannot change another business's message with the same provider ID. Sent → delivered → read transitions do not regress on an older receipt. Failed status does not overwrite a delivered/read confirmation. Receipts that arrive before the outgoing record are reconciled by the read projection. Receipt handling never invokes the router or changes conversations/orders/bookings.

## Verification

`scripts/test-client-operations.cjs` covers authenticated scope, direct URL/API denial, admin-only sections, sanitized projections, entitlement and setup gating, read markers, customer-resolved recipients, human handoff, the reply window, approved template parameters, idempotent sends, delivery receipts, all-business admin visibility and unchanged flow context. Provider sends and Firestore are mocked. No live operator message is sent by tests.

Run `node scripts/test-all-flows.cjs`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.


Product app configuration (server-only): `TANY_MESSAGING_API_URL`, the existing shared `MESSAGING_SERVICE_SECRET`, and `TANY_MESSAGING_BUSINESS_BINDINGS={"main-dealer-uuid":"demo-eats"}`. Provision the mapping explicitly; it is never guessed from IDs, names or phone numbers. Missing mappings fail closed with a business-linking message. Unentitled businesses get the upgrade state in the product switcher without being granted a messaging session. These configuration examples do not assign live businesses or change subscriptions.
