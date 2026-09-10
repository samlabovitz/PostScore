// Browser-only: turns an owner-picked photo File into a resized,
// re-compressed JPEG data: URI, so it can be embedded directly in the
// starter site's generated HTML (see lib/starterSite.ts) without any
// server upload/storage. Resizing here — rather than embedding the
// original file — is what keeps a downloaded site's file size
// reasonable even after a few photos are added.

/** Draws the image to an offscreen canvas at most maxWidth wide
 * (preserving aspect ratio, never upscaling), then re-encodes it as a
 * JPEG data: URI at the given quality. */
export function resizeImageForEmbedding(
  file: File,
  maxWidth: number,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't load that image file."));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Couldn't process that image file."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
