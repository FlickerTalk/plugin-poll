import { describe, expect, it } from "vitest";
import { calendarFile, calendarName, escapeText, fold } from "../src/ics.js";

const octets = (text) => new TextEncoder().encode(text).length;
const unfold = (text) => text.replace(/\r\n[ \t]/g, "");
const lines = (text) => unfold(text).split("\r\n");

const STAMP = Date.UTC(2026, 9, 2, 13, 4, 5);

describe("a calendar file", () => {
  it("is one all-day event on the chosen day, with CRLF line ends", () => {
    const text = calendarFile({ uid: "0abc123", summary: "Dinner", day: "2026-10-12", stamp: STAMP });
    expect(text).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//FlickerTalk//Poll 1.0//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        "UID:0abc123@poll.flickertalk",
        "DTSTAMP:20261002T130405Z",
        "DTSTART;VALUE=DATE:20261012",
        "DTEND;VALUE=DATE:20261013",
        "SUMMARY:Dinner",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    );
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("ends the event the next day, across months, years and leap days", () => {
    const end = (day) => lines(calendarFile({ uid: "x", summary: "s", day, stamp: STAMP })).find((line) => line.startsWith("DTEND"));
    expect(end("2026-12-31")).toBe("DTEND;VALUE=DATE:20270101");
    expect(end("2028-02-28")).toBe("DTEND;VALUE=DATE:20280229");
    expect(end("2026-04-30")).toBe("DTEND;VALUE=DATE:20260501");
  });

  it("has a UID that depends only on the poll, so both phones' files are the same event", () => {
    const one = calendarFile({ uid: "poll-1", summary: "A", day: "2026-10-12", stamp: STAMP });
    const again = calendarFile({ uid: "poll-1", summary: "A", day: "2026-10-12", stamp: STAMP });
    expect(one).toBe(again);
    expect(lines(calendarFile({ uid: "poll-2", summary: "A", day: "2026-10-12", stamp: STAMP }))).toContain("UID:poll-2@poll.flickertalk");
  });

  it("escapes the question as TEXT: backslash, semicolon, comma and line breaks", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf\rg: h")).toBe("a\\\\b\\;c\\,d\\ne\\nf\\ng: h");
    const text = calendarFile({ uid: "x", summary: "Pizza, beer; & 1\\2\nlater", day: "2026-10-12", stamp: STAMP });
    expect(lines(text)).toContain("SUMMARY:Pizza\\, beer\\; & 1\\\\2\\nlater");
  });

  it("folds long lines at 75 octets, never inside a character, and unfolds back to the same", () => {
    for (const summary of ["x".repeat(300), "é".repeat(120), "🎉 fiesta ".repeat(30), "日本語のテキスト".repeat(20), `a${"🙂".repeat(40)}`]) {
      const text = calendarFile({ uid: "x", summary, day: "2026-10-12", stamp: STAMP });
      for (const line of text.split("\r\n")) {
        expect(octets(line), line).toBeLessThanOrEqual(75);
        expect(() => new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(line))).not.toThrow();
        expect(line).not.toMatch(/[\uD800-\uDBFF]$|^ ?[\uDC00-\uDFFF]/);
      }
      expect(lines(text)).toContain(`SUMMARY:${summary}`);
    }
    expect(fold("short")).toBe("short");
    expect(fold("y".repeat(76))).toBe(`${"y".repeat(75)}\r\n y`);
  });

  it("carries only what a calendar needs: no names, contacts, votes or web addresses", () => {
    const text = calendarFile({ uid: "x", summary: "Dinner", day: "2026-10-12", stamp: STAMP });
    const names = lines(text)
      .filter(Boolean)
      .map((line) => line.split(/[:;]/)[0]);
    expect(new Set(names)).toEqual(new Set(["BEGIN", "VERSION", "PRODID", "CALSCALE", "METHOD", "UID", "DTSTAMP", "DTSTART", "DTEND", "SUMMARY", "END"]));
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("refuses a day that is not one", () => {
    expect(() => calendarFile({ uid: "x", summary: "s", day: "2026-02-30", stamp: STAMP })).toThrow();
    expect(() => calendarFile({ uid: "x", summary: "s", day: "2026-10-12", stamp: Number.NaN })).toThrow();
  });
});

describe("the file name", () => {
  it("is the question, without anything a path or a file system would choke on", () => {
    expect(calendarName("Dinner on Friday?")).toBe("Dinner on Friday.ics");
    expect(calendarName("../../etc/passwd")).toBe("etc passwd.ics");
    expect(calendarName('a/b\\c:d*e?f"g<h>i|j')).toBe("a b c d e f g h i j.ics");
    expect(calendarName("   ")).toBe("poll.ics");
    expect(calendarName("...")).toBe("poll.ics");
    expect(calendarName("tab\there\u0000x")).toBe("tab here x.ics");
    expect(calendarName("¿Cenamos el sábado? 🎉")).toBe("¿Cenamos el sábado 🎉.ics");
    expect(calendarName("z".repeat(200))).toBe(`${"z".repeat(60)}.ics`);
  });
});
