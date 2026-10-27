# Shared messaging backend

Runtime catalogs, prices, service durations, inventory and business-specific
options now come from Firestore. See [CATALOG.md](./CATALOG.md) for the schema,
settings, seed commands and isolation rules. Earlier demo examples below describe
the regression fixtures; they are not runtime fallbacks.

The webhook keeps Meta GET verification and the existing first-message payload
parsing. POST resolves an active `businesses` record by `whatsappPhoneNumberId`,
then delegates to `services/incoming-message-service.ts`. All twelve verticals
still use the shared router. Eats delegates to a deterministic ordering flow;
Salon delegates to a deterministic booking flow; the other ten verticals retain
their generic responses.

The processing service reserves the incoming message, gets the customer and
conversation, routes it with conversation context, persists state, sends using the
existing `sendWhatsAppText`, stores the outgoing message, and marks the incoming
message processed. Native WhatsApp location messages also update customer location.

## Collections and IDs

- `businesses`: unchanged lookup by Meta phone number ID and `active: true`.
- `customers`: `${businessId}_${phone}`.
- `conversations`: `${businessId}_${customerPhone}`. Old documents gain missing
  defaults when loaded without resetting existing state or deleting extra fields.
- `orders`, `bookings`, `payments`: generated Firestore document IDs.
- `messages`: incoming Meta message ID when valid as a Firestore ID, SHA-256
  fallback otherwise. Outgoing replies use a deterministic `reply_` hash linked
  to their incoming ID and retain the provider's outgoing message ID in data.

## Service conventions

- Service results include the document ID as `id`; this is not duplicated in data.
- New writes use Firestore server timestamp transforms. Returned objects may
  contain pending transforms; subsequent reads return resolved timestamps.
- Conversation context is JSON-compatible. Helpers clone values, reject unsafe
  keys and invalid/cyclic data, and merge at the top level. Reset clears context.
- Location references are stored in context as `customerLocationId` and a JSON
  location summary. The canonical location, including timestamp, is on the customer.
- Amounts are decimal INR rupees, rounded to two decimals. Order item totals and
  order totals are derived; caller-supplied item totals are ignored. Adding an
  existing item ID combines its quantity using the supplied unit price. Updates
  cannot change document ownership, currency, IDs or creation time.
- Booking dates and times are strings (`YYYY-MM-DD`, `HH:mm` by convention).
  Scheduling, availability checks and vertical-specific business rules are deferred.
- Payment records are internal placeholders. Creating one does not contact
  Razorpay or automatically change the referenced order or booking. Paid/failed
  updates are internal service calls and are not public payment-confirmation routes.

## Idempotency and retries

Incoming claims are Firestore transactions with five-minute leases. Processed
messages and currently claimed messages return `success: true` with
`skipped: "duplicate_message"`. Failed messages, or expired claims, can be
reclaimed on a subsequent delivery; no background retry worker is installed.
Previous random-ID incoming records are recognized by a `messageId` query.
The `from` field is retained alongside the common `customerPhone` field.

Each claim has a token, so a superseded worker cannot finish a newer claim.
An already stored outgoing reply prevents routine resends on retry. Firestore
and Meta cannot commit atomically: a crash/network failure after Meta accepts a
reply but before its outgoing record is saved can still produce a duplicate on
retry. This foundation does not promise exactly-once external delivery. Operations
that could exceed the lease will need renewal/queueing before adding long flows.

## Local verification

From PowerShell:

```powershell
cd "C:\Tany whatsapp\tany-messaging"
node scripts/test-messaging.cjs
node scripts/test-domain-services.cjs
npx tsc --noEmit
npm run lint
npm run build
```

Both test scripts load the real TypeScript modules with mocked Firestore and
mocked WhatsApp transport. They need no Firebase credentials or Meta token and
perform no live sends. The production webhook still uses the existing live
sender and existing environment settings. `demo-eats` returns `vertical: "eats"`
and `state: "eats_awaiting_item"` for the `hello` dummy webhook test.

## Tany Eats

`flows/eats.ts` implements a single-item ordering conversation. The mock menu is
Chicken Biriyani ₹180, Mutton Biriyani ₹250, Dosa ₹60 and Idli ₹40. A leading
positive whole-number quantity is optional; without one the flow asks for it.
Bare `biriyani` is an alias for Chicken Biriyani (and `biryani` is accepted).

Messages progress through `eats_start`, `eats_awaiting_item`,
`eats_awaiting_quantity`, `eats_awaiting_location`, `eats_awaiting_confirmation`,
`eats_awaiting_payment` and `eats_completed`. Context holds the canonical
`itemName`, `quantity`, `orderId`, JSON `location` and `total` as they become known.
Saved customer coordinates skip the location request. A native WhatsApp location
event or a valid JSON location in conversation context can supply delivery data.
Delivery fee is zero. CONFIRM creates/reuses a pending internal payment linked to
the order using a transactional idempotency key; it does not generate a real link.
Payment creation without an idempotency key retains the shared service's existing
behavior. The read-only `getPayment` service supports checking payment state.

