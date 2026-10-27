# Business-scoped catalog configuration

All twelve runtime flows use Firestore business data. No runtime module imports
the demo fixtures, and no missing catalog silently falls back to a demo catalog.
Unconfigured businesses receive:

> This business has not configured its catalog yet.

## Firestore schema

```text
businesses/{businessId}
  name: string
  vertical: one of the 12 Tany verticals
  active: boolean
  whatsappPhoneNumberId: string
  settings: JSON object

businesses/{businessId}/catalog/{itemId}
  type: "product" | "service" | "vehicle" | "category"
  name: string
  description: string
  price: number (decimal INR)
  available: boolean
  category: string | null
  metadata: JSON object
  createdAt: Firestore timestamp
  updatedAt: Firestore timestamp
```

The document ID is authoritative: a stored `id` field cannot redirect a read to
another document/business. All catalog reads use this subcollection path, never
a collection-group/global item lookup. IDs containing slashes are rejected.
`getCatalog` supports available/type/category/maxPrice filters; `findCatalogItems`
matches names, descriptions, categories and string metadata/aliases within one
business. `getCatalogItem` can return unavailable items for administrative use;
flows use `getAvailableCatalogItems`, which hides unavailable and zero-stock items.
Malformed catalog documents are excluded, including invalid prices/JSON metadata.
Paid flows require positive configured prices; category prices may be zero.

## Per-vertical metadata

| Vertical | Type | Metadata |
| --- | --- | --- |
| Eats | product | aliases: string[], veg, preparationTime |
| Salon | service | aliases, durationMinutes: positive integer, staffIds: string[] |
| Motos | vehicle | brand, model, year: number, transmission, bodyType, variant |
| Retail | product | aliases, variants: string[] (size/color labels), stock: number |
| Ecom | category | aliases; category price used when quote priceMode is catalog |
| Garage | service | aliases, durationMinutes |
| Meds | product | aliases, otc: true, requiresPrescription: false |
| Meat | product | aliases, variants: string[] (cuts); price per kg |
| Expert | service | aliases, durationMinutes, resourceType, resourceId, resourceName |
| Gaming | service | aliases, durationMinutes (one billing unit), resourceType/id/name |
| Sport | service | aliases, durationMinutes, resourceType/id/name |
| Cabs | vehicle | optional alternative to settings.vehicleTypes |

Aliases and display names come from catalog records, not fixed item dictionaries.
`metadata.sortOrder` optionally controls presentation order. Interactive menus show
up to ten rows; typed searches still consider all loaded items. Keep item IDs short
enough to fit WhatsApp interactive selection limits after the vertical prefix.

Examples of `settings`:

```json
{
  "staff": { "staff-1": "Stylist name" },
  "vehicleTypes": [
    { "id": "electric", "name": "Electric Cab", "baseFare": 180, "available": true }
  ],
  "quoteSettings": {
    "priceMode": "budget",
    "estimateMultiplier": 0.9,
    "maxQuantity": 500,
    "maxBudgetPerItem": 1000
  }
}
```

Only fields relevant to the business's vertical are used. Salon resolves staff
names from `settings.staff` and limits named stylists with each service's staffIds;
Any Stylist is a generic default. Cabs prefers configured vehicleTypes/base fares,
or uses available vehicle catalog entries. Ecom defaults to budget-based estimates;
`priceMode: "catalog"` uses the category price. Estimate multipliers must be >0
and <=1. Quotes remain subject to business approval and create only internal
pending-payment records. Meds never approves a prescription, diagnoses, or offers
dosage advice; non-OTC/prescription-required items cannot enter the order flow.

Existing slot policies are still placeholders in Asia/Kolkata. This change supplies
actual service duration, price and resource metadata; it does not add a staff
calendar, stock reservation/decrement, dispatch, Meta integration or Razorpay.
Prices are snapshotted into draft summaries; no silent repricing is performed at
confirmation. Availability and Retail stock are rechecked before confirmation.
RESET obtains a new quote. Existing completed/payment records remain readable
when catalog entries are removed, so settlement/cancellation controls still work.

## Demo seed and tests

The old catalogs are now in `scripts/fixtures/business-data.json`. Regression tests
load these records into their mock Firestore, exercising the same catalog services
as production. Tests can disable fixture loading to verify missing-catalog handling.

The seed command loads `.env.local` without changing it and executes the existing
`lib/firebase-admin.ts` setup. It seeds only demo-eats, demo-salon and demo-motos.
It creates missing catalog documents, never overwrites existing catalog prices,
preserves existing name/vertical/active/phone ID, and fills absent settings. A
vertical mismatch aborts instead of inserting the wrong vertical's catalog.
New demo phone IDs are distinct placeholders and must be configured separately
to receive actual webhook traffic. The script does not contact Meta/Razorpay.

```powershell
node scripts/seed-demo-businesses.cjs --dry-run
node scripts/seed-demo-businesses.cjs
node scripts/test-all-flows.cjs
npx tsc --noEmit
npm run lint
npm run build
```

Seeding is opt-in and writes to the configured Firestore project. Automated tests
cover seeding with mocks only. They verify isolation, availability filtering, all
12 dynamic flow adapters, prices/durations/resources, absent catalogs, and all
earlier flow/webhook/idempotency regressions without live external calls.
