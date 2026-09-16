import { Role } from "@yummix/types";
import { prisma } from "../../config/prisma.js";
import {
  getAdminPeriodAnalytics,
  getPendingCourierCashSummary,
  type DashboardPeriod,
} from "./adminAnalytics.js";

export async function getAdminDashboard(period: DashboardPeriod) {
  const [analytics, pendingCash, restaurantCount, customerCount, courierCount, pendingCouriers, unresolvedAlerts, installation] =
    await Promise.all([
      getAdminPeriodAnalytics(period),
      getPendingCourierCashSummary(),
      prisma.restaurant.count({ where: { status: "APPROVED" } }),
      prisma.user.count({ where: { role: Role.CUSTOMER } }),
      prisma.courier.count({ where: { verificationStatus: "APPROVED" } }),
      prisma.courier.count({ where: { verificationStatus: "PENDING" } }),
      prisma.adminAlert.count({ where: { resolved: false } }),
      prisma.restaurant.findFirst({
        where: { status: "APPROVED" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true, email: true, status: true, combosEnabled: true },
      }),
    ]);

  return {
    period,
    ...analytics,
    pendingCash,
    restaurantCount,
    customerCount,
    courierCount,
    pendingCouriers,
    unresolvedAlerts,
    installation,
  };
}
