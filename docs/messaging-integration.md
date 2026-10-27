# Tany admin integration

The primary UI is in the separate TanyApps app under /admin/messaging. This service retains all Firebase Admin and messaging domain ownership. Existing standalone dashboards remain for development.

Configure MESSAGING_SERVICE_SECRET (one random private value of at least 32 characters) identically in both server deployments. Configure MESSAGING_SERVICE_URL in the main app to this service HTTPS origin; loopback HTTP is supported locally. Never expose the secret using NEXT_PUBLIC. Existing Firebase/Meta credentials remain unchanged.

/api/integration/v1/businesses supplies a safe directory. Business resource endpoints expose overview, conversations, templates, status, webhook, setup and local test validation. Short-lived HMAC credentials bind every business request to a businessId; directory credentials cannot access business resources. Responses are private/no-store. Setup edits reuse existing uniqueness and input validation, preserve unrelated settings and expose no access tokens. Test validation never sends messages.

The main app checks existing Super Admin authorization on each read/action. It uses service business IDs directly rather than guessing mappings to main app dealer IDs. Provider health/template synchronization remain pending setup when unavailable.

Verify: node scripts/test-integration-api.cjs; node scripts/test-whatsapp-dashboard.cjs; node scripts/test-admin-services.cjs; node scripts/test-all-flows.cjs; npx tsc --noEmit; npm run lint; npm run build.
