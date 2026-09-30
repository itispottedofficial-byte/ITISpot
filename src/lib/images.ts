import "server-only";
import { fileError, MAX_IMAGE_BYTES } from "./validation";
import { HttpError } from "./http";
import { stripWebpMetadata } from "./webp";
export function imageFormat(buffer: Buffer): "jpeg" | "png" | "heic" | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return "jpeg";
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (
    buffer.toString("ascii", 4, 8) === "ftyp" &&
    /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(buffer.toString("ascii", 8, 12))
  )
    return "heic";
  return null;
}
export async function sanitizeImage(file: File): Promise<Buffer> {
  const issue = fileError(file);
  if (issue) throw new HttpError(400, issue);
  const buffer = Buffer.from(await file.arrayBuffer());
  const format = imageFormat(buffer);
  if (!format)
    throw new HttpError(
      400,
      "Il contenuto del file non è una foto JPG, PNG o HEIC valida.",
    );
  try {
    const converted =
      process.env.ITISPOT_RUNTIME === "cloudflare"
        ? await (
            await import("./images.cloudflare")
          ).convertCloudflareImage(buffer)
        : await (
            await import("./images.node")
          ).convertNodeImage(buffer, format === "heic");
    const clean = stripWebpMetadata(converted);
    if (clean.length > MAX_IMAGE_BYTES)
      throw new HttpError(
        400,
        "La foto elaborata è troppo grande. Scegli un’immagine più piccola.",
      );
    return clean;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      400,
      "Impossibile leggere la foto. Usa un JPG, PNG o HEIC valido, fino a 40 megapixel.",
    );
  }
}
