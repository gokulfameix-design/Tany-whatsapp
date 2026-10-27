import "server-only";
import { createHash } from "node:crypto";
import { buttonReply, listReply, textReply } from "@/lib/messaging/replies";
import { loadBusinessData } from "@/lib/messaging/flows/business-data";
import { loadSavedCustomer } from "@/lib/messaging/services/saved-customer-service";
import { saveCustomerLocation } from "@/lib/messaging/services/location-service";
import { getOrder, updateOrder } from "@/lib/messaging/services/order-service";
import {
  mockSlots,
  slotAvailable,
} from "@/lib/messaging/flows/batch-scheduling";
import { missingCatalogReply } from "@/lib/messaging/flows/business-data";
import type {
  ConversationContext,
  JsonValue,
} from "@/lib/messaging/domain-types";
import type {
  Business,
  FlowContext,
  FlowResult,
  IncomingMessageInput,
  MessagingReply,
} from "@/lib/messaging/types";

type Choice = {
  id: string;
  title: string;
  text?: string;
  nativeId?: string;
  action?: string;
  value?: string;
  description?: string;
};
type Menu = { state: string; body: string; choices: Choice[]; page: number };
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const short = (text: string, n: number) =>
  Array.from(text).slice(0, n).join("");
const inputText = (text: string): IncomingMessageInput => ({
  type: "text",
  text,
});
export function choiceReply(
  body: string,
  choices: Choice[],
  page = 0,
): MessagingReply {
  body = short(body, 1024);
  if (!choices.length) return textReply(body);
  if (choices.length <= 3)
    return buttonReply({
      body,
      buttons: choices.map((c) => ({ id: c.id, title: short(c.title, 20) })),
    });
  const pages = Math.ceil(choices.length / 8),
    selected = Math.min(Math.max(0, page), pages - 1);
  const rows = choices.slice(selected * 8, selected * 8 + 8).map((c) => ({
    id: c.id,
    title: short(c.title, 24),
    ...(c.description ? { description: short(c.description, 72) } : {}),
  }));
  if (selected > 0)
    rows.push({
      id: `${choices[0].id.split("_ux_")[0]}_ux_page_previous`,
      title: "Previous options",
    });
  if (selected < pages - 1)
    rows.push({
      id: `${choices[0].id.split("_ux_")[0]}_ux_page_next`,
      title: "More options",
    });
  return listReply({ body, buttonText: "Choose option", sections: [{ rows }] });
}
function menuFrom(context: ConversationContext): Menu | null {
  const menu = object(context._clickMenu);
  if (
    typeof menu.state !== "string" ||
    typeof menu.body !== "string" ||
    !Array.isArray(menu.choices)
  )
    return null;
  const choices = menu.choices.filter((c): c is Choice => {
    const row = object(c);
    return typeof row.id === "string" && typeof row.title === "string";
  });
  return {
    state: menu.state,
    body: menu.body,
    choices,
    page: typeof menu.page === "number" ? menu.page : 0,
  };
}
/** All choices are server-bound to the last rendered state; incoming titles are never commands. */
export async function runClickFirst(
  business: Business,
  incoming: IncomingMessageInput,
  flow: FlowContext,
  run: (input: IncomingMessageInput) => Promise<FlowResult>,
): Promise<FlowResult> {
  const phone = flow.customerPhone;
  if (!phone) return run(incoming);
  const profile = await loadSavedCustomer(business.id, phone);
  const v = business.vertical;
  const previous = flow.conversation;
  const currentContext: ConversationContext = { ...previous?.context };
  const currentState = previous?.state ?? `${v}_start`;
  const savedMenu = menuFrom({ _clickMenu: profile.menu });
  const id = (step: string, key: string) =>
    `${v}_ux_${step}_${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
  const choice = (step: string, title: string, text: string): Choice => ({
    id: id(step, text),
    title,
    text,
  });
  const currentResult = (body: string): FlowResult => ({
    state: currentState,
    status: previous?.status ?? "active",
    context: currentContext,
    vertical: v,
    originalText: incoming.text,
    reply: textReply(body),
  });
  const present = (
    result: FlowResult,
    body: string,
    choices: Choice[],
    page = 0,
  ): FlowResult => ({
    ...result,
    reply: choiceReply(body, choices, page),
    context: {
      ...result.context,
      _clickMenu: JSON.parse(
        JSON.stringify({
          state: result.state,
          body: short(body, 1024),
          choices,
          page,
        }),
      ) as JsonValue,
    },
  });
  const data = await loadBusinessData(flow, v);
  const eligible = data.items.filter((item) => {
    if (["eats", "retail", "meat", "meds"].includes(v))
      return (
        item.type === "product" &&
        item.price > 0 &&
        (v !== "meds" ||
          (item.metadata.otc === true &&
            item.metadata.requiresPrescription !== true))
      );
    if (v === "ecom") return item.type === "category";
    if (v === "motos")
      return (
        item.type === "vehicle" &&
        typeof item.metadata.brand === "string" &&
        typeof item.metadata.model === "string" &&
        typeof item.metadata.year === "number" &&
        typeof item.metadata.transmission === "string"
      );
    return (
      item.type === "service" &&
      (v === "garage" || item.price > 0) &&
      typeof item.metadata.durationMinutes === "number" &&
      Number.isInteger(item.metadata.durationMinutes) &&
      item.metadata.durationMinutes > 0
    );
  });
  const catalogChoice = (item: (typeof eligible)[number]): Choice => {
    const step =
      (
        {
          retail: "product",
          ecom: "category",
          meds: "product",
          meat: "item",
          salon: "service",
          gaming: "station",
          sport: "activity",
        } as Record<string, string>
      )[v] ?? "service";
    return {
      id: id("catalog", item.id),
      title: item.name,
      description: `₹${item.price}${typeof item.metadata.resourceName === "string" ? ` · ${item.metadata.resourceName}` : ""}`,
      text: item.id,
      nativeId: v === "eats" ? undefined : `${v}_${step}_${item.id}`,
    };
  };
  const browse = (result: FlowResult, category?: string): FlowResult => {
    const groups = [
      ...new Set(eligible.map((item) => item.category ?? "Menu")),
    ];
    if (!category && groups.length > 1)
      return present(
        result,
        "Choose a category.",
        groups.map((name) => ({
          id: id("category", name),
          title: name,
          action: "category",
          value: name,
        })),
      );
    const items = eligible.filter(
      (item) => !category || (item.category ?? "Menu") === category,
    );
    const recentId = profile.recent.productId ?? profile.recent.serviceId;
    items.sort(
      (a, b) =>
        Number(b.id === recentId || b.id === profile.recent.itemName) -
        Number(a.id === recentId || a.id === profile.recent.itemName),
    );
    return present(result, result.reply.body, items.map(catalogChoice));
  };
  const addresses = (result: FlowResult, body = result.reply.body) =>
    present(result, body, [
      ...profile.addresses.map((a) => ({
        id: id("address", a.id),
        title: a.label,
        action: "address",
        value: a.id,
      })),
      {
        id: id("location", "new"),
        title: v === "cabs" ? "Use current location" : "Share new location",
        action: "location",
      },
      ...(v === "cabs"
        ? [
            {
              id: id("location", "typed"),
              title: result.state.endsWith("destination")
                ? "Enter destination"
                : "Enter pickup",
              action: "prompt",
              value:
                "Type a place/address, or share a location using WhatsApp.",
            },
          ]
        : []),
    ]);
  let input = incoming;
  let addressSelected = false;
  if (incoming.selectionId?.startsWith(`${v}_ux_`)) {
    if (!savedMenu || savedMenu.state !== currentState)
      return {
        ...currentResult(
          "That choice is no longer available. Type your request or send START.",
        ),
        context: { ...currentContext, _clickMenu: null },
      };
    if (
      incoming.selectionId === `${v}_ux_page_next` ||
      incoming.selectionId === `${v}_ux_page_previous`
    )
      return present(
        currentResult(savedMenu.body),
        savedMenu.body,
        savedMenu.choices,
        savedMenu.page + (incoming.selectionId.endsWith("next") ? 1 : -1),
      );
    const selected = savedMenu.choices.find(
      (c) => c.id === incoming.selectionId,
    );
    if (!selected)
      return present(
        currentResult(
          "That choice is no longer available. Use the current options.",
        ),
        "That choice is no longer available. Use the current options.",
        savedMenu.choices,
        savedMenu.page,
      );
    if (selected.action === "category")
      return browse(currentResult("Choose an item."), selected.value);
    if (selected.action === "venue") {
      const item = eligible.find((item) => item.id === selected.value);
      if (!item)
        return currentResult(
          "That activity is no longer available. Please start again.",
        );
      return present(
        currentResult("Choose your venue/class."),
        "Choose your venue/class.",
        [
          {
            ...catalogChoice(item),
            title:
              typeof item.metadata.resourceName === "string"
                ? item.metadata.resourceName
                : item.name,
          },
        ],
      );
    }
    if (selected.action === "prompt")
      return {
        ...currentResult(selected.value ?? "Please type your response."),
        context: { ...currentContext, _clickMenu: null },
      };
    if (selected.action === "location")
      return {
        ...currentResult("Please share the location you want to use."),
        reply: {
          type: "location_request",
          body: "Please share the location you want to use.",
        },
        context: { ...currentContext, _clickMenu: null },
      };
    if (selected.action === "address") {
      const saved = profile.addresses.find((a) => a.id === selected.value);
      if (!saved)
        return addresses(
          currentResult(
            "That saved address is no longer available. Please choose again.",
          ),
        );
      const location = await saveCustomerLocation({
        businessId: business.id,
        customerPhone: phone,
        location: saved.location,
      });
      addressSelected = true;
      if (flow.conversation)
        flow.conversation = {
          ...flow.conversation,
          context: {
            ...flow.conversation.context,
            location: {
              latitude: location.latitude,
              longitude: location.longitude,
              address: location.address,
              label: location.label,
              source: "stored",
            },
          },
        };
      input = { type: "location", text: "", location };
    } else if (selected.nativeId)
      input = {
        type: "list",
        text: "",
        selectionId: selected.nativeId,
        selectionTitle: selected.title,
      };
    else if (selected.text !== undefined) input = inputText(selected.text);
  } else if (v === "eats" && incoming.selectionId) {
    if (incoming.selectionId === "eats_cancel") input = inputText("CANCEL");
    else if (
      incoming.selectionId === "eats_confirm" &&
      currentState === "eats_awaiting_confirmation"
    )
      input = inputText("CONFIRM");
    else input = { type: "unsupported", text: "" };
  }
  if (
    v === "retail" &&
    input.location &&
    typeof currentContext.orderId === "string" &&
    currentState === "retail_awaiting_confirmation"
  ) {
    const order = await getOrder(currentContext.orderId);
    if (
      order?.businessId !== business.id ||
      order.customerPhone !== phone ||
      order.vertical !== v ||
      !["draft", "pending_confirmation"].includes(order.status)
    )
      throw new Error("Saved address order ownership mismatch");
    await updateOrder({
      orderId: order.id,
      data: { location: input.location },
    });
  }
  let result = await run(input);
  if (flow.useRecent) {
    if (v === "garage" && typeof profile.recent.vehicle === "string") {
      flow.conversation = {
        ...flow.conversation!,
        state: result.state,
        context: result.context,
      };
      result = await run(inputText(profile.recent.vehicle));
    }
    const selected = eligible.find(
      (item) =>
        item.id ===
          (profile.recent.productId ??
            profile.recent.serviceId ??
            profile.recent.selectedVehicleId) ||
        (v === "eats" && item.id === profile.recent.itemName),
    );
    if (selected) {
      if (v === "motos") {
        flow.conversation = {
          ...flow.conversation!,
          state: result.state,
          context: result.context,
        };
        result = await run(
          inputText(
            typeof selected.metadata.model === "string"
              ? selected.metadata.model
              : selected.name,
          ),
        );
      }
      flow.conversation = {
        ...flow.conversation!,
        state: result.state,
        context: result.context,
      };
      const native =
        v === "motos"
          ? `motos_car_${selected.id}`
          : catalogChoice(selected).nativeId;
      result = await run(
        native
          ? {
              type: "list",
              text: "",
              selectionId: native,
              selectionTitle: selected.name,
            }
          : inputText(selected.id),
      );
    }
  }
  // A clicked time should offer an explicit stylist choice; typed bookings keep
  // the domain's existing Any Stylist default and explicitly supplied stylist.
  if (
    v === "salon" &&
    result.state === "salon_awaiting_confirmation" &&
    currentState === "salon_awaiting_time" &&
    incoming.selectionId?.startsWith("salon_ux_") &&
    !currentContext.stylistRequested &&
    !currentContext.stylistId
  ) {
    result = {
      ...result,
      state: "salon_awaiting_stylist",
      context: {
        ...result.context,
        stylistRequested: true,
        stylistId: null,
        stylistName: null,
      },
      reply: textReply("Choose your stylist."),
    };
  }
  let output: FlowResult = {
    ...result,
    context: { ...result.context, _clickMenu: null },
  };
  if (result.reply.body === missingCatalogReply) return output;
  if (result.status === "completed" || result.status === "cancelled")
    return present(output, result.reply.body, [
      { id: id("restart", "reset"), title: "Start again", text: "RESET" },
    ]);
  if (result.state.endsWith("_awaiting_confirmation")) {
    // A saved default may have advanced the domain flow; let the customer select its address explicitly.
    if (
      ["eats", "meds", "meat", "retail"].includes(v) &&
      incoming.selectionId &&
      !addressSelected &&
      input.type !== "location" &&
      !currentState.endsWith("_awaiting_confirmation") &&
      (profile.addresses.length || v === "retail")
    ) {
      if (v !== "retail")
        output = { ...output, state: `${v}_awaiting_location` };
      return addresses(
        output,
        "Choose your delivery address. You can share a new location instead.",
      );
    }
    return present(output, result.reply.body, [
      { id: `${v}_confirm`, title: "Confirm", text: "CONFIRM" },
      { id: `${v}_cancel`, title: "Cancel", text: "CANCEL" },
    ]);
  }
  if (result.state.endsWith("_awaiting_payment"))
    return present(output, result.reply.body, [
      choice("payment", "Check payment", "status"),
      { id: `${v}_cancel`, title: "Cancel", text: "CANCEL" },
    ]);
  if (
    result.state.endsWith("_awaiting_location") ||
    (v === "cabs" &&
      /_(start|awaiting_pickup|awaiting_destination)$/.test(result.state))
  )
    return addresses(output);
  if (v === "eats" && /_(start|awaiting_item)$/.test(result.state))
    return eligible.length ? browse(output) : output;
  if (
    ["retail", "meds", "meat"].includes(v) &&
    /_(start|awaiting_product|awaiting_item)$/.test(result.state)
  )
    return eligible.length ? browse(output) : output;
  if (result.state.endsWith("_awaiting_quantity")) {
    const amounts =
      v === "meat"
        ? ["500g", "1 kg", "2 kg"]
        : v === "ecom"
          ? ["10", "50", "100"]
          : ["1", "2", "3"];
    const recent = profile.recent.quantity;
    if (
      typeof recent === "number" &&
      recent > 0 &&
      !amounts.includes(String(recent)) &&
      v !== "meat"
    )
      amounts.unshift(String(recent));
    const selected = eligible.find(
      (item) =>
        item.id === result.context?.productId ||
        item.id === result.context?.itemName,
    );
    const settings = object(data.config?.settings.quoteSettings);
    const max = Math.min(
      typeof selected?.metadata.stock === "number"
        ? selected.metadata.stock
        : Infinity,
      v === "ecom" && typeof settings.maxQuantity === "number"
        ? settings.maxQuantity
        : Infinity,
    );
    return present(
      output,
      result.reply.body,
      amounts
        .filter(
          (amount) =>
            (v === "meat"
              ? parseFloat(amount) / (amount.endsWith("kg") ? 1 : 1000)
              : Number(amount)) <= max,
        )
        .map((amount) => choice("quantity", amount, amount)),
    );
  }
  if (result.state.endsWith("_awaiting_budget")) {
    const settings = object(data.config?.settings.quoteSettings);
    const max =
      typeof settings.maxBudgetPerItem === "number"
        ? settings.maxBudgetPerItem
        : 1000000;
    return present(
      output,
      result.reply.body,
      [100, 500, 1000, 5000]
        .filter((n) => n <= max)
        .map((n) => choice("budget", `₹${n}`, String(n))),
    );
  }
  if (v === "salon" && result.state === "salon_awaiting_stylist") {
    const service = eligible.find(
      (item) => item.id === result.context?.serviceId,
    );
    const allowed = service?.metadata.staffIds;
    const staff = {
      any: "Any Stylist",
      ...object(data.config?.settings.staff),
    };
    const choices = Object.entries(staff)
      .filter(
        ([key, name]) =>
          typeof name === "string" &&
          (key === "any" ||
            !Array.isArray(allowed) ||
            !allowed.length ||
            allowed.includes(key)),
      )
      .map(([key, name]) => ({
        id: id("stylist", key),
        title: String(name),
        nativeId: `salon_stylist_${key}`,
      }));
    choices.sort(
      (a, b) =>
        Number(b.nativeId === `salon_stylist_${profile.recent.stylistId}`) -
        Number(a.nativeId === `salon_stylist_${profile.recent.stylistId}`),
    );
    return present(output, result.reply.body, choices);
  }
  if (
    ["garage", "expert", "gaming", "sport"].includes(v) &&
    result.state.endsWith("_awaiting_time") &&
    result.reply.type === "text"
  ) {
    const service = eligible.find(
      (item) => item.id === result.context?.serviceId,
    );
    const minutes =
      Number(service?.metadata.durationMinutes) *
      (v === "gaming" ? Number(result.context?.durationHours) : 1);
    const date = result.context?.bookingDate;
    const times =
      typeof date === "string"
        ? mockSlots.filter((time) =>
            slotAvailable(date, time, minutes, new Date()),
          )
        : [];
    return times.length
      ? present(
          output,
          result.reply.body,
          times.map((time) => choice("time", time, time)),
        )
      : present(output, result.reply.body, [
          choice("date", "Tomorrow", "tomorrow"),
          {
            id: id("date", "custom"),
            title: "Choose Date",
            action: "prompt",
            value:
              "Type your preferred date, for example 25 Oct or 2026-10-25.",
          },
        ]);
  }
  if (v === "garage" && /_(start|awaiting_vehicle)$/.test(result.state))
    return present(output, result.reply.body, [
      ...profile.vehicles.map((vehicle) => choice("vehicle", vehicle, vehicle)),
      {
        id: id("vehicle", "new"),
        title: "Enter vehicle",
        action: "prompt",
        value: "Please type your vehicle make/model.",
      },
    ]);
  if (
    v === "motos" &&
    /_(start|awaiting_query)$/.test(result.state) &&
    eligible.length
  ) {
    const filters = [
      ...new Set(
        eligible.flatMap((item) =>
          typeof item.metadata.transmission === "string"
            ? [item.metadata.transmission]
            : [],
        ),
      ),
    ];
    return present(
      output,
      "Choose a transmission filter, or type a model/budget.",
      filters.map((filter) => choice("filter", filter, filter)),
    );
  }
  if (
    v === "motos" &&
    result.state === "motos_showing_results" &&
    Array.isArray(result.context?.matchedVehicleIds)
  ) {
    const matches = result.context.matchedVehicleIds;
    return present(
      output,
      result.reply.body,
      eligible
        .filter((item) => matches.includes(item.id))
        .map((item) => ({
          id: id("car", item.id),
          title: item.name,
          nativeId: `motos_car_${item.id}`,
          description: `${item.metadata.transmission ?? ""} · ₹${item.price}`,
        })),
    );
  }
  if (
    ["salon", "expert", "gaming", "sport"].includes(v) &&
    /_(start|awaiting_service|awaiting_station|awaiting_activity)$/.test(
      result.state,
    ) &&
    eligible.length
  ) {
    return present(
      output,
      result.reply.body,
      eligible.map((item) =>
        v === "sport"
          ? {
              id: id("activity", item.id),
              title: item.name,
              action: "venue",
              value: item.id,
            }
          : catalogChoice(item),
      ),
    );
  }
  if (result.state.endsWith("_awaiting_prescription"))
    return present(output, result.reply.body, [
      {
        id: id("prescription", "back"),
        title: "Back to products",
        text: "RESET",
      },
      {
        id: id("prescription", "help"),
        title: "Pharmacist help",
        action: "prompt",
        value:
          "Please share a valid prescription using WhatsApp attachments, or consult a licensed pharmacist. No prescription approval or medical advice is provided by this bot.",
      },
    ]);
  if (result.reply.type === "list") {
    const choices = result.reply.sections
      .flatMap((section) => section.rows)
      .map((row) => ({
        id: row.id,
        title: row.title,
        ...(row.description ? { description: row.description } : {}),
      }));
    if (
      result.state.endsWith("_awaiting_variant") &&
      result.context?.productId === profile.recent.productId
    )
      choices.sort(
        (a, b) =>
          Number(b.title === profile.recent.variant) -
          Number(a.title === profile.recent.variant),
      );
    // Native IDs keep their existing authoritative flow handlers.
    return present(
      output,
      result.reply.body,
      choices.map((c) => ({ ...c, id: id("native", c.id), nativeId: c.id })),
    );
  }
  return output;
}
