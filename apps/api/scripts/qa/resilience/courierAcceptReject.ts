import type { CourierRaceAssignmentState } from "./courierRace.js";

export interface CourierAcceptRejectSnapshot {
  orderId: string;
  orderCourierId: string | null;
  acceptingCourierId: string;
  rejectingCourierId: string;
  acceptStatus: number;
  rejectStatus: number;
  assignments: CourierRaceAssignmentState[];
}

export function validateCourierAcceptRejectOutcome(snapshot: CourierAcceptRejectSnapshot): void {
  if (snapshot.acceptStatus < 200 || snapshot.acceptStatus >= 300) {
    throw new Error(`Accept-vs-reject race accepting request failed with HTTP ${snapshot.acceptStatus}`);
  }
  if (snapshot.rejectStatus < 200 || snapshot.rejectStatus >= 300) {
    throw new Error(`Accept-vs-reject race rejecting request failed with HTTP ${snapshot.rejectStatus}`);
  }
  if (snapshot.orderCourierId !== snapshot.acceptingCourierId) {
    throw new Error("Accept-vs-reject race order owner does not match accepting courier");
  }
  const accepting = snapshot.assignments.find((assignment) => assignment.courierId === snapshot.acceptingCourierId);
  const rejecting = snapshot.assignments.find((assignment) => assignment.courierId === snapshot.rejectingCourierId);
  if (accepting?.status !== "ACCEPTED") {
    throw new Error(`Accept-vs-reject race accepting assignment is ${accepting?.status ?? "missing"}`);
  }
  if (rejecting?.status !== "REJECTED") {
    throw new Error(`Accept-vs-reject race rejecting assignment must be REJECTED, received ${rejecting?.status ?? "missing"}`);
  }
  if (snapshot.assignments.some((assignment) => assignment.status === "OFFERED")) {
    throw new Error("Accept-vs-reject race left an active OFFERED assignment");
  }
}
