import sharp, { type Metadata, type Sharp } from "sharp";
import {
  FACE_IMAGE_MAX_BYTES,
  FACE_IMAGE_MAX_DIMENSION
} from "@/lib/face-analysis/config";

const MIME_BY_FORMAT: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

export type NormalizedFaceImage = {
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  fileSize: number;
  blurScore: number;
  brightnessScore: number;
};

export async function normalizeAndInspectFaceImage(input: ArrayBuffer): Promise<NormalizedFaceImage> {
  if (input.byteLength < 1 || input.byteLength > FACE_IMAGE_MAX_BYTES) {
    throw new FaceImageError("FILE_TOO_LARGE", "照片大小必須在 10 MB 以內");
  }

  const source = Buffer.from(input);
  let metadata: Metadata;
  try {
    metadata = await sharp(source, { failOn: "error", limitInputPixels: maxInputPixels() }).metadata();
  } catch {
    throw new FaceImageError("UNSUPPORTED_IMAGE", "無法解碼照片，請改用 JPEG、PNG 或 WebP");
  }

  const mimeType = metadata.format ? MIME_BY_FORMAT[metadata.format] : undefined;
  if (!mimeType || !metadata.width || !metadata.height) {
    throw new FaceImageError("UNSUPPORTED_IMAGE", "僅支援 JPEG、PNG 或 WebP 照片");
  }

  const orientedWidth = swapsAxes(metadata.orientation) ? metadata.height : metadata.width;
  const orientedHeight = swapsAxes(metadata.orientation) ? metadata.width : metadata.height;
  if (orientedWidth > FACE_IMAGE_MAX_DIMENSION || orientedHeight > FACE_IMAGE_MAX_DIMENSION) {
    throw new FaceImageError("UNSUPPORTED_IMAGE", "照片最長邊不可超過 4096 像素");
  }

  // rotate() 套用 EXIF orientation；重新編碼時不帶 metadata，避免保存定位或裝置資訊。
  const normalizedPipeline = sharp(source, { failOn: "error", limitInputPixels: maxInputPixels() }).rotate();
  const normalized = await encodeWithoutMetadata(normalizedPipeline, mimeType);
  if (normalized.length > FACE_IMAGE_MAX_BYTES) {
    throw new FaceImageError("FILE_TOO_LARGE", "處理後的照片超過 10 MB");
  }

  const metrics = await measureImageQuality(normalized);
  return {
    bytes: normalized,
    mimeType,
    width: orientedWidth,
    height: orientedHeight,
    fileSize: normalized.length,
    ...metrics
  };
}

async function encodeWithoutMetadata(image: Sharp, mimeType: NormalizedFaceImage["mimeType"]) {
  if (mimeType === "image/png") return image.png({ compressionLevel: 9 }).toBuffer();
  if (mimeType === "image/webp") return image.webp({ quality: 90 }).toBuffer();
  return image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

async function measureImageQuality(bytes: Buffer) {
  const sample = sharp(bytes).resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true });
  const { data, info } = await sample.greyscale().raw().toBuffer({ resolveWithObject: true });
  if (data.length === 0 || info.width < 2 || info.height < 2) {
    throw new FaceImageError("UNSUPPORTED_IMAGE", "照片尺寸不足");
  }

  let brightnessTotal = 0;
  for (const value of data) brightnessTotal += value;
  const brightnessScore = clamp(brightnessTotal / data.length / 255);

  // 以灰階 Laplacian variance 估算畫面細節；只作拍攝品質，不作面相或人格推論。
  const laplacians: number[] = [];
  for (let y = 1; y < info.height - 1; y += 1) {
    for (let x = 1; x < info.width - 1; x += 1) {
      const index = y * info.width + x;
      laplacians.push(
        4 * data[index] - data[index - 1] - data[index + 1] - data[index - info.width] - data[index + info.width]
      );
    }
  }
  const mean = laplacians.reduce((sum, value) => sum + value, 0) / Math.max(1, laplacians.length);
  const variance = laplacians.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, laplacians.length);
  const blurScore = clamp(variance / 500);

  return { blurScore, brightnessScore };
}

function maxInputPixels() {
  return FACE_IMAGE_MAX_DIMENSION * FACE_IMAGE_MAX_DIMENSION;
}

function swapsAxes(orientation?: number) {
  return orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

export class FaceImageError extends Error {
  constructor(
    public readonly code: "UNSUPPORTED_IMAGE" | "FILE_TOO_LARGE",
    message: string
  ) {
    super(message);
    this.name = "FaceImageError";
  }
}
