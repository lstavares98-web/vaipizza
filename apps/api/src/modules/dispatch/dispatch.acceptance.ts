import { prisma } from "../../config/prisma.js";
import { acceptAssignment } from "./dispatch.service.js";

export async function cancelCompetingCourierOffers(orderId: string, winnerAssignmentId: string) {
  await prisma.$transaction(async (tx) => {
    const competing = await tx.courierAssignment.findMany({
      where: { orderId, id: { not: winnerAssignmentId }, status: "OFFERED" },
      select: { id: true, courierId: true },
    });
    if (competing.length === 0) return;

    const now = new Date();
    const assignmentIds = competing.map((assignment) => assignment.id);
    const courierIds = Array.from(new Set(competing.map((assignment) => assignment.courierId)));

    await tx.courierAssignment.updateMany({
      where: { id: { in: assignmentIds }, status: "OFFERED" },
      data: { status: "CANCELLED", respondedAt: now },
    });
    await tx.courier.updateMany({
      where: { id: { in: courierIds }, status: "ASSIGNED" },
      data: { status: "AVAILABLE" },
    });
  });
}

export async function acceptAssignmentAndFinalize(courierId: string, assignmentId: string) {
  const order = await acceptAssignment(courierId, assignmentId);
  if (!order) return null;
  await cancelCompetingCourierOffers(order.id, assignmentId);
  return order;
}
