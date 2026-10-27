import { debugCall } from "@/lib/messaging/orchestration-debug";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";
import { getAvailableCatalogItems } from "@/lib/messaging/services/catalog-service";
import {
  catalogMenuReply,
  resolveCatalogProduct,
} from "@/lib/whatsapp/catalog";
import {
  changeCart,
  confirmCartOrder,
  setCartDelivery,
} from "@/lib/messaging/services/cart-service";
import {
  createDraftOrder,
  getOrder,
} from "@/lib/messaging/services/order-service";
import { resetConversation } from "@/lib/messaging/services/conversation-service";
import { loadSavedCustomer } from "@/lib/messaging/services/saved-customer-service";
import { saveCustomerLocation } from "@/lib/messaging/services/location-service";
import { buttonReply, listReply, textReply } from "@/lib/messaging/replies";
import { handleEatsMessage } from "@/lib/messaging/flows/eats";
import type {
  Business,
  IncomingMessageInput,
  FlowContext,
  FlowResult,
  MessagingReply,
  ListReply,
} from "@/lib/messaging/types";
import type { ConversationContext, Order } from "@/lib/messaging/domain-types";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);
const short = (value: string, n = 24) => Array.from(value).slice(0, n).join("");
const id = (value: string) => `eats_shop_${value}`;
export function eatsOrderingMenu(
  body = "Welcome! Choose an option, or type your order.",
) {
  return listReply({
    body,
    buttonText: "Choose option",
    sections: [
      {
        rows: [
          { id: id("order"), title: "Order Now" },
          { id: id("menu"), title: "View Menu" },
          { id: id("track"), title: "Track Order" },
          { id: "eats_help", title: "Help" },
        ],
      },
    ],
  });
}
const buttons = (body: string, options: [string, string][]) =>
  buttonReply({
    body: short(body, 1024),
    buttons: options.map(([key, title]) => ({ id: id(key), title })),
  });
