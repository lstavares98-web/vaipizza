import type { Role as RoleType } from "@yummix/types";
import { prisma } from "../../config/prisma.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import { calcDeliveryFee, haversineKm } from "../../utils/geo.js";
import { computeSplitBasePrice, computeUnitPrice, round2 } from "../../utils/pricing.js";
import { computeChangeDue } from "../couriers/cash.js";
import { comboInclude } from "../combos/combos.service.js";
import {
  buildComboSelectionSnapshot,
  isComboScheduleAvailable,
  priceCombo,
  validateComboSelection,
  type ComboSelectionInput,
} from "../combos/combo.rules.js";
import { getIO, rooms } from "../../sockets/io.js";
import { normalizePhone } from "./manualCustomer.js";

export interface ManualOrderDeliveryInput {
  line1: string;
  line2?: string;
  city: string;
  postalCode?: string;
  lat: number;
  lng: number;
}

export interface ManualOrderItemInput {
  productId?: string;
  comboId?: string;
  secondaryProductId?: string;
  quantity: number;
  modifierOptionIds?: string[];
  comboSelections?: ComboSelectionInput[];
  notes?: string;
}

export interface ManualOrderInput {
  origin: "PHONE" | "COUNTER";
  fulfillmentType: "DELIVERY" | "PICKUP";
  registeredUserId?: string;
  customerName?: string;
  customerPhone?: string;
  addressId?: string;
  delivery?: ManualOrderDeliveryInput;
  paymentMethod: "CASH" | "MBWAY" | "TERMINAL";
  amountTendered?: number;
  notes?: string;
  items: ManualOrderItemInput[];
}

type ManualIdentity = {
  userId: string | null;
  contactNeeded: boolean;
  name: string | null;
  phone: string | null;
};

async function resolveIdentity(input: ManualOrderInput): Promise<ManualIdentity> {
  if (input.registeredUserId) {
    const user = await prisma.user.findFirst({
      where: { id: input.registeredUserId, role: "CUSTOMER" },
      select: { id: true, role: true, name: true, phone: true },
    });
    if (!user) throw notFound("Cliente registado não encontrado");
    const phone = normalizePhone(input.customerPhone ?? user.phone ?? "") || null;
    if (input.origin === "PHONE" && !phone) {
      throw badRequest("O cliente precisa de um telefone válido", "CUSTOMER_PHONE_REQUIRED");
    }
    return { userId: user.id, contactNeeded: false, name: user.name, phone };
  }

  const anonymousCounterPickup = input.origin === "COUNTER" && input.fulfillmentType === "PICKUP" && !input.customerName?.trim() && !input.customerPhone?.trim();
  if (anonymousCounterPickup) {
    return { userId: null, contactNeeded: false, name: null, phone: null };
  }

  const name = input.customerName?.trim();
  const phone = normalizePhone(input.customerPhone ?? "");
  if (!name) throw badRequest("Indique o nome do cliente", "CUSTOMER_NAME_REQUIRED");
  if (phone.replace(/\D/g, "").length < 7) {
    throw badRequest("Indique um número de telefone válido", "CUSTOMER_PHONE_REQUIRED");
  }
  return { userId: null, contactNeeded: true, name, phone };
}

function validateProductSelections(product: any, item: ManualOrderItemInput) {
  if (!product.isAvailable || (product.stock != null && product.stock < item.quantity)) {
    throw badRequest(`${product.name} não está disponível`, "PRODUCT_UNAVAILABLE");
  }
  const selectedIds = Array.from(new Set(item.modifierOptionIds ?? []));
  const knownIds = new Set(product.modifierGroups.flatMap((group: any) => group.options.map((option: any) => option.id)));
  if (selectedIds.some((id) => !knownIds.has(id))) {
    throw badRequest("Uma ou mais opções do produto são inválidas", "INVALID_MODIFIER_OPTION");
  }

  const selectedOptions: any[] = [];
  for (const group of product.modifierGroups) {
    const groupSelected = group.options.filter((option: any) => selectedIds.includes(option.id));
    if (groupSelected.length < group.minSelect || groupSelected.length > group.maxSelect) {
      throw badRequest(`Selecione entre ${group.minSelect} e ${group.maxSelect} opção(ões) em ${group.name}`, "INVALID_MODIFIER_SELECTION");
    }
    selectedOptions.push(...groupSelected);
  }
  return selectedOptions;
}

