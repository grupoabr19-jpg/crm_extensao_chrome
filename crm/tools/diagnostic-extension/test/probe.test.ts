import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

// FIXTURE INVENTADA por nós — prova a lógica do diagnóstico, NÃO a estrutura real do WhatsApp Web.
const HTML = `<html lang="pt-BR"><body><div id="app"><div id="pane-side" role="grid"></div>
<div id="main"><header><div><span title="Cliente Fulano de Tal">Cliente Fulano de Tal</span><span>visto por último hoje às 10:15</span></div></header>
<div>
 <div data-id="false_5511999990001@c.us_3EB0A1B2C3D4E5F6A7B8"><div class="message-in"><span data-pre-plain-text="[10:15, 08/10/2026] Cliente Fulano: "><span>Olá, preciso de orçamento secreto</span></span></div></div>
 <div data-id="true_5511999990001@c.us_3EB0FFEEDDCCBBAA9988"><div class="message-out"><span><span>Resposta interna</span></span><span data-icon="msg-dblcheck"></span></div></div>
</div>
<footer><div contenteditable="true" role="textbox" data-tab="10" aria-label="Digite uma mensagem"></div><button aria-label="Enviar"><span data-icon="send"></span></button></footer>
</div></div></body></html>`;
const SRC = readFileSync(new URL("../probe.js", import.meta.url), "utf8");
const mk = () => { const d = new JSDOM(HTML, { runScripts: "outside-only", pretendToBeVisual: true }); d.window.eval(SRC); return d.window as any; };

describe("probe de diagnóstico (fixture)", () => {
  it("encontra compositor, botão de envio, linhas, direção e ícones", () => {
    const w = mk(); const s = w.ABRProbe.snapshot(w.document, "2-individual");
    const c = (g: string, q: string) => s.candidates.find((x: any) => x.group === g && x.query === q);
    expect(c("composer", "footer [contenteditable=\"true\"]").count).toBe(1);
    expect(c("send_button", "footer [data-icon=\"send\"]").count).toBe(1);
    expect(s.composer).toMatchObject({ found: true, is_empty: true, text_length: 0 });
    expect(s.messages).toMatchObject({ scanned: 2, by_direction: { in: 1, out: 1, unknown: 0 }, with_pre_plain_text: 1, class_hint: { message_in: 1, message_out: 1 } });
    expect(s.icons_in_main).toEqual(expect.arrayContaining(["send", "msg-dblcheck"]));
    expect(s.messages.id_shapes["false_<digits:13>@c.us_<hex:20>"]).toBe(1);
  });
  it("PRIVACIDADE: nada de texto, nome, telefone ou id real no relatório", () => {
    const w = mk(); const raw = JSON.stringify(w.ABRProbe.snapshot(w.document, "x"));
    for (const leak of ["Fulano", "orçamento", "secreto", "5511999990001", "3EB0A1B2", "Resposta interna", "visto por último"]) expect(raw).not.toContain(leak);
  });
  it("lê rascunho como TAMANHO apenas (nunca o texto)", () => {
    const w = mk(); const ce = w.document.querySelector("[contenteditable]"); ce.textContent = "segredo123"; ce.focus();
    const s = w.ABRProbe.snapshot(w.document, "4");
    expect(s.composer).toMatchObject({ is_empty: false, text_length: 10, focused: true });
    expect(JSON.stringify(s)).not.toContain("segredo123");
  });
  it("observação detecta linha nova, repetição e substituição de #main, sem guardar texto", async () => {
    const w = mk(); const p = w.ABRProbe.observe(w.document, 250);
    const add = (id: string) => { const e = w.document.createElement("div"); e.setAttribute("data-id", id); e.textContent = "texto novo sigiloso"; w.document.querySelector("#main > div").appendChild(e); };
    add("false_5511999990001@c.us_AAAA1111BBBB2222CCCC"); await new Promise((r) => setTimeout(r, 20));
    w.document.querySelector("#main > div").lastChild.remove(); add("false_5511999990001@c.us_AAAA1111BBBB2222CCCC");
    await new Promise((r) => setTimeout(r, 20));
    const old = w.document.querySelector("#main"); const nu = old.cloneNode(true); old.replaceWith(nu);
    const o = await p;
    expect(o.rows_added).toBeGreaterThanOrEqual(2); expect(o.repeats).toBe(2); /* 1 re-adição + 1 pela remontagem do #main */ expect(o.main_replaced_times).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(o)).not.toMatch(/sigiloso|5511999990001/);
  });
  it("manifest: sem rede, só WhatsApp Web + storage", () => {
    const m = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
    expect(m.host_permissions).toEqual(["https://web.whatsapp.com/*"]); expect(m.permissions).toEqual(["storage"]); expect(m.background).toBeUndefined();
    expect(readFileSync(new URL("../probe.js", import.meta.url), "utf8") + readFileSync(new URL("../panel.js", import.meta.url), "utf8")).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|localStorage|\.click\(\)\s*;?\s*\/\/send/);
  });
});
