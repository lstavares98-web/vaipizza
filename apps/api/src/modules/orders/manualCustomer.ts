import { prisma } from "../../config/prisma.js";
import { badRequest } from "../../utils/AppError.js";

export function normalizePhone(input: string): string {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (raw.startsWith("00") && digits.length > 2) return `+${digits.slice(2)}`;
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 9) return `+351${digits}`;
  if (digits.startsWith("351") && digits.length === 12) return `+${digits}`;
  return digits;
}

type RegisteredAddress = {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string | null;
  lat: number;
  lng: number;
  isDefault: boolean;
};

export type ManualCustomerLookup =
  | {
      type: "REGISTERED";
      customer: { id: string; name: string; phone: string; addresses: RegisteredAddress[] };
    }
  | {
      type: "CONTACT";
      customer: { id: string; name: string; phone: string };
      lastDelivery: {
        line1: string | null;
        line2: string | null;
        city: string | null;
        postalCode: string | null;
        lat: number | null;
        lng: number | null;
      } | null;
    }
  | { type: "NOT_FOUND"; phone: string };

export async function lookupManualCustomer(restaurantId: string, phone: string): Promise<ManualCustomerLookup> {
  const phoneNormalized = normalizePhone(phone);
  if (phoneNormalized.replace(/\D/g, "").length < 7) {
    throw badRequest("Indique um número de telefone válido", "INVALID_PHONE");
  }

  // Existing accounts pre-date canonical phone storage, so compare their
  // stored variants after normalization. Only the minimal CUSTOMER fields
  // needed by the counter flow are loaded.
  const registeredCandidates = await prisma.user.findMany({
    where: { role: "CUSTOMER", phone: { not: null } },
    select: {
      id: true,
      name: true,
      phone: true,
      addresses: {
        select: {
          id: true,
          label: true,
          line1: true,
          line2: true,
          city: true,
          postalCode: true,
          lat: true,
          lng: true,
          isDefault: true,
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  const registered = registeredCandidates.find(
    (candidate) => candidate.phone && normalizePhone(candidate.phone) === phoneNormalized,
  );
  if (registered?.phone) {
    return {
      type: "REGISTERED",
      customer: {
        id: registered.id,
        name: registered.name,
        phone: normalizePhone(registered.phone),
        addresses: registered.addresses,
      },
    };
  }

  const contact = await prisma.customerContact.findUnique({ where: { phoneNormalized } });
  if (!contact) return { type: "NOT_FOUND", phone: phoneNormalized };

  const lastOrder = await prisma.order.findFirst({
    where: { restaurantId, customerContactId: contact.id, fulfillmentType: "DELIVERY" },
    orderBy: { createdAt: "desc" },
    select: {
      deliveryLine1Snapshot: true,
      deliveryLine2Snapshot: true,
      deliveryCitySnapshot: true,
      deliveryPostalCodeSnapshot: true,
      customerLat: true,
      customerLng: true,
    },
  });

  return {
    type: "CONTACT",
    customer: { id: contact.id, name: contact.name, phone: contact.phoneNormalized },
    lastDelivery: lastOrder
      ? {
          line1: lastOrder.deliveryLine1Snapshot,
          line2: lastOrder.deliveryLine2Snapshot,
          city: lastOrder.deliveryCitySnapshot,
          postalCode: lastOrder.deliveryPostalCodeSnapshot,
          lat: lastOrder.customerLat,
          lng: lastOrder.customerLng,
        }
      : null,
  };
}
