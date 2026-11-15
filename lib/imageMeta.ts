// Photos for Google: the size of a JPEG / PNG read from its own header, and
// its metadata removed (EXIF incl. GPS location, XMP, comments, PNG text
// chunks) — on the server, as a safety net after the browser already
// re-encoded the photo (components/gbp/PhotoUpload.tsx). Pure, bytes only.

export type ImageType = "jpeg" | "png";

export function imageTypeOf(b: Uint8Array): ImageType | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  return null;
}

/** Width × height from the header (JPEG: the first SOF marker; PNG: IHDR). */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const type = imageTypeOf(b);
  if (type === "png") {
    if (b.length < 24) return null;
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (type !== "jpeg") return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

/** The JPEG without APP1–APP15 (EXIF, GPS, XMP, ICC kept out too) and
 * comments; APP0 (JFIF) and the image data are kept as they are. */
function stripJpeg(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1];
    // Start of scan: the rest is image data.
    if (marker === 0xda) {
      out.push(b.subarray(i));
      i = b.length;
      break;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    const seg = b.subarray(i, i + 2 + len);
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) out.push(seg);
    i += 2 + len;
  }
  if (i < b.length) out.push(b.subarray(i));
  const total = out.reduce((n, p) => n + p.length, 0);
  const r = new Uint8Array(total);
  let o = 0;
  for (const p of out) {
    r.set(p, o);
    o += p.length;
  }
  return r;
}

/** The PNG without text / EXIF / time chunks. */
function stripPng(b: Uint8Array): Uint8Array {
  const DROP = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME"]);
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 8;
  while (i + 12 <= b.length) {
    const len = v.getUint32(i);
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const end = i + 12 + len;
    if (!DROP.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const r = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    r.set(p, o);
    o += p.length;
  }
  return r;
}

export function stripImageMetadata(b: Uint8Array): Uint8Array {
  const type = imageTypeOf(b);
  return type === "jpeg" ? stripJpeg(b) : type === "png" ? stripPng(b) : b;
}

/** Any EXIF / XMP / text metadata left? (For tests and the server's own check.) */
export function hasImageMetadata(b: Uint8Array): boolean {
  const type = imageTypeOf(b);
  if (type === "jpeg") {
    let i = 2;
    while (i + 4 <= b.length && b[i] === 0xff) {
      const marker = b[i + 1];
      if (marker === 0xda) return false;
      if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) return true;
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return false;
  }
  if (type === "png") return stripPng(b).length !== b.length;
  return false;
}
