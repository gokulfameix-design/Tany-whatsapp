# Request: initiate WhatsApp channel review for catalog items stuck at NO_REVIEW

## Account

- Catalog ID: `1125148453496527`
- WABA ID: `1385856453537364`
- Phone Number ID: `1288169907722833`
- Business phone: `+91 80726 56887`

## Requested action

Please investigate and initiate the WhatsApp-specific commerce review for the four products below. If review has already completed internally, please investigate the WhatsApp product index/channel synchronization and reconcile the API review status.

Commerce Manager shows these items as Eligible and In Stock, but the Graph API returns `NO_REVIEW` for the `WHATSAPP` capability, and native single-product sends fail with code `131009`.

## Affected items

| Product | Meta product ID | retailer_id | WHATSAPP review status |
| --- | --- | --- | --- |
| Chicken biriyani | 29441451432210366 | vhv4ckhmrx | NO_REVIEW |
| Mutton biriyani | 28998338739761125 | kk945xsl0r | NO_REVIEW |
| Dosa | 28856656667323234 | jrk1eu28id | NO_REVIEW |
| Idly | 39926069327006776 | 83334sv9y1 | NO_REVIEW |

## Working control

- Product: Veg biriyani
- Meta product ID: `29347713274822005`
- retailer_id: `puda0gyarp`
- WHATSAPP review status: `APPROVED`
- The account owner confirms native WhatsApp product messages work for this item on the same number and catalog.

## Verified API evidence

Verified on 2026-10-25:

- `GET /1385856453537364/product_catalogs` returns catalog `1125148453496527`.
- `GET /1385856453537364/phone_numbers` returns Phone Number ID `1288169907722833`.
- `GET /1288169907722833/whatsapp_commerce_settings` returns `is_cart_enabled=true` and `is_catalog_visible=true`.
- `GET /1125148453496527/products?fields=id,name,retailer_id,capability_to_review_status` returns the exact IDs and WHATSAPP review statuses above.
- Chicken biriyani is `published` and `in stock`.
- No rejection information was returned from the Chicken biriyani `channels_to_integrity_status` edge.

Reported message error:

```text
131009: product not found for product_retailer_id, vhv4ckhmrx, in catalog_id, 1125148453496527
```

Reported trace identifier: `AqUgnSVmIbHhIpKMvH7cdHr`

## Expected result

The four products receive WhatsApp channel review and, if approved, become available for native single-product messages. Please provide the channel-specific reason or required remediation if any item cannot be reviewed or approved.

No access tokens, app secrets, customer data, or Authorization headers are included in this request.

**Submission status:** Prepared only; not submitted. No review or approval has been triggered by preparing this document.
