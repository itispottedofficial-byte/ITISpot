import { z } from 'zod';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const submissionSchema = z.object({
  text: z.string().trim().min(1, 'Scrivi qualcosa prima di inviare.').max(500, 'Il messaggio può contenere al massimo 500 caratteri.'),
  consent: z.literal('true', { error: 'Leggi e accetta le regole.' }),
  website: z.string().max(0, 'Invio non valido.'),
});
export const actionSchema = z.object({ action: z.enum(['approve','reject','archive','restore','delete']) });
export const idSchema = z.uuid();
export function fileError(file: Pick<File, 'name'|'size'|'type'>): string | null {
  if (file.size > MAX_IMAGE_BYTES) return 'La foto supera 10 MB. Scegli un file più leggero.';
  if (!file.size) return 'Il file è vuoto.';
  if (!/\.(jpe?g|png|heic|heif)$/i.test(file.name)) return 'Scegli una foto JPG, PNG o HEIC.';
  if (file.type && !['image/jpeg','image/png','image/heic','image/heif'].includes(file.type)) return 'Formato non supportato. Usa JPG, PNG o HEIC.';
  return null;
}
