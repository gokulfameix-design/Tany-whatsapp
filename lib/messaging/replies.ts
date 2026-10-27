import type {
  ButtonReply,
  ListReply,
  MessagingReply,
  TextReply,
  ProductListReply,
  ProductSequenceReply,
} from "@/lib/messaging/types";

export function textReply(body: string): TextReply {
  return { type: "text", body };
}
const validString = (value: string, maximum: number) =>
  typeof value === "string" &&
  !!value.trim() &&
  Array.from(value).length <= maximum;

export function buttonReply({
  body,
  buttons,
}: Omit<ButtonReply, "type">): MessagingReply {
  if (
    !buttons.length ||
    buttons.length > 3 ||
    !validString(body, 1024) ||
    buttons.some(
      (button) =>
        !validString(button.id, 256) || !validString(button.title, 20),
    ) ||
    new Set(buttons.map((button) => button.id)).size !== buttons.length
  )
    return textReply(body);
  return {
    type: "buttons",
    body,
    buttons: buttons.map(({ id, title }) => ({ id, title })),
  };
}

export function listReply({
  body,
  buttonText,
  sections,
}: Omit<ListReply, "type">): MessagingReply {
  const rows = sections.flatMap((section) => section.rows);
  if (
    !rows.length ||
    rows.length > 10 ||
    !validString(buttonText, 20) ||
    !validString(body, 1024) ||
    sections.some(
      (section) =>
        !section.rows.length ||
        (section.title !== undefined && !validString(section.title, 24)),
    ) ||
    rows.some(
      (row) =>
        !validString(row.id, 200) ||
        !validString(row.title, 24) ||
        (row.description !== undefined &&
          Array.from(row.description).length > 72),
    ) ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  )
    return textReply(body);
  return {
    type: "list",
    body,
    buttonText,
    sections: sections.map((section) => ({
      ...(section.title === undefined ? {} : { title: section.title }),
      rows: section.rows.map(({ id, title, description }) => ({
        id,
        title,
        ...(description === undefined ? {} : { description }),
      })),
    })),
  };
}

export function productRetailerIds(section: { productItems?: { productRetailerId: string }[]; productIds?: string[] }) {
  return section.productItems?.map(item => item.productRetailerId) ?? section.productIds ?? [];
}

export function productListSequence(reply: ProductListReply): ProductSequenceReply {
  return { type: "product_sequence", body: reply.body, fallback: reply.fallback,
    products: reply.sections.flatMap(productRetailerIds).map(retailerProductId => ({ type: "product", body: reply.body, catalogId: reply.catalogId, retailerProductId, fallback: reply.fallback, allowFallback: false })),
    finalReply: { type: "buttons", body: reply.body, buttons: [
      { id: "eats_shop_cart", title: "View Cart" }, { id: "eats_shop_continue", title: "More Items" }, { id: "eats_shop_checkout", title: "Checkout" },
    ] },
  };
}

export function normalizeReply(reply: MessagingReply | string): MessagingReply {
  if (typeof reply === "string") return textReply(reply);
  if (reply.type === "product_sequence") {
    if (!validString(reply.body, 1024) || buttonReply(reply.finalReply).type !== "buttons") return normalizeReply(reply.fallback);
    return reply;
  }
  if (reply.type === "product" || reply.type === "product_list") {
    const validId = (v: string) => validString(v, 100) && !/[\r\n]/.test(v);
    const ids =
      reply.type === "product"
        ? [reply.retailerProductId]
        : reply.sections.flatMap(productRetailerIds);
    const valid =
      /^[1-9]\d{0,39}$/.test(reply.catalogId) &&
      validString(reply.body, 1024) &&
      ids.length > 0 &&
      ids.length <= 30 &&
      ids.every(validId) &&
      new Set(ids).size === ids.length &&
      (reply.type === "product" ||
        (validString(reply.header, 60) &&
          (reply.footer === undefined || validString(reply.footer, 60)) &&
          reply.sections.length > 0 &&
          reply.sections.length <= 10 &&
          reply.sections.every(
            (s) => validString(s.title, 24) && productRetailerIds(s).length > 0,
          )));
    if (!valid) return normalizeReply(reply.fallback);
    return reply.type === "product_list" && process.env.WHATSAPP_PRODUCT_LIST_ENABLED !== "true" ? productListSequence(reply) : reply;
  }
  if (reply.type === "location_request")
    return validString(reply.body, 1024)
      ? { type: "location_request", body: reply.body }
      : textReply(reply.body);
  if (reply.type === "buttons") return buttonReply(reply);
  if (reply.type === "list") return listReply(reply);
  if (reply.type === "cta_url") {
    try {
      const url = new URL(reply.url);
      const title =
        reply.title === "Login / Create Account"
          ? "Login/Create Account"
          : reply.title;
      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        validString(title, 20) &&
        validString(reply.body, 1024)
      )
        return { type: "cta_url", body: reply.body, title, url: url.href };
    } catch {
      /* Invalid URLs fall back to text. */
    }
    return textReply(reply.body);
  }
  return textReply(reply.body);
}

/** Text-only transports keep visible choice labels, never internal selection IDs. */
export function replyTextFallback(value: MessagingReply | string): TextReply {
  const reply = normalizeReply(value);
  if (reply.type === "text") return reply;
  if (reply.type === "product" || reply.type === "product_list" || reply.type === "product_sequence")
    return replyTextFallback(reply.fallback);
  if (reply.type === "location_request")
    return textReply(
      `${reply.body}\nUse WhatsApp's attachment menu to share a location.`,
    );
  if (reply.type === "cta_url")
    return textReply(`${reply.body}\n\n${reply.title}: ${reply.url}`);
  const titles =
    reply.type === "buttons"
      ? reply.buttons.map((button) => button.title)
      : reply.sections.flatMap((section) =>
          section.rows.map((row) => row.title),
        );
  return textReply(`${reply.body}\n\n${titles.join("\n")}`);
}
