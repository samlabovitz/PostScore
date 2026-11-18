"use client";

// One time of day, in 15-minute steps (lib/hoursEditor.ts) — one control:
// click the field for the list of every quarter hour (opened at the
// current time, highlighted), the ▲ ▼ inside it or the keyboard's ↑ ↓ to
// step, or type a time ("9:30 pm", "2130") and press Enter. Shown the
// owner's way (formatTime: "9:00 AM" / "9:00 a. m.").

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { formatTime } from "@/lib/gbpProfileEdits";
import { DROPDOWN_ITEM_PX, DROPDOWN_LIST_PX, dropdownScrollTop, nearestQuarter, parseTypedTime, QUARTER_HOURS, stepTime } from "@/lib/hoursEditor";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STEP_BUTTON = "flex h-[13px] w-5 items-center justify-center text-ink-mute hover:text-ink";

export function TimePicker({ value, onChange, label, testId }: { value: number; onChange: (minutes: number) => void; label: string; testId?: string }) {
  const locale = useLocale();
  const listId = useId();
  const [text, setText] = useState(formatTime(value, locale));
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  // The list's highlighted row: the current time, or its nearest quarter hour.
  const current = nearestQuarter(value);

  // The shown time follows the value unless the owner is typing.
  useEffect(() => {
    if (!editing) setText(formatTime(value, locale));
  }, [value, locale, editing]);

  // The list opens with the current time in the middle — before it paints.
  useLayoutEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = dropdownScrollTop(QUARTER_HOURS.indexOf(current));
  }, [open, current]);

  const commit = () => {
    const typed = parseTypedTime(text);
    setEditing(false);
    if (typed !== null && typed !== value) onChange(typed);
    else setText(formatTime(value, locale));
  };
  const step = (direction: 1 | -1) => {
    setEditing(false);
    onChange(stepTime(value, direction));
  };
  const pick = (m: number) => {
    setEditing(false);
    onChange(m);
    setOpen(false);
  };

  return (
    <div className="relative inline-flex items-center rounded-lg border border-paper-deep bg-white focus-within:border-brass" data-testid={testId}>
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={text}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setEditing(true);
          setText(e.target.value);
        }}
        onBlur={() => {
          if (editing) commit();
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            step(e.key === "ArrowUp" ? 1 : -1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (editing) commit();
            setOpen(false);
          } else if (e.key === "Escape") {
            setEditing(false);
            setText(formatTime(value, locale));
            setOpen(false);
          }
        }}
        className="w-[92px] cursor-pointer rounded-lg bg-transparent py-1 pl-2 text-[13px] text-ink outline-none"
      />
      {/* Inside the field; a click here keeps the field focused. */}
      <span className="flex flex-col pr-0.5" onMouseDown={(e) => e.preventDefault()}>
        <button type="button" tabIndex={-1} aria-label={t(locale, "dashboard.hoursEditor.later")} onClick={() => step(1)} className={STEP_BUTTON}>
          <IconChevronUp size={12} aria-hidden />
        </button>
        <button type="button" tabIndex={-1} aria-label={t(locale, "dashboard.hoursEditor.earlier")} onClick={() => step(-1)} className={STEP_BUTTON}>
          <IconChevronDown size={12} aria-hidden />
        </button>
      </span>
      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={label}
          style={{ maxHeight: DROPDOWN_LIST_PX }}
          className="absolute left-0 top-full z-30 mt-1 w-[140px] overflow-y-auto rounded-lg border border-paper-deep bg-white shadow-card"
        >
          {QUARTER_HOURS.map((m) => (
            <li
              key={m}
              role="option"
              aria-selected={m === current}
              data-current={m === current || undefined}
              style={{ height: DROPDOWN_ITEM_PX }}
              onMouseDown={(e) => {
                // Before the field's blur closes the list.
                e.preventDefault();
                pick(m);
              }}
              className={cn("flex cursor-pointer items-center px-2.5 text-[13px] text-ink hover:bg-paper", m === current && "bg-brass/15 font-semibold")}
            >
              {formatTime(m, locale)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
