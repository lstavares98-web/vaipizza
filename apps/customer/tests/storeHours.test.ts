import assert from "node:assert/strict";
import test from "node:test";
import { formatWeeklyHours } from "../src/lib/storeHours.ts";

const hours = [
  { dayOfWeek: 0, opensAt: "18:00", closesAt: "23:00", isClosed: false },
  { dayOfWeek: 1, opensAt: "18:00", closesAt: "23:00", isClosed: true },
  { dayOfWeek: 5, opensAt: "18:30", closesAt: "00:00", isClosed: false },
];

test("formatWeeklyHours renders Portuguese day labels and time ranges", () => {
  const rows = formatWeeklyHours(hours);
  assert.deepEqual(rows[0], { dayOfWeek: 0, day: "Domingo", label: "18:00 – 23:00", isClosed: false });
  assert.deepEqual(rows[5], { dayOfWeek: 5, day: "Sexta-feira", label: "18:30 – 00:00", isClosed: false });
});

test("formatWeeklyHours labels configured closed days and missing days as unavailable", () => {
  const rows = formatWeeklyHours(hours);
  assert.equal(rows[1].label, "Fechado");
  assert.equal(rows[1].isClosed, true);
  assert.equal(rows[2].label, "Horário a confirmar");
  assert.equal(rows[2].isClosed, true);
});
