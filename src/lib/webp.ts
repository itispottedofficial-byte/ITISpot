// Rebuild RIFF/WebP without EXIF, XMP or ICC metadata. Reject truncated/unknown chunks.
export function stripWebpMetadata(input: Buffer): Buffer {
  if (
    input.length < 12 ||
    input.toString("ascii", 0, 4) !== "RIFF" ||
    input.toString("ascii", 8, 12) !== "WEBP" ||
    input.readUInt32LE(4) + 8 !== input.length
  )
    throw new Error("Invalid WebP");
  const chunks: Buffer[] = [];
  let pixels = false;
  for (let offset = 12; offset < input.length;) {
    if (offset + 8 > input.length) throw new Error("Truncated WebP");
    const kind = input.toString("ascii", offset, offset + 4),
      size = input.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (end > input.length) throw new Error("Truncated WebP");
    if (["VP8 ", "VP8L", "VP8X", "ALPH"].includes(kind)) {
      const chunk = Buffer.from(input.subarray(offset, end));
      if (kind === "VP8X") {
        if (size !== 10) throw new Error("Invalid WebP header");
        chunk[8] &= ~(0x20 | 0x08 | 0x04);
      }
      if (kind === "VP8 " || kind === "VP8L") pixels = true;
      chunks.push(chunk);
    } else if (!["EXIF", "XMP ", "ICCP"].includes(kind))
      throw new Error("Unsupported WebP chunk");
    offset = end;
  }
  if (!pixels) throw new Error("Missing WebP image");
  const body = Buffer.concat([Buffer.from("WEBP"), ...chunks]);
  const header = Buffer.alloc(8);
  header.write("RIFF");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
