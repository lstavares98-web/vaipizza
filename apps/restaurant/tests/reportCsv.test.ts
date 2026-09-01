import { describe, expect, it } from "vitest";
import { buildReportCsv } from "../src/lib/reportCsv";

const report = {
  ordersTotal: 10,
  ordersDelivered: 8,
  ordersCancelled: 2,
  revenue: 123.45,
  avgTicket: 15.43,
  topProducts: [{ name: 'Pizza "Casa", Grande', count: 4 }],
  topModifiersByGroup: [{ groupName: "Tamanho", options: [{ name: "Grande", count: 3 }] }],
};

describe("buildReportCsv", () => {
  it("gera cabeçalhos PT-PT, período e escapa aspas/vírgulas", () => {
    const csv = buildReportCsv(report, { from: "2026-08-01", to: "2026-08-31" });
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(csv).toContain("Período;2026-08-01;2026-08-31");
    expect(csv).toContain('"Pizza ""Casa"", Grande";4');
    expect(csv).toContain("Receita;123,45 €");
  });
});
