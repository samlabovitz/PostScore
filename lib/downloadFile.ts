// A real browser file download for generated text content (unlike the
// image downloads in lib/couponImage.ts, this isn't a data: URL — the
// starter site's HTML can be large enough that a Blob + object URL is
// the more robust choice). Browser-only, "use client" callers only.

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