async function priceManualItems(restaurantId: string, combosEnabled: boolean, items: ManualOrderItemInput[]) {
  if (!items.length) throw badRequest("Adicione pelo menos um item ao pedido", "EMPTY_ORDER");
  if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50)) {
    throw badRequest("Quantidade de item inválida", "INVALID_ITEM_QUANTITY");
  }

  const productIds = Array.from(new Set(items.flatMap((item) => [item.productId, item.secondaryProductId].filter((id): id is string => Boolean(id)))));
  const comboIds = Array.from(new Set(items.map((item) => item.comboId).filter((id): id is string => Boolean(id))));

  const [products, combos] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds }, restaurantId },
          include: { modifierGroups: { include: { options: true } } },
        })
      : Promise.resolve([]),
    comboIds.length
      ? prisma.combo.findMany({ where: { id: { in: comboIds }, restaurantId }, include: comboInclude })
      : Promise.resolve([]),
  ]);

  const productMap = new Map(products.map((product) => [product.id, product]));
  const comboMap = new Map(combos.map((combo) => [combo.id, combo]));

  return items.map((item) => {
    const targetCount = Number(Boolean(item.productId)) + Number(Boolean(item.comboId));
    if (targetCount !== 1) throw badRequest("Item de pedido inválido", "INVALID_ORDER_ITEM");

    if (item.comboId) {
      if (!combosEnabled) throw badRequest("Combos estão desativados neste restaurante", "COMBOS_DISABLED");
      const combo = comboMap.get(item.comboId);
      if (!combo || !combo.isActive || !isComboScheduleAvailable(combo)) {
        throw badRequest("Combo indisponível ou inválido", "INVALID_ORDER_ITEM");
      }
      const selections = item.comboSelections ?? [];
      try {
        validateComboSelection(combo, selections);
      } catch (error) {
        throw badRequest(error instanceof Error ? error.message : "Seleção de combo inválida", "INVALID_COMBO_SELECTION");
      }
      let unitPrice: number;
      try {
        unitPrice = priceCombo(combo, selections);
      } catch (error) {
        throw badRequest(error instanceof Error ? error.message : "Seleção de combo inválida", "INVALID_COMBO_SELECTION");
      }
      return {
        productId: null,
        comboId: combo.id,
        productNameSnapshot: combo.name,
        secondaryProductId: null,
        secondaryProductNameSnapshot: null,
        splitPricingRule: null,
        comboSelectionsSnapshot: buildComboSelectionSnapshot(combo, selections),
        quantity: item.quantity,
        unitPrice,
        lineTotal: round2(unitPrice * item.quantity),
        notes: item.notes?.trim() || null,
        modifiers: [] as Array<{ optionId: string; nameSnapshot: string; priceDeltaSnapshot: number }>,
      };
    }

    const product = item.productId ? productMap.get(item.productId) : null;
    if (!product) throw badRequest("Produto inválido para este restaurante", "INVALID_ORDER_ITEM");
    const selectedOptions = validateProductSelections(product, item);

    let basePrice = product.basePrice;
    let secondaryProduct: any = null;
    if (item.secondaryProductId) {
      if (!product.allowsSplit) throw badRequest("Este produto não permite meio a meio", "SPLIT_NOT_ALLOWED");
      secondaryProduct = productMap.get(item.secondaryProductId);
      if (!secondaryProduct || !secondaryProduct.isAvailable || (secondaryProduct.stock != null && secondaryProduct.stock < item.quantity)) {
        throw badRequest("Segundo sabor indisponível ou inválido", "INVALID_ORDER_ITEM");
      }
      basePrice = computeSplitBasePrice(product.basePrice, secondaryProduct.basePrice, product.splitPricingRule);
    }

    const unitPrice = computeUnitPrice(basePrice, selectedOptions);
    return {
      productId: product.id,
      comboId: null,
      productNameSnapshot: product.name,
      secondaryProductId: secondaryProduct?.id ?? null,
      secondaryProductNameSnapshot: secondaryProduct?.name ?? null,
      splitPricingRule: secondaryProduct ? product.splitPricingRule : null,
      comboSelectionsSnapshot: null,
      quantity: item.quantity,
      unitPrice,
      lineTotal: round2(unitPrice * item.quantity),
      notes: item.notes?.trim() || null,
      modifiers: selectedOptions.map((option: any) => ({
        optionId: option.id,
        nameSnapshot: option.name,
        priceDeltaSnapshot: option.priceDelta,
      })),
    };
  });
}