CANCEL cancels an unpaid order and sets conversation status to `cancelled` with
state `eats_completed`. RESET cancels an unfinished order, clears conversation
context and returns to `eats_start`; the customer's canonical saved location is
retained. Settled orders remain paid. A stored paid order/payment completes the
conversation on the next message; typing "paid" never changes payment status.
No full vertical logic, actual payment capture or fulfillment is implemented.

Additional end-to-end mocked test:

```powershell
node scripts/test-eats-flow.cjs
```

## Tany Salon

`flows/salon.ts` uses `salon-config.ts` for the five mock services and optional
stylists (Any Stylist, Arun and Priya). `salon-scheduling.ts` contains deterministic
service/date/time extraction and a replaceable business-hours availability policy.
The flow advances through `salon_start`, `salon_awaiting_service`,
`salon_awaiting_date`, `salon_awaiting_time`, `salon_awaiting_stylist`,
`salon_awaiting_confirmation`, `salon_awaiting_payment`, and `salon_completed`.
Stylist selection is only requested if an explicitly requested name is unknown;
otherwise Any Stylist is selected automatically.

Dates use Asia/Kolkata. Today, tomorrow, day/month/year, ISO dates and day/month
names are supported. Dates without a year use the current business year; past
dates are rejected rather than moved to next year. Times accept AM/PM or 24-hour
notation. The full service must fit between 09:00 and 20:00, and already elapsed
slots today are rejected. No staff calendar or capacity management is implemented.

Salon opts into `createDraftBooking({ ..., reuseConversationDraft: true })`,
which atomically links/reuses a single draft in conversation context, including
concurrent deliveries. The default independent-draft behavior is unchanged.
Confirmation creates/reuses a pending payment with a booking idempotency key.
When a stored payment becomes paid, the next message confirms the booking and
completes the conversation. Text such as "paid" never changes payment status.
CANCEL cancels unfinished bookings; RESET cancels unfinished bookings and clears
context while preserving the customer. Paid/confirmed/completed bookings are
retained. No Meta or Razorpay access is needed for the tests.

```powershell
node scripts/test-salon-flow.cjs
```

The Salon tests inject a fixed clock (23 October 2026, 10:00 Asia/Kolkata) and also
check the UTC/India midnight boundary. Production uses the actual current time.

## Interactive messaging

Flow results now contain `reply: MessagingReply`, a discriminated union of `text`,
`buttons`, and `list`, each with a `body`. `replies.ts` normalizes old string replies,
validates choices and limits, and provides `replyTextFallback` with visible choice
labels. Empty/invalid choice sets become text. Eats and the other generic verticals
produce text replies; their business logic is unchanged.

`sendWhatsAppMessage` builds text or interactive Meta payloads. Its optional
`textOnly: true` sends the text fallback; `sendWhatsAppText` remains a compatibility
wrapper. API errors do not automatically trigger a second send. The webhook and
Eats development endpoint retain the existing HTTP `reply` string and add
`structuredReply`; conversation `pendingReply` remains the body string.

`incoming.ts` normalizes Meta text, button selections, list selections, and native
locations. IDs/titles and location data are preserved in incoming message records.
Salon uses stable IDs for service lists, date buttons, time lists, optional stylist
buttons, and confirmation/cancel buttons. IDs are mapped by the active state;
unrecognized/stale selections cannot execute their display title as a command.
Typed service/date/time/stylist/confirmation input still works. Fully specified
typed requests still default to Any Stylist. Slot lists exclude elapsed times
and appointments that would finish after closing; no actual staff calendar is used.

The message service stores the prepared flow result before sending and reuses it
after a send failure. Retrying an old interactive selection therefore does not run
the flow again in a new state. Successfully sent replies retain their reply type,
body, and button/list details in the outgoing record. The existing outgoing-ID
check still suppresses routine resends; the documented Meta/Firestore commit gap
remains. The generic webhook itself contains no vertical-specific conditions.

```powershell
node scripts/test-interactive-messaging.cjs
node scripts/test-salon-flow.cjs
node scripts/test-eats-flow.cjs
node scripts/test-messaging.cjs
node scripts/test-domain-services.cjs
node scripts/test-dev-eats.cjs
npx tsc --noEmit
npm run lint
npm run build
```

All tests use mocked transport/Firestore; sender tests replace `fetch` locally and
never contact Meta or Razorpay. No environment file or credentials are changed.
