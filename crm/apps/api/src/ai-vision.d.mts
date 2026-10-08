export type ImageDataUrlResult =
  | { dataUrl: string; mimeType: string; size: number }
  | { error: string };

export function parseImageDataUrl(value: unknown): ImageDataUrlResult;
