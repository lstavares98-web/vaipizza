import { describe, expect, it } from "vitest";
import { haversineKm, pointAtDistanceKm } from "./geo.js";
import { qaOperatorEmail } from "../manifest.js";

describe("QA geographic scenarios", () => {
  const origin = { lat: 41.5610096, lng: -8.4065289 };

  for (const km of [1, 7.9, 8.1, 11]) {
    it(`creates a deterministic point about ${km} km from the restaurant`, () => {
      const point = pointAtDistanceKm(origin.lat, origin.lng, km, 90);
      expect(haversineKm(origin.lat, origin.lng, point.lat, point.lng)).toBeCloseTo(km, 2);
    });
  }
});

describe("QA operator markers", () => {
  it("creates deterministic isolated operator emails", () => {
    expect(qaOperatorEmail("QA-20260911-191500", "staff"))
      .toBe("qa+QA-20260911-191500-operator-staff@vaipizza.test");
    expect(qaOperatorEmail("QA-20260911-191500", "kitchen"))
      .toBe("qa+QA-20260911-191500-operator-kitchen@vaipizza.test");
  });
});
