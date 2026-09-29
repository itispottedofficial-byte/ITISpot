import sharp from 'sharp';
import convert from 'heic-convert';
import { fileError } from './validation';
export async function sanitizeImage(file: File): Promise<Buffer> {
  const issue = fileError(file); if(issue) throw new Error(issue);
  let buffer = Buffer.from(await file.arrayBuffer());
  const heic = buffer.toString('ascii',4,8)==='ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(buffer.toString('ascii',8,12));
  if (heic) buffer = Buffer.from(await convert({buffer, format:'JPEG',quality:0.9}));
  const source = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
  const meta = await source.metadata();
  if (!['jpeg','png'].includes(meta.format || '')) throw new Error('La foto non è un JPG, PNG o HEIC valido.');
  // Re-encoding drops EXIF, GPS, XMP and original filenames; rotate applies orientation first.
  return source.rotate().resize(1800,1800,{fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer();
}
