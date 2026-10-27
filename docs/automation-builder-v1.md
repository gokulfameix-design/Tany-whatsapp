# WhatsApp Automation Builder v1

Open `/business/{businessId}/automations`. Super Admin `/admin/automations` offers a business selector. The standalone internal console retains its existing unrestricted workspace access; this does not create a public customer administration API or a new auth system.

## Storage

- `automations/{id}`: businessId, name, description, draft/active/paused status, trigger, conditions, ordered actions, createdAt, updatedAt, publishedAt.
- `automation_runs/{sha256(businessId:automationId:eventId)}`: businessId, automationId, trigger, status, startedAt, completedAt, actionsExecuted, sanitized error, definition snapshot, normalized event, cursor/resumeAt, attempts.
- `automation_events/{sha256(businessId:eventId)}`: normalized domain event, automation IDs at emission, pending/processed/failed status.
- `automation_scheduler_cursors/{hashOfBusinessAndAutomation}`: rotates reminder evaluation through up to 100 conversations per rule/tick.

Firestore remains server-only under existing deny-all client rules. All reads, edits, template selection, entity lookups, and executions check business ownership. Server-side validation strips unknown input fields. No credential values are stored in automation definitions or exposed in the UI.

## Triggers and routing

Linked inbound messages emit `customer.message.received` after the identity and human-handoff gates. Creating a conversation atomically queues a stable `conversation.started` event for the worker. Keywords are case-insensitive words/phrases. Interactive selections retain their visible title as typed fallback. Matching automations handle the message; unmatched messages continue the unchanged vertical router. A conversation-started rule runs once per existing conversation document; RESET does not create a second conversation document.

Order/booking creation and actual status changes, and first successful payment completion, atomically commit normalized queued events alongside the domain write. Event IDs include a monotonic entity revision so repeated status transitions remain distinct. Existing business flows do not execute automation actions inside their transactions. The worker processes these events. Creation events represent draft creation, not a promise that an order or booking is confirmed. Use a status-change condition for confirmed notifications.

AND conditions use current business/customer/entity data, with the emitted entity status for status-trigger conditions. New means no other saved order/booking. Time/day conditions use Asia/Kolkata; ranges may cross midnight. Business-hours conditions store explicit opening/closing times on the rule.

## Worker configuration

Set server-only `AUTOMATION_WORKER_SECRET` to a cryptographically random value of at least 32 characters. Configure a trusted scheduler (for example Cloud Scheduler) to POST once per minute per business:

```
POST /api/internal/automations/tick
Authorization: Bearer <server-only worker secret>
Content-Type: application/json

{"businessId":"demo-eats"}
```

Never place this credential in browser configuration. Provision the scheduler in the deployment environment; the builder does not deploy cloud infrastructure.

The worker drains up to 50 domain events and 50 due waits per tick. Schedule triggers are one-shot UTC instants evaluated for each existing conversation, narrowed with conditions. No-reply triggers follow an unanswered outgoing business message, once per rule/message. Automation-originated no-reply messages cannot recursively trigger follow-ups. Existing linked-customer, sender readiness, backend entitlement and WhatsApp reply-window requirements remain in force. Use approved text templates outside 24 hours. Only BODY/FOOTER templates with explicit numbered text parameters are supported in v1.

## Execution safety

A Firestore transaction claims each event/rule exactly once. Action order is persisted. Delay saves the definition snapshot and next-action cursor instead of sleeping in a request. Paused/deleted rules and human handoffs stop resumed runs. Handoff also stops remaining actions and existing bot flow execution until staff resumes it in Inbox.

Automatic attempts are capped at one; an uncertain external send is never replayed. Interrupted running records are failed after 15 minutes for manual review. This favors avoiding duplicate customer messages over automatic recovery. Run failures persist generic diagnostics, never raw provider errors or credentials. Outgoing automation messages are written to existing `messages` storage and use the existing delivery receipt pipeline. Updating state/tag does not emit new bot events, preventing loops.

Payment-link actions require a business/customer-owned pending payment linked back to the same order/booking, matching amount/currency, nonterminal entity status and an existing HTTPS Razorpay URL. The builder does not manufacture payment links or mark payments paid.

Editing an active automation saves a draft and stops execution until republished. Duplicate creates a new draft. Deleting a rule preserves run history. Ten starter templates are editable; the appointment schedule must be set before saving/publishing.

## Verification

`node scripts/test-all-flows.cjs`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Product-aware templates

Create Automation offers **Use Recommended Template** and **Start from Scratch**. Product templates are selected from the business record's `vertical` on the server. The recommended gallery and **View all templates** never include another vertical's catalogue. Each of the 12 products includes Welcome, Business Closed, No Reply Follow-up, Payment Reminder, Feedback and Human Handoff alongside product-specific templates.

Templates contain `id`, `vertical`, `name`, `description`, `category`, `recommended`, `trigger`, `conditions`, `actions` and `active`. They are private source definitions in code, not customer-editable Firestore records. Every read returns a copy. **Use Template** creates a new business-owned Firestore draft, then opens the existing builder. Editing/publishing the draft cannot modify the source or another draft. Scheduled drafts default to tomorrow, show a warning and their exact UTC schedule in Review, and never activate until published. Missed-appointment follow-ups require a staff-supplied `missed_appointment` tag; they do not infer attendance or invent a booking status.

Supported placeholders in message text and approved-template parameter values:

| Placeholder | Scoped source |
| --- | --- |
| `{{business_name}}` | Business name |
| `{{customer_name}}` | Customer's saved name |
| `{{order_id}}` | Current/event order document ID |
| `{{booking_date}}` | Current/event booking date |
| `{{booking_time}}` | Booking start time |
| `{{amount}}` | Payment amount, else order total, else booking amount; two decimal places |

Unsupported tokens are rejected on save. Missing required context stops the action with a sanitized failed run; no unresolved token, UID or secret is substituted. Choice labels remain static to respect WhatsApp's title limits. Approved Meta template bodies retain their numbered placeholders; named automation placeholders are resolved in their supplied parameter values. Rendered messages and parameters are length-checked before sending. All existing payment validation, reply-window, identity, sender and human-handoff checks remain active.

Product welcome buttons use the existing typed vertical fallback, so selecting a primary action opens the original order/booking journey. No vertical business logic was added to the webhook.
