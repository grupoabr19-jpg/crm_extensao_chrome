import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const panelSource = readFileSync(new URL("../../../../extension/panel.js", import.meta.url), "utf8");
const probeSource = readFileSync(new URL("../../../../extension/probe.js", import.meta.url), "utf8");

function makeWindow() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div id="app">
      <div id="pane-side"></div>
      <div id="main">
        <header><span title="Cliente Teste">Cliente Teste</span></header>
        <div>
          <div data-id="false_5512983205605@c.us_ABCDEF1234567890"></div>
        </div>
      </div>
    </div>
  </body></html>`, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://web.whatsapp.com/" });
  const win = dom.window as any;
  win.chrome = {
    runtime: { getURL: (path: string) => `chrome-extension://abr/${path}` },
    storage: { local: { get: (_key: string, cb: (record: unknown) => void) => cb({}), set: (_record: unknown, cb?: () => void) => cb?.(), remove: (_key: string, cb?: () => void) => cb?.() } }
  };
  win.navigator.clipboard = { writeText: () => Promise.resolve() };
  win.eval(probeSource);
  return win;
}

describe("CRM WhatsApp extension panel", () => {
  it("loads without referencing removed activeCase control", () => {
    expect(panelSource).not.toContain("$('activeCase')");
    const win = makeWindow();
    expect(() => win.eval(panelSource)).not.toThrow();
    const host = win.document.querySelector("#abr-crm-host") as HTMLElement;
    expect(host).toBeTruthy();
    expect(host.shadowRoot?.querySelector("#launcher")).toBeTruthy();
    expect(host.shadowRoot?.querySelector(".rail")).toBeNull();
    expect(host.shadowRoot?.querySelector("#drawer")?.classList.contains("open")).toBe(false);
  });
});
