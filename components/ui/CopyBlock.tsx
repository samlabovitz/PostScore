"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";

/** A pre-written block of text with a "Copy" button — used anywhere the
 * app hands the owner text to paste somewhere themselves (a share
 * caption, a Google post draft, an FAQ draft). Copying never sends the
 * text anywhere on its own. */
export function CopyBlock({ text, rows }: { text: string; rows?: number }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be denied by the browser — the text is
      // still fully visible and selectable, so there's a fallback
      // already in front of the user without needing extra handling.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        readOnly
        value={text}
        rows={rows ?? Math.min(8, text.split("\n").length + 1)}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-none rounded-lg border border-paper-deep bg-paper px-3 py-2 text-[13px] text-ink outline-none"
      />
      <Button type="button" variant="default" size="sm" onClick={handleCopy} className="w-fit">
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        {copied ? "Copied" : "Copy text"}
      </Button>
    </div>
  );
}
