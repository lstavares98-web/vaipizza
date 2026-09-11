export const LOAD_STAGES = [10, 50, 100, 250] as const;
export type QaLoadStage = (typeof LOAD_STAGES)[number];
export type QaLoadCaseKind = "inside" | "edge-inside" | "edge-outside" | "far-outside";

export interface QaLoadCase {
  index: number;
  kind: QaLoadCaseKind;
  distanceKm: number;
  expectedCheckout: "ACCEPT" | "OUT_OF_RANGE";
}

export function nextLoadStage(current: QaLoadStage, passed: boolean): QaLoadStage | null {
  if (!passed) return null;
  const index = LOAD_STAGES.indexOf(current);
  if (index < 0 || index === LOAD_STAGES.length - 1) return null;
  return LOAD_STAGES[index + 1] ?? null;
}

export function buildLoadCases(total: number, deliveryRadiusKm: number): QaLoadCase[] {
  if (!Number.isInteger(total) || total <= 0) throw new Error("Load case total must be a positive integer");
  if (!Number.isFinite(deliveryRadiusKm) || deliveryRadiusKm <= 0) throw new Error("deliveryRadiusKm must be positive");

  const edgeInside = Math.max(0, Math.round((deliveryRadiusKm - 0.1) * 10) / 10);
  const edgeOutside = Math.round((deliveryRadiusKm + 0.1) * 10) / 10;
  const farOutside = Math.round((deliveryRadiusKm + 3) * 10) / 10;
  const insideDistances = [1, 2, 3, 4, Math.max(0.1, deliveryRadiusKm * 0.6), Math.max(0.1, deliveryRadiusKm * 0.8)];

  return Array.from({ length: total }, (_, index) => {
    const slot = index % 10;
    if (slot <= 5) {
      const raw = insideDistances[slot] ?? 1;
      return {
        index,
        kind: "inside" as const,
        distanceKm: Math.min(raw, edgeInside),
        expectedCheckout: "ACCEPT" as const,
      };
    }
    if (slot <= 7) {
      return {
        index,
        kind: "edge-inside" as const,
        distanceKm: edgeInside,
        expectedCheckout: "ACCEPT" as const,
      };
    }
    if (slot === 8) {
      return {
        index,
        kind: "edge-outside" as const,
        distanceKm: edgeOutside,
        expectedCheckout: "OUT_OF_RANGE" as const,
      };
    }
    return {
      index,
      kind: "far-outside" as const,
      distanceKm: farOutside,
      expectedCheckout: "OUT_OF_RANGE" as const,
    };
  });
}
