# Click-first WhatsApp flows

All linked WhatsApp messages use the shared click-first adapter from `router.ts`. The webhook remains a transport/business lookup boundary; it has no vertical UX rules. The incoming-message service still performs identity linking, duplicate claims, handoff checks, durable prepared replies and the existing send/retry sequence. No authentication, payment provider or business workflow was replaced.

The underlying vertical handlers retain their typed APIs and business validation. The production orchestrator enables the presentation adapter only after identity resolution. Selected values are passed through those same handlers; prices, available inventory, quantity limits, prescription restrictions, appointment policy, cancellation and payment state remain authoritative there. Direct domain tests continue to exercise the typed handlers, while the new click-first suite exercises actual linked-message orchestration for every vertical.

## Shared interaction behavior

- Hi / Hello / Start produce three-button, vertical-specific main menus. New primary IDs include `eats_start_order`, `salon_book`, `motos_browse`, `cabs_book_ride`, `retail_shop`, `ecom_shop`, `garage_book`, `meds_find`, `meat_order`, `expert_book`, `gaming_book` and `sport_book`. Old `tany:start`, `tany:history` and `tany:help` replies remain compatible.
- Up to three choices use buttons; larger sets use lists. Long sets paginate using eight content rows plus navigation, keeping the ten-row transport limit. Native flow choices keep their original validated IDs internally. Rendered wrapper IDs are stable, vertical-namespaced hashes of choice keys; incoming display titles are never interpreted as commands.
- Wrapper selections must belong to the last server-rendered menu and match its conversation state. A stale or unknown wrapper choice does not run a command, confirm a transaction or create a payment. Catalogs are loaded again for current availability.
- Confirm / Cancel remain explicit buttons at every summary. Check payment is a status action, not a fabricated payment URL. The existing pending-payment placeholders and real payment-completion checks are preserved.
- New location requests use `interactive.type=location_request_message` and the `send_location` action. Home, Work and recent location choices require an explicit tap in interactive delivery flows. Users can share a new location or type cab pickup/destination addresses. Typed ordering retains existing canonical-location reuse.
- Menu state is stored on the existing scoped customer as `whatsappMenu`, outside conversation order/payment context. Reset and cancellation therefore keep their original context-clearing behavior. Presentation state contains no payment credentials or Firebase UID.

## Per-vertical paths

| Vertical | Click-first path |
| --- | --- |
| Eats | Start Order → configured category (when multiple) → available item → quantity → saved/new location → Confirm / Cancel → payment status |
| Salon | Book Appointment → service → Today / Tomorrow / Choose Date → valid time → permitted stylist → Confirm / Cancel |
| Motos | Browse Cars → configured transmission filter or typed model/budget → matching car → More Details / Test Drive / Call Dealer → date → time → Confirm / Cancel |
| Cabs | Book Ride → Home / Work / current location / typed pickup → destination → configured vehicle → base-fare estimate → Confirm / Cancel |
| Retail | Shop Products → configured category → product → variant → quantity → optional saved delivery address → Confirm / Cancel |
| Ecom | Shop / Get Quote → category → quantity → per-item budget → quotation estimate → Confirm / Cancel |
| Garage | Book Service → saved vehicle or typed make/model → configured service → date → time → service estimate → Confirm / Cancel |
| Meds | Find Product → available OTC product/category → quantity → saved/new location → pharmacist-verification summary → Confirm / Cancel |
| Meat | Order Meat → item/category → configured cut → 500g / 1kg / 2kg or typed weight → saved/new location → Confirm / Cancel |
| Expert | Book Consultation → service → date → time → Confirm / Cancel |
| Gaming | Book Session → station → duration → date → time → Confirm / Cancel |
| Sport | Book Activity → activity → its configured venue/class → date → time → Confirm / Cancel |

Categories, venues, stylists, vehicle types and services come from existing configuration. The adapter does not invent missing resources or add a dispatch/availability engine. Custom dates, custom budgets/quantities and new vehicle make/models can still require typing. Stock and configured quantity/budget ceilings filter quick choices and are also enforced by the domain handlers.

Retail's existing flow does not require a delivery address. An explicitly chosen saved address is attached to that owned, editable order without changing totals or introducing a new mandatory checkout requirement. Typed retail flows preserve the existing behavior.

Prescription-only products remain excluded from self-service ordering. The prescription step provides a return-to-products choice and pharmacist-help instructions; it cannot approve prescriptions, diagnose symptoms or prescribe medication. Payment actions do not claim that payment has succeeded.

## Saved customer helpers

`saved-customer-service.ts` reads profile data only when the phone has a linked identity and the scoped customer has the same UID, phone and businessId. It reuses the existing name, saved Home/Work addresses, canonical location, vehicles and recent choices. Address maps and labeled arrays in customer data/metadata are supported. Valid new shared locations labeled Home or Work update that saved slot without deleting the other address or historical data.

`customer-history-service.ts` provides recent request titles/statuses using both businessId and customerPhone predicates, rechecks ownership, sorts recorded timestamps and exposes no internal request IDs, UID or payment data. Main-menu history uses this projection. Profile history loading is optional so normal taps do not scan order and booking history unnecessarily.

`recentSelections` stores only a small whitelist of product/service/vehicle/variant/quantity/duration references. History offers **Use recent choice**, which starts a fresh flow and revalidates the current catalog. It never reuses an old order ID, booking ID or payment ID, auto-confirms a transaction, or modifies a settled transaction. Missing or unavailable recent choices fall back to the normal current menu.

## Verification

`scripts/test-click-first.cjs` covers complete tap-based journeys across all twelve verticals through the linked incoming-message service: main menu, selections, summaries, confirmation, cancellation, reset, history, recent selection and typed fallback. Additional cases cover categories, address isolation, native location requests, forged titles/stale IDs, pagination and medicine safety. Existing typed-flow, paid/completed-order, identity, privacy, send-retry and webhook regressions remain in the full suite.

```text
node scripts/test-all-flows.cjs
npx tsc --noEmit
npm run lint
npm run build
```

Tests use mocked Firestore, Auth and Meta sends; no live messages or production data are changed. This implementation does not deploy the application or change Firebase Auth configuration.
