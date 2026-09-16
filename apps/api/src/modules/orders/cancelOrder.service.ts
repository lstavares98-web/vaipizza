import { Role, type Role as RoleType } from "@yummix/types";
import { prisma } from "../../config/prisma.js";
import { attemptRefund } from "../../services/refund.service.js";
import { getIO, rooms } from "../../sockets/io.js";
import { badRequest, notFound } from "../../utils/AppError.js";
import { dispatchWaitingOrders } from "../dispatch/dispatch.service.js";

const CANCELLABLE_BEFORE_HANDOFF = [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "WAITING_FOR_COURIER",
  "COURIER_ASSIGNED",
] as const;

const ACTIVE_DELIVERY_STATUSES = ["COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"] as const;

type CancelBeforeHandoffInput = {
  orderId: string;
  actorRole: RoleType;
  actorRestaurantId?: string;
  reason: string;
};

export async function cancelOrderBeforeHandoff(input: CancelBeforeHandoffInput) {
  const reason = input.reason.trim();
  if (!reason) throw badRequest("Indique o motivo do cancelamento", "CANCELLATION_REASON_REQUIRED");

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order || (input.actorRestaurantId && order.restaurantId !== input.actorRestaurantId)) {
      throw notFound("Order not found");
    }
    if (!(CANCELLABLE_BEFORE_HANDOFF as readonly string[]).includes(order.status)) {
      throw badRequest("Este pedido já não pode ser cancelado", "NOT_CANCELLABLE");
    }

    const liveAssignments = await tx.courierAssignment.findMany({
      where: { orderId: order.id, status: { in: ["OFFERED", "ACCEPTED"] } },
      include: { courier: { select: { id: true, userId: true, operationalState: true } } },
    });

    // Claim the exact order state we inspected. If the courier/kitchen advances
    // it concurrently, cancellation loses safely instead of overwriting a newer state.
    const cancellationClaim = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: {
        status: "CANCELLED",
        cancelledBy: input.actorRole,
        cancelledAt: now,
        rejectionReason: reason,
        courierId: null,
      },
    });
    if (cancellationClaim.count !== 1) {
      throw badRequest("O estado do pedido já foi atualizado", "ORDER_STATUS_CONFLICT");
    }

    await tx.orderStatusEvent.create({
      data: { orderId: order.id, status: "CANCELLED", actor: input.actorRole },
    });

    // Never delete assignment history. Live rows become CANCELLED with response time.
    await tx.courierAssignment.updateMany({
      where: { orderId: order.id, status: { in: ["OFFERED", "ACCEPTED"] } },
      data: { status: "CANCELLED", respondedAt: now },
    });

    const affectedCouriers = new Map<string, { id: string; userId: string }>();
    for (const assignment of liveAssignments) {
      affectedCouriers.set(assignment.courier.id, {
        id: assignment.courier.id,
        userId: assignment.courier.userId,
      });
    }

    let promotedOrder: Awaited<ReturnType<typeof tx.order.findUnique>> = null;
    let capacityChanged = false;

    // COURIER_ASSIGNED occupies the courier's active slot. Cancelling it must
    // mirror delivery completion: promote the accepted queued reservation or
    // genuinely free the courier, all before the transaction commits.
    if (order.courierId) {
      const courier = await tx.courier.findUnique({ where: { id: order.courierId } });
      if (courier) {
        affectedCouriers.set(courier.id, { id: courier.id, userId: courier.userId });
        capacityChanged = true;

        if (courier.operationalState === "ACTIVE") {
          const reservation = await tx.courierAssignment.findFirst({
            where: {
              courierId: courier.id,
              isQueued: true,
              status: "ACCEPTED",
              orderId: { not: order.id },
            },
            orderBy: { respondedAt: "asc" },
          });

          if (reservation) {
            const promotionClaim = await tx.order.updateMany({
              where: {
                id: reservation.orderId,
                status: "WAITING_FOR_COURIER",
                courierId: null,
              },
              data: { status: "COURIER_ASSIGNED", courierId: courier.id },
            });

            if (promotionClaim.count === 1) {
              await tx.courierAssignment.update({
                where: { id: reservation.id },
                data: { isQueued: false },
              });
              await tx.orderStatusEvent.create({
                data: {
                  orderId: reservation.orderId,
                  status: "COURIER_ASSIGNED",
                  actor: input.actorRole,
                },
              });
              promotedOrder = await tx.order.findUnique({ where: { id: reservation.orderId } });
            } else {
              await tx.courierAssignment.updateMany({
                where: { id: reservation.id, status: "ACCEPTED", isQueued: true },
                data: { status: "CANCELLED", respondedAt: now },
              });
            }
          }

          if (!promotedOrder) {
            // An unanswered queued offer must be reconsidered now that this courier
            // is free; keeping it queued would violate free-courier priority.
            await tx.courierAssignment.updateMany({
              where: { courierId: courier.id, isQueued: true, status: "OFFERED" },
              data: { status: "CANCELLED", respondedAt: now },
            });
          }

          await tx.courier.update({
            where: { id: courier.id },
            data: { status: promotedOrder ? "GOING_TO_RESTAURANT" : "AVAILABLE" },
          });
        } else {
          // A non-active account must never become AVAILABLE because a cancellation
          // freed its order. Its queued work is cancelled and it remains OFFLINE.
          await tx.courierAssignment.updateMany({
            where: {
              courierId: courier.id,
              isQueued: true,
              status: { in: ["OFFERED", "ACCEPTED"] },
            },
            data: { status: "CANCELLED", respondedAt: now },
          });
          await tx.courier.update({ where: { id: courier.id }, data: { status: "OFFLINE" } });
        }
      }
    } else {
      // A non-queued OFFERED assignment reserves a free courier by putting them in
      // ASSIGNED. If this waiting order is cancelled, release only those couriers.
      const offeredCourierIds = Array.from(
        new Set(
          liveAssignments
            .filter((assignment) => !assignment.isQueued && assignment.status === "OFFERED")
            .map((assignment) => assignment.courierId),
        ),
      );
      if (offeredCourierIds.length > 0) {
        capacityChanged = true;
        await tx.courier.updateMany({
          where: {
            id: { in: offeredCourierIds },
            status: "ASSIGNED",
            operationalState: "ACTIVE",
          },
          data: { status: "AVAILABLE" },
        });
      }
    }

    const cancelledOrder = await tx.order.findUnique({ where: { id: order.id } });
    if (!cancelledOrder) throw notFound("Order not found");

    return {
      cancelledOrder,
      promotedOrder,
      affectedCouriers: Array.from(affectedCouriers.values()),
      capacityChanged,
    };
  });

  // Refund is deliberately best-effort after the state transition. Stripe
  // failures are recorded for Admin review by attemptRefund and never roll
  // an operational cancellation back.
  const { refunded } = await attemptRefund(result.cancelledOrder, input.actorRole);

  const io = getIO();
  io?.to(rooms.customer(result.cancelledOrder.userId)).emit("order:status", {
    orderId: result.cancelledOrder.id,
    status: "CANCELLED",
  });
  io?.to(rooms.restaurant(result.cancelledOrder.restaurantId)).emit("order:status", {
    orderId: result.cancelledOrder.id,
    status: "CANCELLED",
  });
  for (const courier of result.affectedCouriers) {
    io?.to(rooms.courier(courier.userId)).emit("assignment:cancelled", {
      orderId: result.cancelledOrder.id,
    });
  }

  if (result.promotedOrder) {
    const promotedCourier = result.affectedCouriers.find((courier) => courier.id === result.promotedOrder!.courierId);
    if (promotedCourier) {
      io?.to(rooms.courier(promotedCourier.userId)).emit("assignment:promoted", {
        orderId: result.promotedOrder.id,
      });
    }
    io?.to(rooms.restaurant(result.promotedOrder.restaurantId)).emit("order:status", {
      orderId: result.promotedOrder.id,
      status: "COURIER_ASSIGNED",
    });
    io?.to(rooms.customer(result.promotedOrder.userId)).emit("order:status", {
      orderId: result.promotedOrder.id,
      status: "COURIER_ASSIGNED",
    });
  }

  if (result.capacityChanged) await dispatchWaitingOrders();
  return { order: result.cancelledOrder, refunded };
}
