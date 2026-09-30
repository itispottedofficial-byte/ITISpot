import sharp from "sharp";
import convert from "heic-convert";
import decode from "heic-decode";
import "server-only";
export async function convertNodeImage(
  buffer: Buffer,
  heic: boolean,
): Promise<Buffer> {
  if (heic) {
    // Read dimensions before allocating the full RGBA raster in heic-convert.
    const frames = await decode.all({ buffer });
    try {
      if (
        !frames.length ||
        frames.some(
          (f) =>
            !Number.isFinite(f.width * f.height) ||
            f.width < 1 ||
            f.height < 1 ||
            f.width * f.height > 40_000_000,
        )
      )
        throw new Error("HEIC exceeds pixel limit");
    } finally {
      frames.dispose();
    }
    buffer = Buffer.from(
      await convert({ buffer, format: "JPEG", quality: 0.9 }),
    );
  }
  const source = sharp(buffer, {
    limitInputPixels: 40_000_000,
    failOn: "error",
  });
  const meta = await source.metadata();
  if (!["jpeg", "png"].includes(meta.format || ""))
    throw new Error("La foto non è un JPG, PNG o HEIC valido.");
  // Re-encoding drops EXIF, GPS, XMP and original filenames; rotate applies orientation first.
  return source
    .rotate()
    .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer();
}
