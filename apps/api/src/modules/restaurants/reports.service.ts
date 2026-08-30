import { prisma } from "../../config/prisma.js";
import { round2 } from "../../utils/pricing.js";

interface DateRange {
  from: Date;
  to: Date;
}

export async function getRestaurantReport(restaurantId: string, range: DateRange) {
  const orders = await prisma.order.findMany({
    where: { restaurantId, createdAt: { gte: range.from, lte: range.to } },
    include: { items: { include: { modifiers: { include: { option: { include: { group: true } } } } } } },
  });

  const delivered = orders.filter((o) => o.status === "DELIVERED" || o.status === "COLLECTED");
  const cancelled = orders.filter((o) => o.status === "CANCELLED");
  const revenue = round2(delivered.reduce((sum, o) => sum + o.total, 0));

  const productCounts = new Map<string, number>();
  const modifierCounts = new Map<string, Map<string, number>>(); // groupName -> optionName -> count

  for (const order of delivered) {
    for (const item of order.items) {
      productCounts.set(item.productNameSnapshot, (productCounts.get(item.productNameSnapshot) ?? 0) + item.quantity);
      for (const mod of item.modifiers) {
        // The modifier group/option may have since been edited or removed
        // from the product — nameSnapshot survives that, but there's no
        // snapshot of the *group* name, so fall back to a generic bucket.
        const groupName = mod.option?.group.name ?? "Outros";
        const group = modifierCounts.get(groupName) ?? new Map<string, number>();
        group.set(mod.nameSnapshot, (group.get(mod.nameSnapshot) ?? 0) + item.quantity);
        modifierCounts.set(groupName, group);
      }
    }
  }

  const topProducts = Array.from(productCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topModifiersByGroup = Array.from(modifierCounts.entries()).map(([groupName, options]) => ({
    groupName,
    options: Array.from(options.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  }));

  return {
    ordersTotal: orders.length,
    ordersDelivered: delivered.length,
    ordersCancelled: cancelled.length,
    revenue,
    avgTicket: delivered.length > 0 ? round2(revenue / delivered.length) : 0,
    topProducts,
    topModifiersByGroup,
  };
}
