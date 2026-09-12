import type { PrismaClient } from "@prisma/client";
import type { QaOrderAudit, QaOrderAuditInput } from "./types.js";

const COURIER_OWNED_STATUSES = new Set([
  "COURIER_ASSIGNED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
]);

export function validateOrderAudit(audit: QaOrderAudit): void {
  if (audit.acceptedAssignmentCourierIds.length > 1) {
    throw new Error(`Order ${audit.orderId} has multiple accepted courier owners`);
  }

  const acceptedCourierId = audit.acceptedAssignmentCourierIds[0] ?? null;
  if (acceptedCourierId && audit.orderCourierId !== acceptedCourierId) {
    throw new Error(`Order ${audit.orderId} courier does not match accepted assignment`);
  }

  if (COURIER_OWNED_STATUSES.has(audit.orderStatus) && !audit.orderCourierId) {
    throw new Error(`Order ${audit.orderId} is ${audit.orderStatus} without a courier owner`);
  }

  if (audit.deliveryEarningCount > 1) {
    throw new Error(`Order ${audit.orderId} has duplicate delivery earning effects`);
  }

  if (audit.waitingForCourier !== (audit.orderStatus === "WAITING_FOR_COURIER")) {
    throw new Error(`Order ${audit.orderId} waiting-for-courier audit is inconsistent`);
  }
}

export async function auditOrderConsistency(
  prisma: PrismaClient,
  input: QaOrderAuditInput,
): Promise<QaOrderAudit> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      courierId: true,
      courierAssignments: {
        select: { courierId: true, status: true },
      },
      courierEarnings: {
        where: { kind: "DELIVERY" },
        select: { id: true },
      },
    },
  });

  if (!order) throw new Error(`Order ${input.orderId} was not found for resilience audit`);

  const audit: QaOrderAudit = {
    orderId: order.id,
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    orderCourierId: order.courierId,
    acceptedAssignmentCourierIds: order.courierAssignments
      .filter((assignment) => assignment.status === "ACCEPTED")
      .map((assignment) => assignment.courierId),
    activeAssignmentCourierIds: order.courierAssignments
      .filter((assignment) => assignment.status === "ACCEPTED")
      .map((assignment) => assignment.courierId),
    deliveryEarningCount: order.courierEarnings.length,
    waitingForCourier: order.status === "WAITING_FOR_COURIER",
  };

  validateOrderAudit(audit);
  return audit;
}
