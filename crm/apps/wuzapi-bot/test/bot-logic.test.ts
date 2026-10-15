import { beforeAll, describe, expect, it } from "vitest";

let bot: typeof import("../src/server.mjs");

beforeAll(async () => {
  process.env.BOT_TEST_MODE = "true";
  bot = await import("../src/server.mjs");
});

describe("WuzAPI bot conversation logic", () => {
  it("adds a bounded human-like delay based on reply length", () => {
    const options = { minimum: 1800, maximum: 5000, perCharacter: 20, jitter: 700 };
    expect(bot.calculateReplyDelayMs("Oi!", 0, options)).toBe(1800);
    expect(bot.calculateReplyDelayMs("a".repeat(100), 0.5, options)).toBe(2350);
    expect(bot.calculateReplyDelayMs("a".repeat(400), 1, options)).toBe(5000);
  });

  it("retains city, UF and a normal roof-tile request without turning it into PIR", () => {
    expect(bot.extractFactsSmart("thiago de cambui, quero telha")).toEqual({
      name: "Thiago",
      city: "Cambui",
      uf: "",
      product: "Telha"
    });
    expect(bot.extractFactsSmart("sou de cambui mg")).toMatchObject({ city: "", uf: "" });
    expect(bot.extractFactsSmart("quero telha pir").product).toBe("Telha PIR ABR Telhas");
    expect(bot.extractFactsSmart("preciso de telia")).toMatchObject({ name: "", product: "Telha" });
  });

  it("confirms the delivery city instead of routing by the customer's residence", () => {
    const location = bot.analyzeDeliveryLocation("eu moro em São Paulo mas estou construindo em Andradas");
    expect(location).toEqual({
      city: "",
      uf: "",
      cities: ["Sao Paulo", "Andradas"],
      requiresConfirmation: true
    });
    expect(bot.extractFactsSmart("eu moro em São Paulo mas estou construindo em Andradas"))
      .toMatchObject({ city: "", uf: "" });
    expect(bot.extractExpectedDeliveryCity("São José do Rio Pardo, SP")).toBe("São José Do Rio Pardo");
    expect(bot.purchaseInterestReply({ name: "Thiago", locationAmbiguous: true }))
      .toContain("entrega seja feita");
  });

  it("uses retail only for South Minas delivery locations", () => {
    expect(bot.inferDeliveryPipeline({ city: "Andradas", uf: "MG" })).toBe("VAREJO");
    expect(bot.inferDeliveryPipeline({ city: "Sao Paulo", uf: "SP" })).toBe("ATACADO");
    expect(bot.inferDeliveryPipeline({ city: "Belo Horizonte", uf: "MG" })).toBe("ATACADO");
    expect(bot.inferDeliveryPipeline({ city: "Três Corações", uf: "MG" })).toBe("VAREJO");
    expect(bot.inferDeliveryPipeline({ city: "Curitiba", uf: "PR" })).toBe("ATACADO");
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
    expect(bot.wantsHumanSmart(message)).toBe(false);
  });

  it("does not infer Jundiai from bom dia or treat cobertura as the customer name", () => {
    expect(bot.extractFactsSmart("oi, bom dia\neu quero comprar telha\ncobertura")).toEqual({
      name: "",
      city: "",
      uf: "",
      product: "Telha"
    });
  });

  it("introduces Abraão warmly and distinguishes purchase from handoff intent", () => {
    expect(bot.greetingReply("oi boa tarde")).toBe("Boa tarde! Sou o Abraão, parceiro de negócios do Grupo ABR. Que bom falar com você. Como posso ajudar?");
    expect(bot.wantsHumanSmart("quero comprar aço")).toBe(false);
    expect(bot.wantsHumanSmart("quero fazer orçamento")).toBe(false);
    expect(bot.wantsHumanSmart("preciso de uma cotação")).toBe(false);
    expect(bot.wantsQuote("quero fazer orçamento")).toBe(true);
    expect(bot.wantsQuote("quanto custa a telha?")).toBe(true);
    expect(bot.wantsPurchase("quero comprar aço")).toBe(true);
    expect(bot.purchaseInterestReply({ product: "Aco" })).toContain("como posso te chamar");
    expect(bot.purchaseInterestReply({ name: "Thiago", product: "Aco" })).toContain("cidade e UF");
    expect(bot.purchaseInterestReply({ name: "Thiago", city: "Cambui", uf: "MG", product: "Aco" }))
      .toContain("interesse em aço");
  });

  it("never sends literary dashes in customer dialogue", () => {
    expect(bot.conversationalPunctuation("Entendi — posso ajudar. Material – cidade?"))
      .toBe("Entendi; posso ajudar. Material; cidade?");
  });

  it("requires qualification before every handoff, including an explicit request", () => {
    const messages = [
      { from: "customer", text: "quero orçamento de telhas" },
      { from: "customer", text: "é para a cobertura de um galpão" }
    ];
    expect(bot.hasQualificationDetail({ messages })).toBe(true);
    expect(bot.hasQualificationDetail({ messages: [{ from: "customer", text: "quero comprar telhas" }] })).toBe(false);
    expect(bot.commercialQualificationReply({ name: "Thiago", product: "Telha", city: "Cambui", uf: "MG" }))
      .toContain("aplicação, medida ou quantidade aproximada");
    expect(bot.wantsHumanSmart("transfere pra Pietra")).toBe(true);
  });

  it("blocks commercial promises while allowing consultative qualification", () => {
    const conversation = { name: "Thiago", product: "Aco", city: "Cambui", uf: "MG" };
    expect(bot.enforceCommercialBoundaries("Posso preparar um orçamento para você.", conversation))
      .toContain("aplicação, medida ou quantidade aproximada");
    expect(bot.enforceCommercialBoundaries("Temos esse material em estoque para entrega amanhã.", conversation))
      .toContain("aplicação, medida ou quantidade aproximada");
    expect(bot.enforceCommercialBoundaries("Para qual aplicação você precisa do aço?", conversation))
      .toBe("Para qual aplicação você precisa do aço?");
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
    expect(summary).toContain("Cidade de entrega: Cambui.");
    expect(summary).toContain("Prévia do diálogo:");
    expect(summary).toContain("Cliente: quero telhas");
    expect(summary).toContain("Abraão: Em qual cidade?");
    expect(bot.appendCrmCaseLink("Protocolo: ABR-TEST-0001", "https://crm.example.com/", "case-123"))
      .toContain("Ficha no CRM: https://crm.example.com/crm?case=case-123");
  });

  it("transfers only after name, city, UF, product and a useful detail", () => {
    const qualified = {
      handoffAt: 0,
      pendingHandoff: true,
      name: "Thiago",
      city: "Cambui",
      uf: "MG",
      product: "Telha",
      messages: [{ from: "customer", text: "é para cobertura" }]
    };
    expect(bot.isReadyForHandoff({ ...qualified, pendingHandoff: false }, "")).toBe(false);
    expect(bot.isReadyForHandoff(qualified, "")).toBe(true);
    expect(bot.isReadyForHandoff({ ...qualified, name: "" }, "")).toBe(false);
    expect(bot.isReadyForHandoff({ ...qualified, city: "" }, "")).toBe(false);
    expect(bot.isReadyForHandoff({ ...qualified, uf: "" }, "")).toBe(false);
    expect(bot.isReadyForHandoff({ ...qualified, product: "" }, "")).toBe(false);
    expect(bot.missingQuestions({ name: "" })).toEqual(["seu nome"]);
    expect(bot.missingQuestions({ name: "Thiago", city: "" })).toEqual(["sua cidade"]);
    expect(bot.missingQuestions({ name: "Thiago", city: "Cambui", uf: "" })).toEqual(["a UF"]);
  });

  it("recognizes a real Pietra request without treating ordinary seller mentions as commands", () => {
    expect(bot.wantsHumanSmart("transfere pra pietra")).toBe(true);
    expect(bot.requestedPietra("transfere pra pietra")).toBe(true);
    expect(bot.wantsHumanSmart("o vendedor falou comigo ontem")).toBe(false);
  });

  it("resolves any registered operator requested by name", () => {
    const sellers = [
      { user_id: "u1", name: "Pietra Leite", whatsapp_e164: "+5535998138542" },
      { user_id: "u2", name: "Juliano Pereira", whatsapp_e164: "+553599055943" },
      { user_id: "u3", name: "Julio Melo", whatsapp_e164: "+553597707975" },
      { user_id: "u4", name: "Marcelo Silva", whatsapp_e164: null }
    ];

    expect(bot.resolveNamedOperator("transfere para Juliano Pereira", sellers)).toEqual({
      name: "Juliano Pereira",
      phone: "553599055943",
      userId: "u2"
    });
    expect(bot.resolveNamedOperator("pode passar para o Julio?", sellers)?.name).toBe("Julio Melo");
    expect(bot.resolveNamedOperator("quero falar com Marcelo", sellers)).toBeNull();
    expect(bot.resolveNamedOperator("Juliano atende essa regiao", sellers)).toBeNull();
  });
});
