const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const IMAGE_SIGNATURES = {
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff])
};

export function parseImageDataUrl(value) {
  if (typeof value !== "string") return { error: "image_required" };
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return { error: "invalid_image_data_url" };

  const [, mimeType, encoded] = match;
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== encoded) {
    return { error: "invalid_image_size_or_encoding" };
  }

  if (mimeType === "image/webp") {
    if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
      return { error: "invalid_image_signature" };
    }
  } else {
    const signature = IMAGE_SIGNATURES[mimeType];
    if (bytes.length < signature.length || !bytes.subarray(0, signature.length).equals(signature)) {
      return { error: "invalid_image_signature" };
    }
  }

  return { dataUrl: value, mimeType, size: bytes.length };
}
