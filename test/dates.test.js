// Days as `YYYY-MM-DD` (plan-plugins-nuevos §12): a day is a calendar day, not an instant, so it
// must read the same in every time zone. Nothing here may build `new Date("2026-10-12")`, which is
// midnight UTC and shows as the 11th west of Greenwich. These tests change `TZ` while they run.
import { afterEach, describe, expect, it } from "vitest";
import { LANGUAGES } from "../src/i18n.js";
import { compactDay, formatDay, isDay, nextDay, shortDay, todayOf } from "../src/dates.js";

const ZONES = ["UTC", "America/Los_Angeles", "Pacific/Pago_Pago", "Pacific/Kiritimati", "Asia/Kolkata", "Europe/Madrid"];
const original = process.env.TZ;

afterEach(() => {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
});

describe("a day", () => {
  it("is a real calendar date written YYYY-MM-DD, and nothing else", () => {
    for (const day of ["2026-10-12", "2028-02-29", "2026-12-31", "2026-01-01"]) expect(isDay(day), day).toBe(true);
    for (const day of ["2026-02-29", "2026-13-01", "2026-00-10", "2026-10-32", "2026-04-31", "2026-1-01", "26-10-12", "2026-10-12T00:00", " 2026-10-12", "", null, 20261012, "2026/10/12", "0999-01-01"]) {
      expect(isDay(day), String(day)).toBe(false);
    }
  });

  it("knows the day after, across months, years and leap days", () => {
    expect(nextDay("2026-10-12")).toBe("2026-10-13");
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
    expect(nextDay("2026-02-28")).toBe("2026-03-01");
  });

  it("is written compact for a calendar file", () => {
    expect(compactDay("2026-10-12")).toBe("20261012");
  });
});

describe("in every time zone", () => {
  it("the zone really changes while the tests run (or the tests below prove nothing)", () => {
    process.env.TZ = "UTC";
    const utc = new Date(2026, 9, 12).getTimezoneOffset();
    process.env.TZ = "America/Los_Angeles";
    const la = new Date(2026, 9, 12).getTimezoneOffset();
    expect(utc).toBe(0);
    expect(la).toBe(420);
    // What the plugin must never do: this is the 11th in Los Angeles.
    expect(new Date("2026-10-12").getDate()).toBe(11);
  });

  it("a day shows as itself, with its weekday", () => {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      expect(formatDay("2026-10-12", "en"), zone).toBe("Monday, October 12");
      expect(formatDay("2026-10-12", "es"), zone).toBe("lunes, 12 de octubre");
      expect(shortDay("2026-10-12", "en"), zone).toBe("Mon, Oct 12");
      expect(formatDay("2027-01-01", "en", { year: true }), zone).toBe("Friday, January 1, 2027");
    }
  });

  it("today is this phone's local day, not the UTC one", () => {
    // 2026-10-12 at 03:30 UTC: still the 11th in Los Angeles, already the 12th in Kolkata.
    const instant = new Date(Date.UTC(2026, 9, 12, 3, 30));
    process.env.TZ = "America/Los_Angeles";
    expect(todayOf(instant)).toBe("2026-10-11");
    process.env.TZ = "Asia/Kolkata";
    expect(todayOf(instant)).toBe("2026-10-12");
    process.env.TZ = "Pacific/Kiritimati";
    expect(todayOf(new Date(Date.UTC(2026, 11, 31, 11)))).toBe("2027-01-01");
  });
});

describe("in the 21 languages", () => {
  it("a day is written by Intl in each, the same day in every zone", () => {
    for (const lang of LANGUAGES) {
      const expected = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(Date.UTC(2026, 9, 12));
      for (const zone of ["America/Los_Angeles", "Pacific/Kiritimati"]) {
        process.env.TZ = zone;
        expect(formatDay("2026-10-12", lang), `${lang} ${zone}`).toBe(expected);
      }
    }
  });

  it("a tag Intl does not know falls back instead of throwing", () => {
    expect(formatDay("2026-10-12", "not a tag!")).toBe("Monday, October 12");
  });
});
