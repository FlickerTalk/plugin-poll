// The chosen date as a calendar file (iCalendar, RFC 5545): one all-day event that the phone's
// calendar app can add. Written by hand: it is a few lines, with no time zones and no recurrence,
// and the `ics` package would bring three dependencies (~77 KB) for it. What it carries: the
// question as `SUMMARY`, the day, a `UID` made from the poll's id (so the file from either phone
// is the same event), and `DTSTAMP`. No names, contacts or votes.

import { compactDay, isDay, nextDay } from "./dates.js";

const CRLF = "\r\n";
const LIMIT = 75;
const encoder = new TextEncoder();

/** TEXT as RFC 5545 §3.3.11 wants it: `\\`, `\;`, `\,` and `\n` for a line break. */
export function escapeText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * A content line folded as RFC 5545 §3.1 says: at most 75 octets per physical line, the next one
 * starting with a space, and never inside a character.
 */
export function fold(line) {
  const out = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const width = encoder.encode(char).length;
    if (size + width > LIMIT) {
      out.push(current);
      current = ` ${char}`;
      size = 1 + width;
    } else {
      current += char;
      size += width;
    }
  }
  out.push(current);
  return out.join(CRLF);
}

const pad = (value) => String(value).padStart(2, "0");

/** A UTC date-time as `20261002T130405Z`. */
function utcStamp(time) {
  const date = new Date(time);
  if (!Number.isFinite(time) || Number.isNaN(date.getTime())) throw new Error("not a time");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** The file: `uid` is the poll's id, `summary` its question, `day` the chosen day, `stamp` when it was closed. */
export function calendarFile({ uid, summary, day, stamp }) {
  if (!isDay(day)) throw new Error("not a day");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FlickerTalk//Poll 1.0//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(uid)}@poll.flickertalk`,
    `DTSTAMP:${utcStamp(stamp)}`,
    `DTSTART;VALUE=DATE:${compactDay(day)}`,
    `DTEND;VALUE=DATE:${compactDay(nextDay(day))}`,
    `SUMMARY:${escapeText(summary)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}

/** `<question>.ics`, with nothing a path or a file system would choke on. */
export function calendarName(question) {
  const plain = String(question ?? "")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  const short = Array.from(plain).slice(0, 60).join("").trim();
  return `${short || "poll"}.ics`;
}
