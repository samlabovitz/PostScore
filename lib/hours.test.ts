import { describe, expect, test } from "vitest";
import { formatOpeningHours } from "./hours";
import type { OpeningHoursPeriod } from "./google/places";

describe("formatOpeningHours", () => {
  test("Santa Fe's real pattern: Mon–Thu 11:30–22:00, Fri/Sat to midnight, Sun 11:00–22:00", () => {
    const periods: OpeningHoursPeriod[] = [
      { open: { day: 1, hour: 11, minute: 30 }, close: { day: 1, hour: 22, minute: 0 } },
      { open: { day: 2, hour: 11, minute: 30 }, close: { day: 2, hour: 22, minute: 0 } },
      { open: { day: 3, hour: 11, minute: 30 }, close: { day: 3, hour: 22, minute: 0 } },
      { open: { day: 4, hour: 11, minute: 30 }, close: { day: 4, hour: 22, minute: 0 } },
      { open: { day: 5, hour: 11, minute: 30 }, close: { day: 6, hour: 0, minute: 0 } },
      { open: { day: 6, hour: 11, minute: 0 }, close: { day: 0, hour: 0, minute: 0 } },
      { open: { day: 0, hour: 11, minute: 0 }, close: { day: 0, hour: 22, minute: 0 } },
    ];

    expect(formatOpeningHours(periods, "es")).toEqual([
      "Lunes: 11:30 a.m. – 10:00 p.m.",
      "Martes: 11:30 a.m. – 10:00 p.m.",
      "Miércoles: 11:30 a.m. – 10:00 p.m.",
      "Jueves: 11:30 a.m. – 10:00 p.m.",
      "Viernes: 11:30 a.m. – 12:00 a.m.",
      "Sábado: 11:00 a.m. – 12:00 a.m.",
      "Domingo: 11:00 a.m. – 10:00 p.m.",
    ]);
  });

  test("a day with no period shows Cerrado", () => {
    // Open every day except Sunday.
    const periods: OpeningHoursPeriod[] = [1, 2, 3, 4, 5, 6].map((day) => ({
      open: { day, hour: 9, minute: 0 },
      close: { day, hour: 17, minute: 0 },
    }));

    const lines = formatOpeningHours(periods, "es");
    expect(lines).not.toBeNull();
    expect(lines?.[6]).toBe("Domingo: Cerrado");
    // Every other day still shows real hours, not "Cerrado".
    expect(lines?.slice(0, 6).every((line) => !line.includes("Cerrado"))).toBe(true);
  });

  test("multiple periods in one day (a lunch/dinner split) join with ', '", () => {
    const periods: OpeningHoursPeriod[] = [
      { open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 14, minute: 0 } },
      { open: { day: 1, hour: 17, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } },
    ];

    const lines = formatOpeningHours(periods, "es");
    expect(lines?.[0]).toBe("Lunes: 11:00 a.m. – 2:00 p.m., 5:00 p.m. – 10:00 p.m.");
  });

  test("an open period with no close is a 24-hour day", () => {
    const periods: OpeningHoursPeriod[] = [{ open: { day: 3, hour: 0, minute: 0 } }];

    const lines = formatOpeningHours(periods, "es");
    expect(lines?.[2]).toBe("Miércoles: Abierto las 24 horas");
  });

  test("null periods returns null", () => {
    expect(formatOpeningHours(null, "es")).toBeNull();
  });

  test("empty periods array returns null", () => {
    expect(formatOpeningHours([], "es")).toBeNull();
  });

  test("malformed periods (out-of-range day) returns null rather than a partial schedule", () => {
    const periods: OpeningHoursPeriod[] = [
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
      { open: { day: 9, hour: 9, minute: 0 } }, // day 9 doesn't exist
    ];
    expect(formatOpeningHours(periods, "es")).toBeNull();
  });
});
