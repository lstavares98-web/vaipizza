import type { PrismaClient } from "@prisma/client";
import type { QaConfig, QaRunManifest } from "./types.js";
import { assertMutationConfirmation } from "./config.js";

export interface CleanupOwnershipSnapshot {
  users: Array<{ id: string; email: string; role: string }>;
  orders: Array<{ id: string; userId: string }>;
  couriers: Array<{ id: string; userId: string; email: string }>;
  addresses: Array<{ id: string; userId: string }>;
  products: Array<{ id: string; categoryId: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  unexpectedCustomerOrders: Array<{ id: string; userId: string }>;
  unexpectedCourierRefs: Array<{ courierId: string; orderId: string; source: string }>;
  unexpectedProductRefs: Array<{ productId: string; source: string; ownerId?: string }>;
  unexpectedCategoryProducts: Array<{ id: string; categoryId: string }>;
}

export interface CleanupPlan {
  runId: string;
  customerUserIds: string[];
  courierUserIds: string[];
  courierIds: string[];
  addressIds: string[];
  productIds: string[];
  categoryIds: string[];
  orderIds: string[];
  missingIds: string[];
}

export interface CleanupResult {
  deleted: Record<string, number>;
  remainingIds: string[];
}

function expectedCustomerEmail(runId: string, email: string) {
  const prefix = `qa+${runId}-`;
  return email.startsWith(prefix) && !email.startsWith(`${prefix}courier-`) && email.endsWith("@vaipizza.test");
}

function expectedCourierEmail(runId: string, email: string) {
  return email.startsWith(`qa+${runId}-courier-`) && email.endsWith("@vaipizza.test");
}

export function validateCleanupOwnership(manifest: QaRunManifest, snapshot: CleanupOwnershipSnapshot): void {
  const customerIds = new Set(manifest.customerUserIds);
  const courierUserIds = new Set(manifest.courierUserIds);
  const courierIds = new Set(manifest.courierIds);
  const categoryIds = new Set(manifest.categoryIds);

  for (const id of customerIds) {
    if (courierUserIds.has(id)) throw new Error(`User id appears as both customer and courier: ${id}`);
  }

  for (const user of snapshot.users) {
    if (customerIds.has(user.id)) {
      if (user.role !== "CUSTOMER" || !expectedCustomerEmail(manifest.runId, user.email.toLowerCase())) {
        throw new Error(`Cleanup ownership mismatch for customer user ${user.id}`);
      }
    } else if (courierUserIds.has(user.id)) {
      if (user.role !== "COURIER" || !expectedCourierEmail(manifest.runId, user.email.toLowerCase())) {
        throw new Error(`Cleanup ownership mismatch for courier user ${user.id}`);
      }
    } else {
      throw new Error(`Cleanup loaded an untracked user ${user.id}`);
    }
  }

  for (const order of snapshot.orders) {
    if (!customerIds.has(order.userId)) {
      throw new Error(`Cleanup ownership mismatch for order ${order.id}`);
    }
  }

  for (const courier of snapshot.couriers) {
    if (!courierIds.has(courier.id) || !courierUserIds.has(courier.userId) || !expectedCourierEmail(manifest.runId, courier.email.toLowerCase())) {
      throw new Error(`Cleanup ownership mismatch for courier ${courier.id}`);
    }
  }

  for (const address of snapshot.addresses) {
    if (!customerIds.has(address.userId)) throw new Error(`Cleanup ownership mismatch for address ${address.id}`);
  }

  for (const product of snapshot.products) {
    if (!categoryIds.has(product.categoryId) || !product.name.startsWith(`[QA ${manifest.runId}]`)) {
      throw new Error(`Cleanup ownership mismatch for product ${product.id}`);
    }
  }

  for (const category of snapshot.categories) {
    if (!category.name.startsWith(`[QA ${manifest.runId}]`)) {
      throw new Error(`Cleanup ownership mismatch for category ${category.id}`);
    }
  }

  if (snapshot.unexpectedCustomerOrders.length) {
    throw new Error(`QA customer owns untracked orders: ${snapshot.unexpectedCustomerOrders.map((row) => row.id).join(", ")}`);
  }
  if (snapshot.unexpectedCourierRefs.length) {
    throw new Error(`QA courier is linked to untracked orders: ${snapshot.unexpectedCourierRefs.map((row) => row.orderId).join(", ")}`);
  }
  if (snapshot.unexpectedProductRefs.length) {
    throw new Error(`QA product is referenced outside the run: ${snapshot.unexpectedProductRefs.map((row) => row.productId).join(", ")}`);
  }
  if (snapshot.unexpectedCategoryProducts.length) {
    throw new Error(`QA category contains untracked products: ${snapshot.unexpectedCategoryProducts.map((row) => row.id).join(", ")}`);
  }
}

function notInFilter(ids: string[]) {
  return ids.length ? { notIn: ids } : undefined;
}

export async function preflightCleanup(prisma: PrismaClient, manifest: QaRunManifest): Promise<CleanupPlan> {
  const allUserIds = [...manifest.customerUserIds, ...manifest.courierUserIds];
  const [users, orders, couriers, addresses, products, categories] = await Promise.all([
    allUserIds.length
      ? prisma.user.findMany({ where: { id: { in: allUserIds } }, select: { id: true, email: true, role: true } })
      : Promise.resolve([]),
    manifest.orderIds.length
      ? prisma.order.findMany({ where: { id: { in: manifest.orderIds } }, select: { id: true, userId: true } })
      : Promise.resolve([]),
    manifest.courierIds.length
      ? prisma.courier.findMany({
          where: { id: { in: manifest.courierIds } },
          select: { id: true, userId: true, user: { select: { email: true } } },
        })
      : Promise.resolve([]),
    manifest.addressIds.length
      ? prisma.address.findMany({ where: { id: { in: manifest.addressIds } }, select: { id: true, userId: true } })
      : Promise.resolve([]),
    manifest.productIds.length
      ? prisma.product.findMany({ where: { id: { in: manifest.productIds } }, select: { id: true, categoryId: true, name: true } })
      : Promise.resolve([]),
    manifest.categoryIds.length
      ? prisma.category.findMany({ where: { id: { in: manifest.categoryIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const unexpectedCustomerOrders = manifest.customerUserIds.length
    ? await prisma.order.findMany({
        where: {
          userId: { in: manifest.customerUserIds },
          ...(manifest.orderIds.length ? { id: { notIn: manifest.orderIds } } : {}),
        },
        select: { id: true, userId: true },
      })
    : [];

  const courierOrderRows = manifest.courierIds.length
    ? await prisma.order.findMany({
        where: {
          courierId: { in: manifest.courierIds },
          ...(manifest.orderIds.length ? { id: { notIn: manifest.orderIds } } : {}),
        },
        select: { id: true, courierId: true },
      })
    : [];
  const courierAssignmentRows = manifest.courierIds.length
    ? await prisma.courierAssignment.findMany({
        where: {
          courierId: { in: manifest.courierIds },
          ...(manifest.orderIds.length ? { orderId: { notIn: manifest.orderIds } } : {}),
        },
        select: { courierId: true, orderId: true },
      })
    : [];

  const productOrderRows = manifest.productIds.length
    ? await prisma.orderItem.findMany({
        where: {
          OR: [
            { productId: { in: manifest.productIds } },
            { secondaryProductId: { in: manifest.productIds } },
          ],
          ...(manifest.orderIds.length ? { orderId: { notIn: manifest.orderIds } } : {}),
        },
        select: { productId: true, secondaryProductId: true, orderId: true },
      })
    : [];
  const productCartRows = manifest.productIds.length
    ? await prisma.cartItem.findMany({
        where: { OR: [{ productId: { in: manifest.productIds } }, { secondaryProductId: { in: manifest.productIds } }] },
        select: { productId: true, secondaryProductId: true, cart: { select: { userId: true } } },
      })
    : [];
  const comboFixedRows = manifest.productIds.length
    ? await prisma.comboFixedItem.findMany({ where: { productId: { in: manifest.productIds } }, select: { productId: true, comboId: true } })
    : [];
  const comboOptionRows = manifest.productIds.length
    ? await prisma.comboGroupOption.findMany({ where: { productId: { in: manifest.productIds } }, select: { productId: true, groupId: true } })
    : [];
  const unexpectedCategoryProducts = manifest.categoryIds.length
    ? await prisma.product.findMany({
        where: {
          categoryId: { in: manifest.categoryIds },
          ...(manifest.productIds.length ? { id: { notIn: manifest.productIds } } : {}),
        },
        select: { id: true, categoryId: true },
      })
    : [];

  const qaUserIds = new Set(allUserIds);
  const snapshot: CleanupOwnershipSnapshot = {
    users: users.map((row) => ({ ...row, role: String(row.role) })),
    orders,
    couriers: couriers.map((row) => ({ id: row.id, userId: row.userId, email: row.user.email })),
    addresses,
    products,
    categories,
    unexpectedCustomerOrders,
    unexpectedCourierRefs: [
      ...courierOrderRows.map((row) => ({ courierId: row.courierId!, orderId: row.id, source: "order" })),
      ...courierAssignmentRows.map((row) => ({ ...row, source: "assignment" })),
    ],
    unexpectedProductRefs: [
      ...productOrderRows.flatMap((row) => {
        const refs: Array<{ productId: string; source: string; ownerId?: string }> = [];
        if (row.productId && manifest.productIds.includes(row.productId)) refs.push({ productId: row.productId, source: "order-item", ownerId: row.orderId });
        if (row.secondaryProductId && manifest.productIds.includes(row.secondaryProductId)) refs.push({ productId: row.secondaryProductId, source: "split-order-item", ownerId: row.orderId });
        return refs;
      }),
      ...productCartRows.flatMap((row) => {
        if (qaUserIds.has(row.cart.userId)) return [];
        const refs: Array<{ productId: string; source: string; ownerId?: string }> = [];
        if (row.productId && manifest.productIds.includes(row.productId)) refs.push({ productId: row.productId, source: "cart", ownerId: row.cart.userId });
        if (row.secondaryProductId && manifest.productIds.includes(row.secondaryProductId)) refs.push({ productId: row.secondaryProductId, source: "split-cart", ownerId: row.cart.userId });
        return refs;
      }),
      ...comboFixedRows.map((row) => ({ productId: row.productId, source: "combo-fixed", ownerId: row.comboId })),
      ...comboOptionRows.map((row) => ({ productId: row.productId, source: "combo-option", ownerId: row.groupId })),
    ],
    unexpectedCategoryProducts,
  };

  validateCleanupOwnership(manifest, snapshot);

  const presentIds = new Set<string>([
    ...users.map((row) => row.id),
    ...orders.map((row) => row.id),
    ...couriers.map((row) => row.id),
    ...addresses.map((row) => row.id),
    ...products.map((row) => row.id),
    ...categories.map((row) => row.id),
  ]);
  const manifestIds = [...allUserIds, ...manifest.orderIds, ...manifest.courierIds, ...manifest.addressIds, ...manifest.productIds, ...manifest.categoryIds];

  return {
    runId: manifest.runId,
    customerUserIds: [...manifest.customerUserIds],
    courierUserIds: [...manifest.courierUserIds],
    courierIds: [...manifest.courierIds],
    addressIds: [...manifest.addressIds],
    productIds: [...manifest.productIds],
    categoryIds: [...manifest.categoryIds],
    orderIds: [...manifest.orderIds],
    missingIds: manifestIds.filter((id) => !presentIds.has(id)),
  };
}

export function cleanupMode(confirmDelete: boolean): "dry-run" | "delete" {
  return confirmDelete ? "delete" : "dry-run";
}

export async function executeCleanup(prisma: PrismaClient, plan: CleanupPlan, config: QaConfig): Promise<CleanupResult> {
  assertMutationConfirmation(config);
  const allUserIds = [...plan.customerUserIds, ...plan.courierUserIds];
  const deleted: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    if (plan.orderIds.length) {
      deleted.adminAlerts = (await tx.adminAlert.deleteMany({ where: { orderId: { in: plan.orderIds } } })).count;
      deleted.couponRedemptions = (await tx.couponRedemption.deleteMany({ where: { orderId: { in: plan.orderIds } } })).count;
      deleted.courierRatings = (await tx.courierRating.deleteMany({ where: { orderId: { in: plan.orderIds } } })).count;
      deleted.productRatings = (await tx.productRating.deleteMany({ where: { orderItem: { orderId: { in: plan.orderIds } } } })).count;
      deleted.orders = (await tx.order.deleteMany({ where: { id: { in: plan.orderIds } } })).count;
    }
    if (allUserIds.length) deleted.carts = (await tx.cart.deleteMany({ where: { userId: { in: allUserIds } } })).count;
    if (plan.addressIds.length) deleted.addresses = (await tx.address.deleteMany({ where: { id: { in: plan.addressIds } } })).count;
    if (plan.courierIds.length) deleted.couriers = (await tx.courier.deleteMany({ where: { id: { in: plan.courierIds } } })).count;
    if (plan.productIds.length) deleted.products = (await tx.product.deleteMany({ where: { id: { in: plan.productIds } } })).count;
    if (plan.categoryIds.length) deleted.categories = (await tx.category.deleteMany({ where: { id: { in: plan.categoryIds } } })).count;
    if (allUserIds.length) deleted.users = (await tx.user.deleteMany({ where: { id: { in: allUserIds } } })).count;
  });

  const remainingIds: string[] = [];
  const checks = await Promise.all([
    allUserIds.length ? prisma.user.findMany({ where: { id: { in: allUserIds } }, select: { id: true } }) : Promise.resolve([]),
    plan.orderIds.length ? prisma.order.findMany({ where: { id: { in: plan.orderIds } }, select: { id: true } }) : Promise.resolve([]),
    plan.courierIds.length ? prisma.courier.findMany({ where: { id: { in: plan.courierIds } }, select: { id: true } }) : Promise.resolve([]),
    plan.addressIds.length ? prisma.address.findMany({ where: { id: { in: plan.addressIds } }, select: { id: true } }) : Promise.resolve([]),
    plan.productIds.length ? prisma.product.findMany({ where: { id: { in: plan.productIds } }, select: { id: true } }) : Promise.resolve([]),
    plan.categoryIds.length ? prisma.category.findMany({ where: { id: { in: plan.categoryIds } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  for (const rows of checks) remainingIds.push(...rows.map((row) => row.id));

  if (remainingIds.length) throw new Error(`QA cleanup incomplete; rows remain: ${remainingIds.join(", ")}`);
  return { deleted, remainingIds };
}
