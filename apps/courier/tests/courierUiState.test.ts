import assert from "node:assert/strict";
import test from "node:test";
import { getCourierUiState } from "../src/lib/courierUiState.ts";

test("getCourierUiState keeps login separate from work availability", () => {
  assert.deepEqual(getCourierUiState("ACTIVE", "OFFLINE"), {
    online: false,
    canToggleAvailability: true,
    title: "Offline",
    description: "Fique online quando estiver pronto para começar.",
  });
});

test("getCourierUiState blocks work controls for a suspended courier", () => {
  assert.deepEqual(getCourierUiState("SUSPENDED", "OFFLINE"), {
    online: false,
    canToggleAvailability: false,
    title: "Suspenso",
    description: "A sua conta está temporariamente suspensa. Não pode receber novas entregas.",
  });
});

test("getCourierUiState preserves active delivery state without offering an offline toggle", () => {
  assert.deepEqual(getCourierUiState("ACTIVE", "DELIVERING"), {
    online: true,
    canToggleAvailability: false,
    title: "Online",
    description: "Está ligado à operação de entregas.",
  });
});
