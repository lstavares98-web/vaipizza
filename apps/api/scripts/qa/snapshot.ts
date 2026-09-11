import type { PrismaClient } from "@prisma/client";
import type { ProtectedSnapshot, SnapshotDiff } from "./types.js";

export async function captureProtectedSnapshot(prisma: PrismaClient): Promise<ProtectedSnapshot> {
  const slug = process.env.PRIMARY_RESTAURANT_SLUG ?? "vaipizza";
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      lat: true,
      lng: true,
      deliveryRadiusKm: true,
      courierDispatchRadiusKm: true,
      deliveryFeeMode: true,
      deliveryFeeBase: true,
      deliveryFeePerKm: true,
      deliveryFeeFreeKm: true,
      deliveryFeeTiers: {
        select: { id: true, upToKm: true, fee: true },
        orderBy: [{ upToKm: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!restaurant) {
    throw new Error(`Protected restaurant not found for slug: ${slug}`);
  }

  const courierRows = await prisma.courier.findMany({
    select: {
      id: true,
      userId: true,
      verificationStatus: true,
      user: { select: { email: true } },
    },
    orderBy: { id: "asc" },
  });

  return {
    version: 1,
    restaurant: {
      ...restaurant,
      deliveryFeeMode: String(restaurant.deliveryFeeMode),
    },
    couriers: courierRows
      .filter((courier) => !courier.user.email.toLowerCase().startsWith("qa+"))
      .map(({ id, userId, verificationStatus }) => ({
        id,
        userId,
        verificationStatus: String(verificationStatus),
      })),
  };
}

export function compareProtectedSnapshots(before: ProtectedSnapshot, after: ProtectedSnapshot): SnapshotDiff[] {
  const diffs: SnapshotDiff[] = [];

  const visit = (left: unknown, right: unknown, path: string) => {
    if (Object.is(left, right)) return;

    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right)) {
        diffs.push({ path, before: left, after: right });
        return;
      }
      const max = Math.max(left.length, right.length);
      for (let index = 0; index < max; index += 1) {
        visit(left[index], right[index], `${path}[${index}]`);
      }
      return;
    }

    if (left && right && typeof left === "object" && typeof right === "object") {
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
      const keys = Array.from(new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])).sort();
      for (const key of keys) {
        visit(leftRecord[key], rightRecord[key], path ? `${path}.${key}` : key);
      }
      return;
    }

    diffs.push({ path, before: left, after: right });
  };

  visit(before, after, "");
  return diffs;
}
