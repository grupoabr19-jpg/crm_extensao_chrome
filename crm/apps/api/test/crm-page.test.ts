import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../public/crm.html", import.meta.url), "utf8");

describe("CRM web page", () => {
  it("contains valid JavaScript in its inline scripts", () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [index, match] of scripts.entries()) {
      const source = match[1];
      expect(source).toBeDefined();
      if (source !== undefined) {
        expect(() => new vm.Script(source, { filename: `crm-inline-${index}.js` })).not.toThrow();
      }
    }
  });
});
