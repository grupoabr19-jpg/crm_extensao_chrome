import { beforeAll, describe, expect, it } from "vitest";

let bot: typeof import("../src/server.mjs");

beforeAll(async () => {
  process.env.BOT_TEST_MODE = "true";
  bot = await import("../src/server.mjs");
});

describe("WuzAPI bot conversation logic", () => {
  it("retains city, UF and a normal roof-tile request without turning it into PIR", () => {
    expect(bot.extractFactsSmart("thiago de cambui, quero telha")).toEqual({
      name: "Thiago",
      city: "Cambui",
      uf: "",
      product: "Telha"
    });
    expect(bot.extractFactsSmart("sou de cambui mg")).toMatchObject({ city: "Cambui", uf: "MG" });
    expect(bot.extractFactsSmart("quero telha pir").product).toBe("Telha PIR ABR Telhas");
    expect(bot.extractFactsSmart("preciso de telia")).toMatchObject({ name: "", product: "Telha" });
  });

  it.each([
    "quero conhecer seu portfolio, os produtos que vocês vendem",
    "me de informação do portfoli completo de vocês",
    "quero informações do seu portifolio"
  ])("recognizes portfolio request: %s", (message) => {
    expect(bot.wantsPortfolio(message)).toBe(true);
    expect(bot.wantsHumanSmart(message)).toBe(false);
  });

  it("does not mistake a portfolio purchase sentence for a customer name", () => {
    const message = "quero comprar aço, me fale sobre seu portfolio de produtos";
    expect(bot.extractFactsSmart(message)).toMatchObject({ name: "", product: "Aco" });
    expect(bot.wantsPortfolio(message)).toBe(true);
    expect(bot.wantsHumanSmart(message)).toBe(true);
  });

  it("introduces Abraão and treats quote intent as a seller handoff", () => {
    expect(bot.greetingReply("boa tarde")).toBe("Boa tarde! Sou o Abraão, parceiro de negócios do Grupo ABR. Como posso ajudar?");
    expect(bot.wantsHumanSmart("quero fazer orçamento")).toBe(true);
    expect(bot.wantsHumanSmart("preciso de uma cotação")).toBe(true);
  });

  it("builds a seller preview and a direct CRM case link", () => {
    const summary = bot.handoffSummary({
      name: "Thiago",
      city: "Cambui",
      uf: "MG",
      product: "Telha",
      messages: [
        { from: "customer", text: "quero telhas" },
        { from: "assistant", text: "Em qual cidade?" },
        { from: "customer", text: "Cambui MG" }
      ]
    });
    expect(summary).toContain("Prévia do diálogo:");
    expect(summary).toContain("Cliente: quero telhas");
    expect(summary).toContain("Abraão: Em qual cidade?");
    expect(bot.appendCrmCaseLink("Protocolo: ABR-TEST-0001", "https://crm.example.com/", "case-123"))
      .toContain("Ficha no CRM: https://crm.example.com/crm?case=case-123");
  });

  it("only transfers after an explicit request and requires city, not a specific product", () => {
    expect(bot.isReadyForHandoff({ handoffAt: 0, pendingHandoff: false, city: "Cambui", product: "Telha" }, "")).toBe(false);
    expect(bot.isReadyForHandoff({ handoffAt: 0, pendingHandoff: true, city: "Cambui", product: "" }, "")).toBe(true);
    expect(bot.missingQuestions({ city: "Cambui" })).toEqual([]);
    expect(bot.missingQuestions({ city: "" })).toEqual(["sua cidade"]);
  });

  it("recognizes a real Pietra request without treating ordinary seller mentions as commands", () => {
    expect(bot.wantsHumanSmart("transfere pra pietra")).toBe(true);
    expect(bot.requestedPietra("transfere pra pietra")).toBe(true);
    expect(bot.wantsHumanSmart("o vendedor falou comigo ontem")).toBe(false);
  });
});
