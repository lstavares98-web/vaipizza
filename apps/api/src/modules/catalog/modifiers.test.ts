import { describe, expect, it } from "vitest";
import { validateModifierSelections } from "./modifiers.js";

// Mirrors the seeded Pizza Margherita: required Size (1 of 3), required
// Crust (1 of 2), optional Extras (0-5 of 4).
const sizeGroup = {
  id: "g-size",
  productId: "p-1",
  name: "Tamanho",
  required: true,
  minSelect: 1,
  maxSelect: 1,
  sortOrder: 1,
  options: [
    { id: "o-medium", groupId: "g-size", name: "Média", priceDelta: 0, isDefault: true, sortOrder: 1 },
    { id: "o-large", groupId: "g-size", name: "Grande", priceDelta: 3, isDefault: false, sortOrder: 2 },
  ],
};

const extrasGroup = {
  id: "g-extras",
  productId: "p-1",
  name: "Extras",
  required: false,
  minSelect: 0,
  maxSelect: 2,
  sortOrder: 2,
  options: [
    { id: "o-bacon", groupId: "g-extras", name: "Bacon", priceDelta: 2, isDefault: false, sortOrder: 1 },
    { id: "o-cheese", groupId: "g-extras", name: "Queijo extra", priceDelta: 1.5, isDefault: false, sortOrder: 2 },
    { id: "o-mushroom", groupId: "g-extras", name: "Cogumelos", priceDelta: 1, isDefault: false, sortOrder: 3 },
  ],
};

describe("validateModifierSelections", () => {
  it("accepts a valid required + optional selection", () => {
    const chosen = validateModifierSelections([sizeGroup, extrasGroup], ["o-large", "o-bacon"]);
    expect(chosen.map((o) => o.id).sort()).toEqual(["o-bacon", "o-large"]);
  });

  it("rejects when a required group has no selection", () => {
    expect(() => validateModifierSelections([sizeGroup, extrasGroup], ["o-bacon"])).toThrowError(
      /Tamanho.*requer/,
    );
  });

  it("rejects exceeding a group's maxSelect", () => {
    expect(() =>
      validateModifierSelections([sizeGroup, extrasGroup], ["o-medium", "o-bacon", "o-cheese", "o-mushroom"]),
    ).toThrowError(/Extras.*no máximo/);
  });

  it("rejects an option id that doesn't belong to any group on this product", () => {
    expect(() => validateModifierSelections([sizeGroup, extrasGroup], ["o-medium", "o-does-not-exist"])).toThrowError(
      /não pertencem/,
    );
  });

  it("allows an optional group to be left empty", () => {
    const chosen = validateModifierSelections([sizeGroup, extrasGroup], ["o-medium"]);
    expect(chosen.map((o) => o.id)).toEqual(["o-medium"]);
  });
});
