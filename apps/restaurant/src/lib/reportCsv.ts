export interface ReportCsvData {
  ordersTotal: number;
  ordersDelivered: number;
  ordersCancelled: number;
  revenue: number;
  avgTicket: number;
  topProducts: { name: string; count: number }[];
  topModifiersByGroup: { groupName: string; options: { name: string; count: number }[] }[];
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function money(value: number) {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

export function buildReportCsv(report: ReportCsvData, range: { from: string; to: string }) {
  const rows: Array<Array<string | number>> = [
    ["Relatório VAIPIZZA"],
    ["Período", range.from, range.to],
    [],
    ["Resumo", "Valor"],
    ["Pedidos no período", report.ordersTotal],
    ["Pedidos entregues/recolhidos", report.ordersDelivered],
    ["Pedidos cancelados", report.ordersCancelled],
    ["Receita", money(report.revenue)],
    ["Ticket médio", money(report.avgTicket)],
    [],
    ["Produtos mais vendidos", "Quantidade"],
    ...report.topProducts.map((product) => [product.name, product.count]),
  ];

  for (const group of report.topModifiersByGroup) {
    rows.push([], [`${group.groupName} mais escolhidos`, "Quantidade"]);
    rows.push(...group.options.map((option) => [option.name, option.count]));
  }

  return `\ufeff${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}
