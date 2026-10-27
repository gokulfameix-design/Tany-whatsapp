# Remaining nine verticals

Catalog examples and prices below are regression fixtures. Runtime flows now use
business-scoped Firestore catalog/config services with no demo fallback; see
[CATALOG.md](../CATALOG.md). Prescription-required products remain blocked, and only
business-declared OTC records are eligible for the Meds order flow.

The per-vertical entry files delegate to the shared commerce or appointment flow;
Cabs has a small dedicated orchestrator. Router logic only dispatches. Existing
Eats, Salon and Motos files, Firebase initialization, environment settings, and
the generic webhook remain unchanged.

All catalog/variant/slot choices have stable prefixed IDs and typed equivalents.
The flows accept string or normalized incoming input, including coordinates.
Conversation context uses shared JSON helpers. Drafts and payments are reused
transactionally, including concurrent messages; RESET clears their conversation
references and cancels unfinished records. Confirmed/paid records are retained.
The existing prepared-result/outgoing-message retry mechanism remains in use.

## Commerce

- Retail: T-Shirt/Jeans/Shoes/Bag with mock size-and-color options. One selected
  product/variant is the current cart; quantity is a positive integer up to 10000.
- Ecom: Gifts/Pooja/Home/Fashion discovery followed by quantity and budget per
  item. `100 return gifts under ₹100` is supported. `quoteId` refers to the draft
  order; `estimatedTotal` is quantity times the budget per item. These are mock,
  budget-based estimates subject to supplier approval, not actual supplier offers.
  CONFIRM creates only an internal pending-payment placeholder for that estimate.
- Meds: Only the four requested mock OTC catalog entries are orderable. Mock unit
  prices are Paracetamol ₹20, ORS ₹25, Vitamin C ₹100 and Bandage ₹30, without
  strength/pack assumptions. Availability is a test flag, not real pharmacy stock.
  No dosage, diagnosis, substitution or treatment recommendations are generated.
  Prescription/clinical/unknown-product requests receive the prescribed safety
  response. Uploaded prescriptions are not automatically validated or approved;
  such requests remain blocked for licensed review. Only an explicit allowed OTC
  selection or RESET exits that path.
- Meat: Mock kilogram prices with Curry Cut/Small Cut; Boneless is offered for
  Chicken/Mutton only. Decimal kg or grams (e.g. `500g`) are supported, capped at
  1000 kg per test order. Delivery uses native/shared saved coordinates.

Commerce totals use the order service; delivery fee and discount are zero.
Meds/Meat require location. Other commerce flows do not add a delivery step.
Completion requires a trusted paid order/payment record; typing "paid" cannot
settle anything. No Razorpay calls or real payment links are generated.

## Appointments and cabs

- Garage: customer make/model, mock service, date/time and a service estimate;
  confirmation completes the conversation without payment.
- Expert: CA/Legal/Business consultation, date/time, pending payment, then trusted
  paid completion. This schedules consultations and gives no professional advice.
- Gaming: PS5/Xbox/Racing Simulator, 1–4 whole hours, date/time, payment.
- Sport: Badminton Court/Cricket Turf/Fitness Class. One fixed mock main venue or
  class is selected with the activity; court/turf booking duration is one hour,
  Fitness is one session. No real venue inventory is queried.
- Cabs: typed or shared-location pickup/destination, vehicle, base-fare estimate,
  confirmation. The estimate is just the supplied base fare, excluding distance;
  confirmation stores a booking without contacting a driver or dispatch service.

Appointments use Asia/Kolkata, today/tomorrow, ISO, DD/MM/YYYY or named-month dates.
Yearless dates use the current year. Slots run from 10:00 through 19:00, omitting
13:00; the entire session must finish by 20:00. Past/invalid dates and elapsed slots
are rejected. Date/time are collected step by step; no LLM or free-form itinerary
parser is used. No capacity/conflict checks against a real staff/resource calendar
are implemented. Slot policies are isolated in `batch-scheduling.ts`.

## Verification

```powershell
node scripts/test-all-flows.cjs
npx tsc --noEmit
npm run lint
npm run build
```

The runner executes the nine individual new suites plus all seven existing flow,
webhook, interactive, domain-service and development-endpoint suites, failing on
the first error. Tests use mocked Firestore and transport and make no live calls.