const cartSummary = (order: Order) => {
  let lines = "";
  let displayed = 0;
  for (const item of order.items) {
    const line = `${item.quantity} x ${short(item.name, 40)} - INR ${item.totalPrice.toFixed(2)}\n`;
    if (lines.length + line.length > 650) break;
    lines += line;
    displayed++;
  }
  return `Your cart:\n${lines}${displayed < order.items.length ? `... ${order.items.length - displayed} more items. Use Edit Cart to review.\n` : ""}Total: INR ${order.total.toFixed(2)}`;
};
export async function handleEatsCommerce(
  business: Business,
  incoming: IncomingMessageInput,
  flow: FlowContext,
): Promise<FlowResult | null> {
  const original = incoming.text;
  const command = incoming.selectionId?.startsWith("eats_shop_")
    ? incoming.selectionId.slice(10)
    : original.trim().toLowerCase().replace(/\s+/g, " ");
  const active = flow.conversation?.context?.eatsCommerce === true;
  const entry =
    [
      "order",
      "order now",
      "view menu",
      "menu",
      "track",
      "track order",
      "view cart",
      "cart",
      "checkout",
    ].includes(command) ||
    incoming.type === "order" ||
    incoming.type === "product" ||
    incoming.selectionId?.startsWith("eats_shop_");
  if (!active && !entry) return null;
  const phone = flow.customerPhone ?? flow.conversation?.customerPhone;
  if (
    !phone ||
    (flow.conversation &&
      (flow.conversation.businessId !== business.id ||
        flow.conversation.customerPhone !== phone))
  )
    throw new Error("Commerce session unavailable");
  let context: ConversationContext = { ...flow.conversation?.context };
  const state = flow.conversation?.state ?? "eats_start";
  const eventId = incoming.messageId ?? randomUUID();
  const result = (
    reply: MessagingReply,
    nextState = state,
    status: FlowResult["status"] = "waiting_customer",
  ): FlowResult => ({
    reply,
    state: nextState,
    status,
    context,
    vertical: "eats",
    originalText: original,
  });
  const cart = async (): Promise<Order | null> => {
    if (typeof context.orderId !== "string") return null;
    const order = await getOrder(context.orderId);
    if (
      !order ||
      order.businessId !== business.id ||
      order.customerPhone !== phone ||
      order.vertical !== "eats"
    )
      throw new Error("Cart does not belong to this conversation");
    return order;
  };
  if (["track", "track order"].includes(command)) {
    const docs = await adminDb
      .collection("orders")
      .where("businessId", "==", business.id)
      .where("customerPhone", "==", phone)
      .get();
    const sorted = docs.docs
      .map((d) => ({ ...d.data(), id: d.id }) as Order)
      .filter((o) => o.vertical === "eats")
      .sort((a, b) => {
        const time = (v: unknown) =>
          v && typeof v === "object" && "toMillis" in v
            ? (v as { toMillis(): number }).toMillis()
            : 0;
        return time(b.createdAt) - time(a.createdAt);
      });
    const order =
      sorted.find((o) => !["cancelled", "delivered"].includes(o.status)) ??
      sorted[0];
    const labels: Record<string, string> = {
      draft: "received",
      pending_confirmation: "received",
      awaiting_payment: "received",
      paid: "confirmed",
      confirmed: "confirmed",
      preparing: "preparing",
      ready: "preparing",
      out_for_delivery: "out_for_delivery",
      delivered: "delivered",
      cancelled: "cancelled",
    };
    return result(
      buttons(
        order
          ? `Order ${order.id}
Status: ${labels[order.status] ?? "received"}
Total: INR ${order.total.toFixed(2)}`
          : "No orders found for this WhatsApp number.",
        [
          ["order", "Order Now"],
          ["menu", "View Menu"],
          ["cart", "View Cart"],
        ],
      ),
      state,
      flow.conversation?.status ?? "active",
    );
  }
  if (
    /^(cancel|reset|start|new order|start new order|start a new order|hi|hello)$/i.test(
      command,
    )
  ) {
    const restarted = await handleEatsMessage(command.toUpperCase(), {
      ...flow,
      business,
    });
    return restarted.status === "cancelled"
      ? {
          ...restarted,
          reply: buttons(restarted.reply.body, [
            ["order", "Start again"],
            ["track", "Track Order"],
          ]),
        }
      : restarted;
  }
  if (active && ["eats_awaiting_payment", "eats_completed"].includes(state))
    return handleEatsMessage(original, { ...flow, business });
  const all = (
    await debugCall(
      "getAvailableCatalogItems",
      () => getAvailableCatalogItems(business.id),
      flow.debugTrace,
      "catalog",
    )
  ).filter((p) => p.type === "product" && p.price > 0);
  const getDraft = async () => {
    const existing = await cart();
    if (existing) return existing;
    const order = await createDraftOrder({
      businessId: business.id,
      customerPhone: phone,
      vertical: "eats",
      reuseConversationDraft: true,
    });
    context.orderId = order.id;
    return order;
  };
  const showCart = async (prefix = "") => {
    const order = await cart();
    if (!order?.items.length)
      return result(
        buttons(`${prefix}Your cart is empty.`, [
          ["menu", "View Menu"],
          ["order", "Order Now"],
        ]),
        "eats_cart_review",
      );
    return result(
      buttons(
        `${prefix}${cartSummary(order)}`,
        prefix
          ? [
              ["continue", "Continue shopping"],
              ["cart", "View Cart"],
              ["checkout", "Checkout"],
            ]
          : [
              ["checkout", "Checkout"],
              ["continue", "Continue shopping"],
              ["edit", "Edit Cart"],
            ],
      ),
      "eats_cart_review",
    );
  };
  const menu = async (categories = false, page = 0) => {
    context.eatsCommerce = true;
    context.shopPage = page;
    if (!all.length)
      return result(
        textReply(
          "The menu is currently unavailable. Please contact the team.",
        ),
        "eats_cart_menu",
      );
    const groups = [...new Set(all.map((p) => p.category || "Menu"))];
    if (categories && groups.length > 1) {
      const subset = groups.slice(page * 8, page * 8 + 8);
      const rows = subset.map((c) => ({
        id: id(`category_${hash(c)}`),
        title: short(c),
      }));
      if (page > 0)
        rows.push({
          id: id("categories_previous"),
          title: "Previous categories",
        });
      if ((page + 1) * 8 < groups.length)
        rows.push({ id: id("categories_next"), title: "More categories" });
      context.shopCategories = true;
      return result(
        listReply({
          body: "Choose a category. You can also type an item name.",
          buttonText: "Categories",
          sections: [{ rows }],
        }),
        "eats_cart_menu",
      );
    }
    context.shopCategories = false;
    const items = all.filter(
      (p) =>
        !context.shopCategory ||
        (p.category || "Menu") === context.shopCategory,
    );
    const subset = items.slice(page * 8, page * 8 + 8);
    const rows = subset.map((p) => ({
      id: id(`item_${hash(p.id)}`),
      title: short(p.name),
      description: short(
        `INR ${p.price.toFixed(2)}${p.description ? ` - ${p.description}` : ""}`,
        72,
      ),
    }));
    if (page > 0)
      rows.push({
        id: id("previous"),
        title: "Previous items",
        description: "",
      });
    if ((page + 1) * 8 < items.length)
      rows.push({ id: id("next"), title: "More items", description: "" });
    if (!rows.length)
      return result(
        textReply("That category has no available items. Type View Menu."),
        "eats_cart_menu",
      );
    const fallback = listReply({
      body: "Choose an item to add. Type View Cart or Checkout at any time.",
      buttonText: "View menu",
      sections: [{ rows }],
    }) as ListReply;
    const reply = await debugCall(
      "catalogMenuReply",
      () => catalogMenuReply(business.id, subset, fallback),
      flow.debugTrace,
      "catalog",
    );
    return result(reply, "eats_cart_menu");
  };
  const addressPrompt = async () => {
    const saved = await loadSavedCustomer(business.id, phone, {
      includeHistory: false,
    });
    const addresses = saved.addresses.slice(0, 2);
    if (!addresses.length)
      return result(
        {
          type: "location_request",
          body: "Share your delivery location to continue.",
        },
        "eats_cart_location",
      );
    return result(
      buttons("Choose a saved delivery address or share a new location.", [
        ...addresses.map(
          (a) =>
            [`address_${hash(a.id)}`, short(a.label, 20)] as [string, string],
        ),
        ["location", "Share new location"],
      ]),
      "eats_cart_location",
    );
  };
  const confirmation = (order: Order) =>
    result(
      buttons(
        `${cartSummary(order)}
Delivery: ${short(order.location?.address || order.location?.label || "Shared location", 100)}
Confirm your order?`,
        [
          ["confirm", "Confirm"],
          ["cancel", "Cancel"],
        ],
      ),
      "eats_cart_confirmation",
    );
  try {
    if (["order", "order now"].includes(command)) {
      const existing = await cart();
      if (
        existing &&
        !["draft", "pending_confirmation"].includes(existing.status)
      ) {
        await resetConversation({
          businessId: business.id,
          customerPhone: phone,
        });
        context = {};
      }
      context.eatsCommerce = true;
      context.shopCategory = null;
      return menu(true);
    }
    if (
      ["menu", "view menu", "continue", "continue shopping"].includes(command)
    ) {
      context.eatsCommerce = true;
      context.shopCategory = null;
      return menu(true);
    }
    if (command === "categories_next" || command === "categories_previous")
      return menu(
        true,
        Math.max(
          0,
          Number(context.shopPage ?? 0) + (command.endsWith("next") ? 1 : -1),
        ),
      );
    if (command.startsWith("category_")) {
      const category = [...new Set(all.map((p) => p.category || "Menu"))].find(
        (c) => `category_${hash(c)}` === command,
      );
      if (!category)
        return result(
          textReply("That category is unavailable. Type View Menu."),
        );
      context.shopCategory = category;
      return menu();
    }
    if (["next", "more", "previous"].includes(command))
      return menu(
        false,
        Math.max(
          0,
          Number(context.shopPage ?? 0) + (command === "previous" ? -1 : 1),
        ),
      );
    if (incoming.order) {
      const selections = [];
      for (const selected of incoming.order.items) {
        const product = await debugCall(
          "resolveCatalogProduct.order",
          () =>
            resolveCatalogProduct(
              business.id,
              incoming.order!.catalogId,
              selected.retailerProductId,
            ),
          flow.debugTrace,
          "catalog",
        );
        if (!product)
          return result(
            textReply(
              "A selected product is not available in this business menu. Type View Menu.",
            ),
          );
        selections.push({ productId: product.id, quantity: selected.quantity });
      }
      context.eatsCommerce = true;
      const order = await getDraft();
      await changeCart({
        businessId: business.id,
        customerPhone: phone,
        orderId: order.id,
        eventId,
        selections,
        mode: "replace",
      });
      return showCart("Catalog cart received. Current menu prices apply.\n");
    }
    if (["cart", "view cart"].includes(command)) return showCart();
    if (
      command === "edit" ||
      command === "edit cart" ||
      command === "edit_next" ||
      command === "edit_previous"
    ) {
      const order = await cart();
      if (!order?.items.length) return showCart();
      const page =
        command === "edit_next"
          ? Number(context.cartEditPage ?? 0) + 1
          : command === "edit_previous"
            ? Math.max(0, Number(context.cartEditPage ?? 0) - 1)
            : 0;
      context.cartEditPage = page;
      const rows = order.items.slice(page * 8, page * 8 + 8).map((i) => ({
        id: id(`edit_${hash(i.id)}`),
        title: short(i.name),
        description: `Quantity: ${i.quantity}`,
      }));
      if (page > 0)
        rows.push({
          id: id("edit_previous"),
          title: "Previous items",
          description: "",
        });
      if ((page + 1) * 8 < order.items.length)
        rows.push({
          id: id("edit_next"),
          title: "More items",
          description: "",
        });
      return result(
        listReply({
          body: "Choose an item to change its quantity or remove it.",
          buttonText: "Edit cart",
          sections: [{ rows }],
        }),
        "eats_cart_review",
      );
    }
    if (command === "checkout") {
      const order = await cart();
      if (!order?.items.length) return showCart();
      await changeCart({
        businessId: business.id,
        customerPhone: phone,
        orderId: order.id,
        eventId,
        mode: "reprice",
      });
      context.eatsCommerce = true;
      return addressPrompt();
    }
    if (state === "eats_cart_location") {
      if (command === "location")
        return result(
          { type: "location_request", body: "Share your delivery location." },
          state,
        );
      let location = incoming.location;
      if (command.startsWith("address_") || !incoming.selectionId) {
        const saved = await loadSavedCustomer(business.id, phone, {
          includeHistory: false,
        });
        location =
          saved.addresses.find(
            (a) =>
              `address_${hash(a.id)}` === command ||
              (!incoming.selectionId && a.label.toLowerCase() === command),
          )?.location ?? location;
      }
      if (!location) return addressPrompt();
      const order = await cart();
      if (!order?.items.length) return showCart();
      const stored = await saveCustomerLocation({
        businessId: business.id,
        customerPhone: phone,
        location,
      });
      const updated = await setCartDelivery(
        business.id,
        phone,
        order.id,
        stored,
      );
      return confirmation(updated);
    }
    if (state === "eats_cart_confirmation") {
      const order = await cart();
      if (!order) return showCart();
      if (command !== "confirm") return confirmation(order);
      const priced = await changeCart({
        businessId: business.id,
        customerPhone: phone,
        orderId: order.id,
        eventId,
        mode: "reprice",
      });
      if (priced.total !== order.total)
        return result(
          buttons(
            `Menu prices changed. Review and confirm again.
${cartSummary(priced)}`,
            [
              ["confirm", "Confirm"],
              ["cancel", "Cancel"],
            ],
          ),
          state,
        );
      context.itemName = priced.items[0].id;
      context.quantity = priced.items[0].quantity;
      context.total = priced.total;
      await confirmCartOrder(priced);
      return result(
        textReply(
          "Your order is confirmed. Payment link will be sent shortly.",
        ),
        "eats_awaiting_payment",
        "waiting_payment",
      );
    }
    if (command === "remove") {
      const order = await cart();
      if (order && typeof context.cartProductId === "string")
        await changeCart({
          businessId: business.id,
          customerPhone: phone,
          orderId: order.id,
          eventId,
          removeId: context.cartProductId,
          mode: "remove",
        });
      return showCart();
    }
    const typedItem = !incoming.selectionId
      ? original.trim().match(/^(\d+)\s+(.+)$/)
      : null;
    if (typedItem) {
      const product = all.find(
        (p) =>
          p.id.toLowerCase() === typedItem[2].toLowerCase() ||
          p.name.toLowerCase() === typedItem[2].toLowerCase() ||
          (Array.isArray(p.metadata.aliases) &&
            p.metadata.aliases.some(
              (a) =>
                typeof a === "string" &&
                a.toLowerCase() === typedItem[2].toLowerCase(),
            )),
      );
      if (product) {
        const order = await getDraft();
        await changeCart({
          businessId: business.id,
          customerPhone: phone,
          orderId: order.id,
          eventId,
          mode: "add",
          selections: [
            { productId: product.id, quantity: Number(typedItem[1]) },
          ],
        });
        return showCart("Added to cart.\n");
      }
    }
    let selected = all.find(
      (p) =>
        command === `item_${hash(p.id)}` ||
        command === `edit_${hash(p.id)}` ||
        (!incoming.selectionId &&
          (p.id.toLowerCase() === command || p.name.toLowerCase() === command)),
    );
    if (command.startsWith("edit_")) {
      const order = await cart();
      const item = order?.items.find((i) => command === `edit_${hash(i.id)}`);
      if (item)
        selected = {
          ...item,
          price: item.unitPrice,
          available: true,
          type: "product",
          description: "",
          category: null,
          createdAt: null,
          updatedAt: null,
        };
    }
    if (incoming.product)
      selected =
        (await debugCall(
          "resolveCatalogProduct.enquiry",
          () =>
            resolveCatalogProduct(
              business.id,
              incoming.product!.catalogId,
              incoming.product!.retailerProductId,
            ),
          flow.debugTrace,
          "catalog",
        )) ?? undefined;
    if (incoming.product && !selected)
      return result(
        textReply(
          "That product is unavailable in this business menu. Type View Menu.",
        ),
      );
    if (selected) {
      context.eatsCommerce = true;
      context.cartProductId = selected.id;
      context.cartEdit = command.startsWith("edit_");
      return result(
        buttons(
          `How many ${selected.name}? INR ${selected.price.toFixed(2)} each. Type any quantity from 1 to 99.`,
          [
            ["quantity_1", "1"],
            ["quantity_2", "2"],
            [
              context.cartEdit ? "remove" : "quantity_3",
              context.cartEdit ? "Remove" : "3",
            ],
          ],
        ),
        "eats_cart_quantity",
      );
    }
    if (state === "eats_cart_quantity") {
      const quantity = Number(command.replace(/^quantity_/, ""));
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99)
        return result(
          textReply("Enter a whole quantity from 1 to 99, or type View Menu."),
          state,
        );
      if (typeof context.cartProductId !== "string") return menu();
      const order = await getDraft();
      await changeCart({
        businessId: business.id,
        customerPhone: phone,
        orderId: order.id,
        eventId,
        mode: context.cartEdit ? "set" : "add",
        selections: [{ productId: context.cartProductId, quantity }],
      });
      context.cartProductId = null;
      context.cartEdit = false;
      return showCart("Added to cart.\n");
    }
    return menu();
  } catch {
    return result(
      buttons(
        "The cart could not be changed. An item may be unavailable or the order may already be confirmed. Review your cart or start a new order.",
        [
          ["cart", "View Cart"],
          ["menu", "View Menu"],
          ["track", "Track Order"],
        ],
      ),
    );
  }
}
