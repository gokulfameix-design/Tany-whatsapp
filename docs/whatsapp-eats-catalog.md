# Eats WhatsApp catalog ordering

## Setup

In a business workspace, open Settings > WhatsApp product catalog. Firestore menus work without any Meta catalog setup. To enable native catalog messages, first connect a WhatsApp account, then enter its already-linked Meta catalog ID, enable catalog messages, and map each Tany product to its Meta retailer product ID. No catalog or product is created in Meta by this feature.

Account fields: `whatsapp_accounts/{businessId}.catalogId` (optional), `catalogEnabled` (optional, false by default). Mappings: `businesses/{businessId}/whatsapp_product_mappings/{tanyProductId}`, with businessId, tanyProductId, catalogId, retailerProductId and updatedAt. These fields contain identifiers only; no tokens or secrets are stored.

Available products and authoritative prices always come from `businesses/{businessId}/catalog`. Missing/disabled Meta configuration or missing mappings falls back to the existing WhatsApp list/button transport. Native product images, names and displayed prices come from the linked Meta catalog; keep that catalog synchronized with Tany. Checkout always recalculates from Tany, never the webhook's item_price/currency. Changes after the summary require confirmation again.

## Supported UI and messages

Eats Hi/Start uses a native list with Order Now, View Menu, Track Order and Help, because WhatsApp reply buttons support only three options. New menu actions enter the cart journey; legacy typed Eats ordering remains supported. Categories and items use paginated official lists/buttons. Configured mapped products use `interactive.product` or `interactive.product_list` (maximum 30 products, 10 sections). Product cards rely on Meta's supported display; Firestore lists do not pretend to show custom product images.

A product enquiry uses `context.referred_product`; a submitted native cart uses `messages[].type=order` and `order.catalog_id/product_items`. Parsed selections retain only catalog/product IDs and validated quantity. Unknown, ambiguous, unavailable and cross-business products are rejected. Server cart quantities are integers 1-99, with up to 30 distinct products. Native cart submission replaces the current draft basket; item/quantity actions add or edit one item. View Cart supports edit/remove and Checkout. Text commands and `2 chicken biriyani` remain available.

Checkout asks for a linked customer's saved address or WhatsApp location, shows the summary, then Confirm/Cancel. Cart totals remain visible even for large carts; Edit Cart pages through all items. Payment uses the existing pending-payment service. This feature does not create a live gateway payment link or charge a customer. Paid, confirmed and fulfilled orders cannot be edited through cart operations. Confirmation freezes the exact reviewed basket and verifies the latest product availability and prices atomically; delivery updates also respect the payment freeze.

Track Order shows the latest active customer order, falling back to the latest delivered/cancelled order, with received/confirmed/preparing/out_for_delivery/delivered/cancelled labels. All queries use the selected business and verified sender phone.

## Retry and isolation

The existing signed webhook, subscription/sender readiness, identity linking, human handoff, incoming claim and prepared-reply retry protections remain in place. Cart mutations add `cart_events/{hash(businessId,orderId,eventId)}` to atomically suppress repeated additions. Pending payments are idempotent for the exact basket fingerprint. Provider rejection of an unsupported catalog message may fall back to its ordinary list/text; network ambiguity does not automatically replay a send.

Product/cart orchestration lives in the Eats flow and services, never in the webhook route. Firestore's existing deny-all client rules keep all writes server-side. Standalone internal dashboard access remains unchanged.

## Official references

- Meta interactive payloads: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/InteractiveObject/
- Meta action objects: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/ActionObject/
- Meta product enquiry context: https://www.postman.com/meta/whatsapp-business-platform/folder/hysdhqs/context-object

The SDK documentation is archived; this implementation sends the official payloads through the project's existing Graph API transport rather than installing that SDK. A live WABA-linked catalog is required to verify provider rendering and product availability in production. Automated tests mock Meta/Firestore and never send live customer messages.

## Verification

`node scripts/test-eats-catalog.cjs`, `node scripts/test-all-flows.cjs`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
