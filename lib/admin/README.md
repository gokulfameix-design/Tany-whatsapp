# Internal business dashboard

Visit `/admin` for WhatsApp Operations. Legacy business/catalog pages remain at `/admin/businesses` but are absent from primary navigation. The dashboard uses the existing
server-side Firebase Admin instance and writes the same business/catalog schema
used by all twelve messaging flows. It never calls Meta or Razorpay.

Pages support business creation, profile/settings editing, activation, per-business
statistics, and scoped catalog creation/editing/availability/deletion. Metadata is
a flexible JSON editor with suggested keys for the current vertical. Meds uses
`otcEligible`/`prescriptionRequired` in the editor and writes the canonical
`otc`/`requiresPrescription` fields for the existing flow. Prescription-required
items cannot be marked OTC through these fields.

Server Components read through `lib/admin/services.ts`; mutations use the Server
Actions in `app/admin/actions.ts`. The data-access module is marked `server-only`.
Only explicit plain-data DTOs go to the browser. Firebase credentials/environment
variables are never sent to client components. Framework action origin checking remains enabled. See `docs/whatsapp-operations.md` for the production signed-session boundary. Local development assumes trusted administrators.

Business IDs are editable only before creation and immutable afterward. Catalog
forms bind their business/item IDs server-side and reject ownership/ID fields in
editable payloads. Every catalog query/write uses the business subcollection;
an item ID alone never determines its tenant. Deletion requires typing `DELETE`
and the server checks that confirmation. Existing conversations/orders/bookings
are retained when a catalog item is deleted.

Changing a business vertical preserves catalog and conversation history. It does
not migrate existing conversations to a new flow; that needs separate migration.
Settings/metadata JSON editors replace their respective JSON objects, so removing
keys is intentional. Known operational fields and all JSON/basic form input are
validated; additional JSON-compatible keys are preserved. Phone number IDs cannot
be assigned to another business through these forms. Toggle actions update only
the status field to avoid overwriting unrelated concurrent edits.

Statistics use Firestore aggregation counts scoped by businessId. Existing catalog
validation hides malformed legacy catalog entries from the editor; such records
need repair in Firestore. New and edited records are always validated.

```powershell
node scripts/test-admin-services.cjs
node scripts/test-all-flows.cjs
npx tsc --noEmit
npm run lint
npm run build
npm run dev
```

CRUD and tenant isolation tests use mocked Firestore. Read-only browser checks can
use the configured connection; tests do not mutate the live business collection.


## Dashboard modes

- Super Admin stays at `/admin` and `/admin/businesses`, with create/profile management and an **Open workspace** action.
- Business workspaces use `/business/{businessId}` and `/catalog`, `/orders`, `/bookings`, `/customers`, `/conversations`, `/settings`.
- The former `/admin/businesses/{businessId}/catalog` URL redirects to that same business's workspace catalog.
- Both modes reuse the existing catalog/profile actions. Revalidation refreshes the corresponding workspace layout and all existing admin paths.
- Plan and plan status are optional descriptive fields in `settings.plan` and `settings.subscriptionStatus`; no billing, entitlement, or flow rules are added.
- Operational collection queries always include `where("businessId", "==", businessId)`. The server validates the collection allowlist and business existence, projects only display fields, and serializes timestamps before returning data to client components.
- Records are read within the business scope, sorted in memory by their available update timestamp, and recent activity shows at most eight updates. This initial read-only dashboard uses no composite indexes or pagination.
- These are dashboard modes, not permission roles. Authentication remains intentionally absent; the URL identifies which business an internal administrator is managing.


## WhatsApp monitoring

`/business/{businessId}/whatsapp` is a separate operational view with Overview, Templates, Message Status, and Webhook Health tabs. Conversations remains the chat-history page.

- Message reads use `messages.where("businessId", "==", businessId)` and return only direction, safe type/status enums, record ID, and serialized creation time. Message text, prepared replies, raw provider errors, lease tokens, and settings are excluded.
- Connection identifiers use the existing profile: `whatsappPhoneNumberId`; optional `whatsappBusinessAccountId` / `wabaId`; optional `whatsappDisplayPhoneNumber` / `connectedNumber`. Existing flexible `settings.whatsapp` supports `wabaId`, `connectedNumber`, and `displayPhoneNumber`; `settings.wabaId` is also recognized. No migration or writes are performed.
- Identifiers are configuration, not proof of a live connection. Token health, live verification, Meta template synchronization, and delivery/read receipts remain explicitly unverified or pending setup.
- Last webhook time means the creation time of the latest stored incoming message, not the last processing retry or a status-only callback. Last outgoing status describes local send records, not delivery.
- **Test message** validates a recipient/message and reuses `buildWhatsAppPayload` locally. It never calls the sender, reads credentials, stores messages, or advances a messaging flow.
- Business shell and switcher client props receive an empty settings object; monitoring views receive a dedicated safe projection.

Validation: `node scripts/test-whatsapp-dashboard.cjs`.
