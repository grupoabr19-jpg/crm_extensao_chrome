import { describe, expect, it } from "vitest";
import { parseImageDataUrl } from "../src/ai-vision.mjs";

describe("image validation for supervised AI vision test", () => {
  it("accepts a correctly encoded PNG", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
    expect(parseImageDataUrl(dataUrl)).toMatchObject({ dataUrl, mimeType: "image/png", size: png.length });
  });

  it("rejects missing images, unsupported formats, and invalid signatures", () => {
    expect(parseImageDataUrl(undefined)).toEqual({ error: "image_required" });
    expect(parseImageDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toEqual({ error: "invalid_image_data_url" });
    expect(parseImageDataUrl("data:image/png;base64,SGVsbG8=")).toEqual({ error: "invalid_image_signature" });
  });

  it("rejects non-canonical base64 and images over 4 MiB", () => {
    expect(parseImageDataUrl("data:image/png;base64,@@")).toEqual({ error: "invalid_image_data_url" });
    const oversized = Buffer.alloc(4 * 1024 * 1024 + 1);
    const dataUrl = `data:image/jpeg;base64,${oversized.toString("base64")}`;
    expect(parseImageDataUrl(dataUrl)).toEqual({ error: "invalid_image_size_or_encoding" });
  });
});
