import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { normalizeCustomerName, parseInactiveCustomers, parseProductionHistory } from "../src/customer-import.mjs";
import { reactivationReminderAt, REACTIVATION_REMINDER_DAYS } from "../src/customer-lifecycle.mjs";

async function workbookBuffer(sheetName: string, headers: string[], records: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.addRow(headers);
  for (const record of records) worksheet.addRow(record);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("importação da base de clientes", () => {
  it("lê os campos do cadastro e ignora duplicatas de código", async () => {
    const buffer = await workbookBuffer("Clientes", [
      "Cód. Cliente", "Nome do Cliente", "Celular", "E-mail", "Cidade", "Estado", "Vendedor"
    ], [
      ["123", "Cliente Teste", "11999990000", "teste@example.invalid", "Jundiaí", "SP", "Vendedora"],
      ["123", "Duplicado", "", "", "", "", ""]
    ]);
    const result = await parseInactiveCustomers(buffer);

    expect(result.customers).toHaveLength(1);
    expect(result.customers[0]).toMatchObject({
      sourceCode: "123",
      normalizedName: "cliente teste",
      phone: "11999990000",
      profile: { city: "Jundiaí", state: "SP", seller: "Vendedora" }
    });
    expect(result.duplicateSourceCodes).toBe(1);
  });

  it("resume histórico por nome normalizado sem reter linhas de venda", async () => {
    const buffer = await workbookBuffer("Produção", [
      "Data Documento Pedido", "Pedido", "Cliente", "Total"
    ], [
      [new Date("2025-01-02T00:00:00Z"), "P1", "JUNDIAI LTDA", 12.5],
      [new Date("2025-02-03T00:00:00Z"), "P1", "Jundiaí Ltda", 7.5],
      [new Date("2025-03-04T00:00:00Z"), "P2", "Jundiaí Ltda", 30]
    ]);
    const result = await parseProductionHistory(buffer);

    expect(normalizeCustomerName(" Jundiaí   Ltda ")).toBe("jundiai ltda");
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]).toMatchObject({
      normalizedName: "jundiai ltda",
      itemCount: 3,
      orderCount: 2,
      totalSales: 50,
      lastPurchaseAt: "2025-03-04T00:00:00.000Z"
    });
    expect(result.summaries[0]).not.toHaveProperty("orders");
  });

  it("calcula o aviso para o 60º dia, 30 dias antes do limite de 90", () => {
    const lastContact = new Date("2025-01-01T12:00:00.000Z");
    const reminder = reactivationReminderAt(lastContact);
    expect(REACTIVATION_REMINDER_DAYS).toBe(60);
    expect(reminder.getTime() - lastContact.getTime()).toBe(60 * 86400000);
  });
});
