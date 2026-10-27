import { Timestamp } from "firebase-admin/firestore";
import type { IncomingMessageInput } from "@/lib/messaging/types";

export type IncomingWhatsAppMessage = {
  from: string;
  id: string;
  type: string;
  timestamp?: string;
  text?: { body?: string };
  context?: {
    referred_product?: { catalog_id: string; product_retailer_id: string };
  };
  order?: {
    catalog_id: string;
    product_items: {
      product_retailer_id: string;
      quantity: number | string;
      item_price?: unknown;
      currency?: string;
    }[];
  };
  interactive?: {
    type?: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
    name?: string;
  };
};

export function normalizeIncomingMessage(
  message: IncomingWhatsAppMessage,
): IncomingMessageInput {
  if (message.type === "order") {
    const order = message.order;
    if (
      !order ||
      typeof order.catalog_id !== "string" ||
      !Array.isArray(order.product_items) ||
      !order.product_items.length ||
      order.product_items.length > 30
    )
      throw new Error("Invalid catalog order");
    const items = order.product_items.map((item) => {
      const quantity = Number(item.quantity);
      if (
        typeof item.product_retailer_id !== "string" ||
        !item.product_retailer_id.trim() ||
        item.product_retailer_id.length > 100 ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      )
        throw new Error("Invalid catalog item");
      return { retailerProductId: item.product_retailer_id, quantity };
    });
    if (new Set(items.map((i) => i.retailerProductId)).size !== items.length)
      throw new Error("Duplicate catalog item");
    return {
      type: "order",
      text: "Catalog cart received",
      order: { catalogId: order.catalog_id, items },
    };
  }
  if (message.type === "text" && message.context?.referred_product) {
    const product = message.context.referred_product;
    if (
      typeof product.catalog_id !== "string" ||
      typeof product.product_retailer_id !== "string" ||
      product.product_retailer_id.length > 100 ||
      !product.product_retailer_id.trim()
    )
      throw new Error("Invalid product enquiry");
    return {
      type: "product",
      text: message.text?.body ?? "",
      product: {
        catalogId: product.catalog_id,
        retailerProductId: product.product_retailer_id,
      },
    };
  }
  if (message.type === "text")
    return {
      type: "text",
      text: typeof message.text?.body === "string" ? message.text.body : "",
    };
  if (message.type === "interactive") {
    const selected =
      message.interactive?.type === "button_reply"
        ? message.interactive.button_reply
        : message.interactive?.type === "list_reply"
          ? message.interactive.list_reply
          : undefined;
    if (
      selected &&
      typeof selected.id === "string" &&
      selected.id.trim() &&
      typeof selected.title === "string"
    ) {
      return {
        type: message.interactive?.type === "button_reply" ? "button" : "list",
        text: selected.title,
        selectionId: selected.id,
        selectionTitle: selected.title,
      };
    }
    return { type: "unsupported", text: "" };
  }
  if (message.type === "location" && message.location) {
    const { latitude, longitude, name, address } = message.location;
    if (
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180
    )
      throw new Error("Invalid WhatsApp location");
    return {
      type: "location",
      text: "",
      location: {
        latitude,
        longitude,
        label: typeof name === "string" ? name : null,
        address: typeof address === "string" ? address : null,
        source: "whatsapp",
        updatedAt: Timestamp.now(),
      },
    };
  }
  return { type: "unsupported", text: "" };
}
