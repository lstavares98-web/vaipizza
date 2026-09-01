import { describe, expect, it } from "vitest";
import { buildComboSelectionSnapshot, isComboScheduleAvailable, priceCombo, validateComboSelection } from "./combo.rules.js";

const product = (id: string, isAvailable = true) => ({ id, name: id, isAvailable, stock: null as number | null });
const combo = {
  basePrice: 20,
  availableDays: [1],
  availableFrom: "18:00",
  availableTo: "23:00",
  fixedItems: [{ quantity: 1, product: product("fixed") }],
  groups: [
    {
      id: "g1",
      name: "Pizzas",
      minSelect: 1,
      maxSelect: 2,
      options: [
        { id: "o1", priceDelta: 0, product: product("p1") },
        { id: "o2", priceDelta: 2.5, product: product("p2") },
        { id: "o3", priceDelta: 1, product: product("p3", false) },
      ],
    },
  ],
};

describe("combo rules", () => {
  it("respeita dias e horários", () => {
    expect(isComboScheduleAvailable(combo, new Date("2026-08-31T18:30:00Z"), "UTC")).toBe(true);
    expect(isComboScheduleAvailable(combo, new Date("2026-08-31T17:59:00Z"), "UTC")).toBe(false);
  });

  it("exige o mínimo do grupo", () => {
    expect(() => validateComboSelection(combo, [{ groupId: "g1", optionIds: [] }])).toThrow(/mínimo/i);
  });

  it("rejeita opção indisponível", () => {
    expect(() => validateComboSelection(combo, [{ groupId: "g1", optionIds: ["o3"] }])).toThrow(/indisponível/i);
  });

  it("soma acréscimos ao preço base", () => {
    expect(priceCombo(combo, [{ groupId: "g1", optionIds: ["o1", "o2"] }])).toBe(22.5);
  });

  it("cria snapshot legível e imutável das escolhas", () => {
    expect(buildComboSelectionSnapshot(combo, [{ groupId: "g1", optionIds: ["o2"] }])).toEqual({
      fixedItems: [{ productId: "fixed", productName: "fixed", quantity: 1 }],
      selectedOptions: [{ groupId: "g1", groupName: "Pizzas", optionId: "o2", productId: "p2", productName: "p2", priceDelta: 2.5 }],
    });
  });
});
