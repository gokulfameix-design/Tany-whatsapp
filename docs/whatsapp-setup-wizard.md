# Pro WhatsApp setup wizard

Entry: `/business/{businessId}/whatsapp` → **Set up WhatsApp** → `/business/{businessId}/whatsapp/setup`.

The five steps are Setup Type, WhatsApp Details, Review, Test, Activate. Existing-account setup collects display name, international phone, Phone Number ID, WABA ID and a token secret **name**, never a token value. Saving persists a pending draft; review and testing can resume after reload. New-account setup collects desired display name, phone and business name, then shows a saved pending request and “Tany will help complete your WhatsApp Business setup.” It cannot test or activate. No Meta account creation, Embedded Signup, webhook subscription or automatic number registration is performed.

## State and storage

`whatsapp_accounts/{businessId}` is the canonical single account/draft per business. It stores the requested businessId, vertical, setupType, displayName, displayPhone, phoneNumberId, wabaId, tokenSecretName, status, setupStep, createdAt and updatedAt fields. Additional server-managed fields are businessName, revision, testPassed, testMessage, validationMode and testedAt. No access-token value is stored or returned.

Existing setup transitions: pending → testing → pending (successful test, Activate step) → connected. A failed test sets error. Disconnect sets disconnected, clears test approval, increments revision, and pauses automation. Re-editing clears approval. Activation requires a successful test in the last 15 minutes and rechecks entitlement and unique mapping. Duplicate tests are rejected; disconnect invalidates an in-flight result. A stranded testing request can be stopped through **Stop test and edit details**. Test-message acceptance is not a delivery receipt.

`whatsapp_phone_mappings/{phoneNumberId}` stores businessId, accountId and updatedAt as a transactional uniqueness reservation. Setup checks reservations, other account records, and existing business phone mappings. Legacy business creation/configuration paths also honor reservations. Activation updates the business's existing webhook phone mapping atomically with account status; profile edits cannot change wizard-controlled routing. Editing does not delete customer, order, booking or conversation data. Disconnection retains the phone reservation.

Accounts created through the wizard pause incoming automation until connected. Sending uses that account's server-side secret reference and never falls back to global credentials for a paused/reconfigured wizard account. Existing integrations without account documents retain their current behavior and entitlement gate.

## Authorization and API

The page requires the existing scoped dashboard authorization plus `hasEntitlement(businessId, "whatsappAutomation")`. The setup API at `/api/businesses/{businessId}/whatsapp/setup` verifies the same signed dashboard cookie, checks entitlement on every GET/POST, and requires a same-origin POST. Services independently enforce the entitlement. Unentitled pages show **Available with Pro**; the API returns the existing structured `UPGRADE_REQUIRED` response (403). Expiry and inactive subscriptions fail closed. As with the existing dashboard, local `NODE_ENV=development` uses local administrator access; entitlement checks still apply.

GET returns a safe account projection. POST supports `save` with `details`, `test` with optional `mode`, `sendTest` and `recipient`, `activate`, and `disconnect`. Business scope comes from the authorized route, not body fields. No action accepts client status, test approval, revision, vertical or access token. Existing client Firestore rules deny direct writes to accounts and reservations.

## Manual/test and live configuration

The modes are deliberately distinct:

- `WHATSAPP_SETUP_ALLOW_MANUAL_TEST=true` permits explicit `mode: "manual_test"` format/mapping validation and test activation. It makes no provider call and sends no message. UI and saved results identify the connection as manual/test and state that live connectivity was not verified. This flag is enabled only in local `.env.local` for demo testing; `.env.example` defaults to false. Deployment requires an explicit server configuration decision.
- Live validation requires `WHATSAPP_SETUP_LIVE_TESTS=true`, an allowlisted mounted secret environment variable, and a business-to-secret binding. Example non-secret configuration: `WHATSAPP_TOKEN_SECRET_NAMES=TANY_EATS_TOKEN` and `WHATSAPP_TOKEN_SECRET_BINDINGS={"demo-eats":"TANY_EATS_TOKEN"}`. Mount the actual token via your existing secure runtime/Secret Manager environment configuration; it is never a browser variable or Firestore field. A business cannot select another business's mounted credential.
- Live validation reads the WABA phone-number list, matches the exact Phone Number ID and normalized display phone, and checks local tenant mapping. Tokens are passed only as Authorization headers. The bounded first page supports 100 numbers; an absent mapping fails closed. See Meta's official [Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) for its phone-number endpoint.
- An optional test message additionally requires explicit user opt-in and a recipient in the server's `WHATSAPP_SETUP_TEST_RECIPIENTS` list (international digits, comma-separated). Validation without opt-in is read-only. No safe configuration means a clear failure, not a claimed live success. Upstream provider errors and tokens are never returned or logged by the wizard.

Connected cards show Connected, display name, phone, product, Automation ON and Manage WhatsApp. Normal card/final screens show no provider IDs. Technical fields appear only in manual existing-account details/review. A manual/test connection displays its limitation; it does not manufacture live credentials or prove message delivery.

Regression coverage is in `scripts/test-whatsapp-setup.cjs`. It uses in-memory Firestore and mocked provider fetches; it never changes live accounts, sends live messages or deploys configuration.