export async function createManualOrder(restaurantId: string, actorRole: RoleType | string, input: ManualOrderInput) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: { deliveryFeeTiers: true },
  });
  if (!restaurant) throw notFound("Restaurante não encontrado");
  if (input.fulfillmentType === "DELIVERY" && !restaurant.acceptsDelivery) throw badRequest("Este restaurante não aceita entregas");
  if (input.fulfillmentType === "PICKUP" && !restaurant.acceptsPickup) throw badRequest("Este restaurante não aceita recolha no local");
  if (input.paymentMethod === "MBWAY" && !restaurant.mbwayPhone) {
    throw badRequest("O pagamento por MB WAY ainda não está configurado neste restaurante", "MBWAY_NOT_CONFIGURED");
  }

  const identity = await resolveIdentity(input);
  const pricedItems = await priceManualItems(restaurantId, restaurant.combosEnabled, input.items);
  const subtotal = round2(pricedItems.reduce((sum, item) => sum + item.lineTotal, 0));

  let addressId: string | null = null;
  let delivery: ManualOrderDeliveryInput | null = null;
  let deliveryFee = 0;

  if (input.fulfillmentType === "DELIVERY") {
    if (!identity.name || !identity.phone) {
      throw badRequest("Nome e telefone são obrigatórios para entrega", "CUSTOMER_DETAILS_REQUIRED");
    }

    if (input.addressId) {
      if (!identity.userId) throw badRequest("Morada guardada só pode ser usada por cliente registado", "INVALID_ADDRESS");
      const savedAddress = await prisma.address.findFirst({ where: { id: input.addressId, userId: identity.userId } });
      if (!savedAddress) throw notFound("Morada do cliente não encontrada");
      addressId = savedAddress.id;
      delivery = {
        line1: savedAddress.line1,
        line2: savedAddress.line2 ?? undefined,
        city: savedAddress.city,
        postalCode: savedAddress.postalCode ?? undefined,
        lat: savedAddress.lat,
        lng: savedAddress.lng,
      };
    } else if (input.delivery) {
      delivery = {
        line1: input.delivery.line1.trim(),
        line2: input.delivery.line2?.trim() || undefined,
        city: input.delivery.city.trim(),
        postalCode: input.delivery.postalCode?.trim() || undefined,
        lat: input.delivery.lat,
        lng: input.delivery.lng,
      };
      if (!delivery.line1 || !delivery.city || !Number.isFinite(delivery.lat) || !Number.isFinite(delivery.lng)) {
        throw badRequest("Morada de entrega inválida", "INVALID_ADDRESS");
      }
    } else {
      throw badRequest("Indique a morada de entrega", "ADDRESS_REQUIRED");
    }

    const distanceKm = haversineKm(delivery.lat, delivery.lng, restaurant.lat, restaurant.lng);
    if (distanceKm > restaurant.deliveryRadiusKm) {
      throw badRequest("Esta morada está fora da área de entrega do restaurante", "OUT_OF_RANGE");
    }
    deliveryFee = calcDeliveryFee(restaurant, distanceKm);
  }

  const total = round2(subtotal + deliveryFee);
  let amountTendered: number | null = null;
  let changeDue: number | null = null;
  if (input.paymentMethod === "CASH" && input.amountTendered != null) {
    amountTendered = input.amountTendered;
    changeDue = computeChangeDue(total, input.amountTendered);
  }

  const paymentStatus = input.paymentMethod === "TERMINAL" ? "PAID" : "PENDING";

  const order = await prisma.$transaction(async (tx) => {
    const contact = identity.contactNeeded
      ? await tx.customerContact.upsert({
          where: { phoneNormalized: identity.phone! },
          create: { name: identity.name!, phoneNormalized: identity.phone! },
          update: { name: identity.name! },
        })
      : null;

    return tx.order.create({
      data: {
        userId: identity.userId,
        customerContactId: contact?.id ?? null,
        restaurantId,
        origin: input.origin,
        customerNameSnapshot: identity.name,
        customerPhoneSnapshot: identity.phone,
        deliveryLine1Snapshot: delivery?.line1 ?? null,
        deliveryLine2Snapshot: delivery?.line2 ?? null,
        deliveryCitySnapshot: delivery?.city ?? null,
        deliveryPostalCodeSnapshot: delivery?.postalCode ?? null,
        fulfillmentType: input.fulfillmentType,
        addressId,
        customerLat: delivery?.lat ?? null,
        customerLng: delivery?.lng ?? null,
        subtotal,
        discount: 0,
        deliveryFee,
        total,
        paymentMethod: input.paymentMethod,
        paymentStatus,
        notes: input.notes?.trim() || null,
        amountTendered,
        changeDue,
        items: {
          create: pricedItems.map((item) => ({
            productId: item.productId,
            comboId: item.comboId,
            productNameSnapshot: item.productNameSnapshot,
            secondaryProductId: item.secondaryProductId,
            secondaryProductNameSnapshot: item.secondaryProductNameSnapshot,
            splitPricingRule: item.splitPricingRule,
            comboSelectionsSnapshot: item.comboSelectionsSnapshot ?? undefined,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            notes: item.notes,
            modifiers: { create: item.modifiers },
          })),
        },
        statusHistory: { create: { status: "NEW", actor: actorRole as RoleType } },
      },
      include: {
        items: { include: { modifiers: true } },
        user: { select: { name: true, phone: true } },
        customerContact: true,
        address: true,
      },
    });
  });

  getIO()?.to(rooms.restaurant(restaurantId)).emit("order:new", { orderId: order.id });
  return order;
}
