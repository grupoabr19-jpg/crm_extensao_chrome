import { describe, it, expect } from "vitest";
import { normalizePhone, buildHandoffLink, buildHandoffMessage, generateProtocol, extractProtocol } from "@abr/domain";
import { randomBytes } from "node:crypto";

describe("telefone", () => {
  it("normaliza para E.164 preservando original/origem", () => {
    const r = normalizePhone("(11) 99999-1234", "whatsapp_ui");
    expect(r).toEqual({ ok: true, e164: "+5511999991234", original: "(11) 99999-1234", source: "whatsapp_ui" });
  });
  it("não insere nem remove o nono dígito", () => {
    expect(normalizePhone("11 8888-1234", "x")).toMatchObject({ ok: true, e164: "+551188881234" });
    expect(normalizePhone("+55 11 98888-1234", "x")).toMatchObject({ e164: "+5511988881234" });
  });
  it("DDD 55 nacional não é confundido com código do país", () => {
    expect(normalizePhone("55 99999-1234", "x")).toMatchObject({ ok: true, e164: "+555599999" + "1234" });
  });
  it("recusa comprimento ambíguo e BR inválido", () => {
    expect(normalizePhone("12345", "x")).toMatchObject({ ok: false, reason: "ambiguous_length" });
    expect(normalizePhone("+55 01 99999-1234", "x")).toMatchObject({ ok: false, reason: "invalid_br" });
  });
});

describe("link de encaminhamento (caso 10/11 parte)", () => {
  it("usa wa.me com dígitos, texto = saudação + protocolo, encodeURIComponent", () => {
    const p = generateProtocol((n) => randomBytes(n));
    const url = buildHandoffLink("+5511999991234", p);
    expect(url.startsWith("https://wa.me/5511999991234?text=")).toBe(true);
    const text = decodeURIComponent(url.split("?text=")[1]!);
    expect(text).toContain(p);
    expect(text).not.toMatch(/\d{3}\.\d{3}|CPF|CNPJ/i);
    expect(extractProtocol(text)).toBe(p);
  });
  it("rejeita destino fora do padrão E.164", () => {
    expect(() => buildHandoffLink("11999991234", "ABR-0000-0000")).toThrow();
    expect(() => buildHandoffLink("+5511999991234", "qualquer")).toThrow();
  });
  it("protocolos não são sequenciais", () => {
    const s = new Set(Array.from({ length: 500 }, () => generateProtocol((n) => randomBytes(n))));
    expect(s.size).toBe(500);
  });
  it("template omite personalização sem nome e segue o texto aprovado", () => {
    const base = { responsibleName: "Maria", department: "Comercial", link: "https://wa.me/1", protocol: "ABR-0000-0000" };
    expect(buildHandoffMessage({ ...base, firstName: "João" })).toBe(
      "Obrigado, João. Registrei sua solicitação. Para continuar, fale com Maria, do Comercial: https://wa.me/1. Clique no link e envie a mensagem que aparecer. Protocolo: ABR-0000-0000.");
    expect(buildHandoffMessage({ ...base })).toMatch(/^Obrigado\. Registrei/);
    expect(buildHandoffMessage({ ...base, variant: "after_hours" })).not.toMatch(/imediat|em minutos/i);
  });
});
