import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { HttpError } from "./http";
interface ImagesBinding {
  info(
    stream: ReadableStream<Uint8Array>,
  ): Promise<{ width?: number; height?: number; format?: string }>;
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: Record<string, unknown>): {
      output(
        options: Record<string, unknown>,
      ): Promise<{ response(): Response }>;
    };
  };
}
export async function convertCloudflareImage(buffer: Buffer): Promise<Buffer> {
  const { env } = await getCloudflareContext({ async: true });
  const binding = (env as unknown as { IMAGES?: ImagesBinding }).IMAGES;
  if (!binding)
    throw new HttpError(
      503,
      "Il servizio foto non è ancora disponibile. Puoi inviare il testo senza allegato.",
    );
  const stream = () => new Blob([new Uint8Array(buffer)]).stream();
  const info = await binding.info(stream());
  if (!info.width || !info.height || info.width * info.height > 40_000_000)
    throw new HttpError(
      400,
      "La foto supera 40 megapixel. Riducila prima di inviare.",
    );
  const output = await binding
    .input(stream())
    .transform({ width: 1800, height: 1800, fit: "scale-down", anim: false })
    .output({ format: "image/webp", quality: 84 });
  const response = output.response();
  if (!response.ok)
    throw new HttpError(
      503,
      "Impossibile elaborare la foto in questo momento. Riprova.",
    );
  return Buffer.from(await response.arrayBuffer());
}
