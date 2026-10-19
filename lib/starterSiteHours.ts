// "Open now · until 7:00 PM" for the starter website, worked out in the
// visitor's browser at view time, in the BUSINESS's time zone, from the
// real weekly schedule (the owner's, else Google's). A downloaded page
// can't know "now" when it's built, so the page carries the schedule and
// this small script; the same source runs in tests (hoursStatusAt), so
// what's tested is exactly what ships. Plus the footer's compact hours
// summary ("Mon–Fri 9:00 AM – 5:00 PM · Sat–Sun Closed"). Pure.

import { t, type Locale } from "./i18n";
import { DAY_NAMES, formatTime, hoursRows, type OwnerHours } from "./ownerHours";

/** One day for the script: null = closed, 1 = open 24 hours, else ranges
 * [openMinute, closeMinute, openLabel, closeLabel]; close <= open means
 * past midnight. */
export type ScriptDay = null | 1 | Array<[number, number, string, string]>;

export interface ScriptSchedule {
  /** Monday … Sunday. */
  d: ScriptDay[];
  /** Day names as used mid-sentence ("opens Tuesday at…", "abre el martes…"). */
  n: string[];
  /** Today's hours line per day ("9:00 AM – 5:00 PM"). */
  r: string[];
  t: { open: string; closed: string; until: string; opensAt: string; opensTomorrow: string; opensDay: string; allDay: string; today: string };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function scriptSchedule(hours: OwnerHours, locale: Locale): ScriptSchedule {
  const rows = hoursRows(hours, locale);
  return {
    d: hours.days.map((day): ScriptDay => {
      if (!day.open) return null;
      if (day.allDay) return 1;
      return day.ranges.map((r) => [toMinutes(r.open), toMinutes(r.close), formatTime(r.open, locale), formatTime(r.close, locale)]);
    }),
    n: locale === "es" ? DAY_NAMES.es.map((d) => d.toLowerCase()) : DAY_NAMES.en,
    r: rows.map((row) => row.text),
    t: {
      open: t(locale, "starterSite.openNow"),
      closed: t(locale, "starterSite.closedNow"),
      until: t(locale, "starterSite.openUntil", { time: "{t}" }),
      opensAt: t(locale, "starterSite.opensAt", { time: "{t}" }),
      opensTomorrow: t(locale, "starterSite.opensTomorrow", { time: "{t}" }),
      opensDay: t(locale, "starterSite.opensDay", { day: "{d}", time: "{t}" }),
      allDay: hoursRows({ mode: "weekly", days: [{ open: true, allDay: true, ranges: [] }], note: "" }, locale)[0].text,
      today: t(locale, "starterSite.todayHours", { hours: "{h}" }),
    },
  };
}

/** The status rule, as plain ES5 source — inlined into the page and run
 * by hoursStatusAt in tests. `di` = day index (Monday 0), `m` = minute of
 * the day. Returns [isOpen, detail]. */
const STATUS_SOURCE = `function(H,di,m){var D=H.d,L=H.t,i,r,k,nd;var y=D[(di+6)%7];if(y&&y!==1)for(i=0;i<y.length;i++){r=y[i];if(r[1]<=r[0]&&m<r[1])return[1,L.until.replace("{t}",r[3])];}var td=D[di];if(td===1)return[1,L.allDay];if(td)for(i=0;i<td.length;i++){r=td[i];if(m>=r[0]&&(r[1]<=r[0]||m<r[1]))return[1,L.until.replace("{t}",r[3])];}if(td)for(i=0;i<td.length;i++){r=td[i];if(r[0]>m)return[0,L.opensAt.replace("{t}",r[2])];}for(k=1;k<=7;k++){nd=D[(di+k)%7];if(nd===1)return[0,(k===1?L.opensTomorrow:L.opensDay).replace("{d}",H.n[(di+k)%7]).replace("{t}",H.m)];if(nd&&nd.length)return[0,(k===1?L.opensTomorrow:L.opensDay).replace("{d}",H.n[(di+k)%7]).replace("{t}",nd[0][2])];}return[0,""];}`;

/** Runs the exact shipped rule (tests). */
export function hoursStatusAt(schedule: ScriptSchedule, dayIndex: number, minute: number, locale: Locale): [boolean, string] {
  const fn = new Function(`return ${STATUS_SOURCE}`)() as (h: unknown, di: number, m: number) => [number, string];
  const [open, detail] = fn({ ...schedule, m: formatTime("00:00", locale) }, dayIndex, minute);
  return [open === 1, detail];
}

const json = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/** The page script: highlights today's row in the hours table and fills
 * the "Hours today" tile (hidden until then — never a guessed status). */
export function hoursScript(hours: OwnerHours, locale: Locale, timeZone: string): string {
  const data = { ...scriptSchedule(hours, locale), m: formatTime("00:00", locale) };
  return `<script>(function(){try{var H=${json(data)};var S=${STATUS_SOURCE};var p=new Intl.DateTimeFormat("en-US",{timeZone:${json(timeZone)},weekday:"short",hour:"numeric",minute:"numeric",hourCycle:"h23"}).formatToParts(new Date());var g={};for(var i=0;i<p.length;i++)g[p[i].type]=p[i].value;var di=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].indexOf(g.weekday);if(di<0)return;var m=(parseInt(g.hour,10)%24)*60+parseInt(g.minute,10);var row=document.querySelector('.hours tr[data-day="'+di+'"]');if(row)row.className="today";var tile=document.getElementById("today-tile");if(!tile)return;var s=S(H,di,m);tile.querySelector(".now-state").textContent=s[0]?H.t.open:H.t.closed;tile.querySelector(".now-detail").textContent=s[1];tile.querySelector(".now-hours").textContent=H.t.today.replace("{h}",H.r[di]);tile.className+=s[0]?" is-open":" is-closed";tile.hidden=false;}catch(e){}})();</script>`;
}

const SHORT_DAYS: Record<Locale, string[]> = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  es: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
};

/** Consecutive days with the same hours grouped: "Mon–Fri 9:00 AM – 5:00 PM". */
export function hoursSummary(hours: OwnerHours, locale: Locale): string[] {
  const rows = hoursRows(hours, locale);
  const groups: Array<{ from: number; to: number; text: string }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.text === row.text) last.to = row.index;
    else groups.push({ from: row.index, to: row.index, text: row.text });
  }
  const names = SHORT_DAYS[locale];
  return groups.map((g) => `${g.from === g.to ? names[g.from] : `${names[g.from]}–${names[g.to]}`} ${g.text}`);
}
