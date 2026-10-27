# WhatsApp Automation entitlements

`subscriptions/{businessId}` stores `businessId`, `product`, `plan`, `status`, `startedAt`, `expiresAt`, and `updatedAt`. Supported plans are basic, standard, pro. Supported statuses are active, trialing, past_due, cancelled, expired. Dates are Firestore timestamps. Demo assignments use product `whatsappAutomation` and a 30-day term.

`entitlements/{businessId}` stores `businessId`, boolean `whatsappAutomation`, `campaigns`, `advancedAnalytics`, `aiAssistant`, and `updatedAt`. Only Pro currently enables WhatsApp Automation. All other feature flags default to false; no additional paid features are implemented by this change.

`lib/subscriptions/entitlements.ts` owns the plan policy and reusable `hasEntitlement(businessId, feature)`/`requireWhatsAppEntitlement` checks. Access requires an active subscription whose start has arrived and whose expiry is in the future, matching tenant IDs in both documents, the plan policy allowing the feature, and the stored entitlement being true. Missing/malformed records fail closed. A stale true entitlement cannot elevate Basic/Standard. Trialing and past_due do not grant access. Checks read current records without a process cache.

## Server enforcement

Existing integration account setup/management/test operations, dashboard account configuration and automation mutations, direct business-profile configuration updates, outgoing send API, customer link creation/inspection/confirmation/notification, and incoming automation orchestration enforce the central gate. The integration and send APIs retain signed business-scoped authorization, checked before subscription access. Body fields cannot select a different authorized tenant or change plans. No public endpoint can assign subscriptions.

Denied API operations return HTTP 403 and `{ success: false, code: "UPGRADE_REQUIRED", feature: "whatsappAutomation", requiredPlan: "pro", message: "..." }`. Server actions return the same details with `ok: false`. Signed incoming Meta events for a locked business are acknowledged with the structured denial and no domain/customer/message/send writes, avoiding provider retries for a billing state. GET Meta verification and signature verification are unchanged. Business/profile creation is still a general admin function, not Meta account provisioning; a business without a subscription cannot use its configured WhatsApp ID for automation.

The business WhatsApp page and accounts view show **WhatsApp Automation**, **Not set up**, **Set up WhatsApp** for entitled businesses; locked businesses see **Locked**, **Available with Pro**, **Upgrade to Pro**. Setup opens the Pro-only five-step wizard and rechecks authorization and entitlement server-side. See `docs/whatsapp-setup-wizard.md` for manual/test connection and assisted requests. Upgrade directs users to their administrator. Meta Embedded Signup and billing checkout are not implemented. Business feature cards show no provider IDs. Super-admin operational aggregation includes only entitled businesses.

## Internal demo assignment

Run with trusted Firebase Admin credentials configured locally:

```powershell
node scripts/assign-demo-subscription.cjs demo-eats pro
node scripts/assign-demo-subscription.cjs demo-eats basic
node scripts/assign-demo-subscription.cjs demo-eats standard
node scripts/assign-demo-subscription.cjs demo-eats pro cancelled
```

The CLI invokes the central `assignDemoSubscription` method and atomically writes both subscription and entitlement records for an existing business. It does not touch customer/order/history records or integrate payments. The manual CLI changes real Firestore in the configured project when run. No live assignment or migration is performed by tests or application deployment; existing businesses require an explicit assignment. Existing deny-all client Firestore rules cover these collections; Admin SDK access stays server-side.

`scripts/test-entitlements.cjs` covers plan/status/expiry, missing and malformed records, spoofed entitlement data, API bypass attempts, linking/activation gates, tenant isolation, and an entitled signed webhook flow. Legacy flow fixtures explicitly seed active Pro records for their test businesses. There is no demo-ID exemption in production code.
