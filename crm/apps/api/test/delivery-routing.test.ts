import { describe, expect, it } from "vitest";
// The API storage module is JavaScript and has no declaration file.
// @ts-expect-error Runtime import covered by this focused test.
import { inferRegion } from "../src/storage.mjs";

describe("delivery routing", () => {
  it("routes Andradas to the Varginha pole", () => {
    expect(inferRegion({ city: "Andradas" })).toBe("VARGINHA");
  });
});
