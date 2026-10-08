import { describe, it, expect } from "vitest";
import { AdapterCapabilitiesSchema } from "@abr/contracts";
import { nullAdapter } from "../src/adapter/null-adapter";
import { SELECTOR_REGISTRY } from "../src/adapter/selectors";
import manifest from "../manifest.json";

describe("extensão (esqueleto honesto)", () => {
  it("sem seletores verificados, nenhuma capacidade é anunciada e envio é recusado", async () => {
    const c = AdapterCapabilitiesSchema.parse(nullAdapter.capabilities());
    expect(Object.entries(c).filter(([k, v]) => k.startsWith("can_") && v)).toEqual([]);
    expect(c.selectors_verified_against_real_session).toBe(false);
    expect(Object.keys(SELECTOR_REGISTRY.selectors)).toHaveLength(0);
    expect(await nullAdapter.send("ctx")).toMatchObject({ status: "refused" });
  });
  it("manifest: só WhatsApp Web + domínio do backend; sem permissões amplas", () => {
    expect(manifest.host_permissions).toHaveLength(2);
    expect(manifest.host_permissions[0]).toBe("https://web.whatsapp.com/*");
    for (const bad of ["cookies", "debugger", "webRequest", "<all_urls>", "tabs"]) expect(manifest.permissions).not.toContain(bad);
  });
});
