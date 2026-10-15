import { describe, expect, it } from "vitest";
import { handoffLink, personalizedCustomerMessage } from "../src/handoff-link.mjs";

describe("mensagem personalizada de transferencia", () => {
  it("inclui primeiro nome do cliente, nome do vendedor e protocolo sem presumir genero", () => {
    const message = personalizedCustomerMessage({
      customerName: "Thiago Almeida",
      responsibleName: "Pietra Leite",
      publicProtocol: "ABR-NJY9-QFWZ"
    });

    expect(message).toBe(
      "Olá, Thiago! Aqui é Pietra Leite, do Grupo ABR. Recebi seu atendimento pelo protocolo ABR-NJY9-QFWZ."
    );
  });

  it("coloca a mensagem personalizada no link direto do WhatsApp", () => {
    const link = handoffLink("+5512983205605", "ABR-TEST-0001", {
      customerName: "Ana Souza",
      responsibleName: "Juliano Pereira"
    });
    const url = new URL(link);

    expect(url.pathname).toBe("/5512983205605");
    expect(url.searchParams.get("text")).toBe(
      "Olá, Ana! Aqui é Juliano Pereira, do Grupo ABR. Recebi seu atendimento pelo protocolo ABR-TEST-0001."
    );
  });

  it("mantem uma frase natural quando algum nome estiver ausente", () => {
    expect(personalizedCustomerMessage({ publicProtocol: "ABR-TEST-0002" }))
      .toBe("Olá! Falo em nome do Grupo ABR. Recebi seu atendimento pelo protocolo ABR-TEST-0002.");
  });
});
