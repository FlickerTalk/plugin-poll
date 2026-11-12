// No names, contacts or votes in the file.

import { compactDay, isDay, nextDay } from "./dates.js";

const CRLF = "\r\n";
const LIMIT = 75;
const encoder = new TextEncoder();

// RFC 5545, section 3.3.11
export function escapeText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

// RFC 5545 section 3.1 folding, at most 75 octets per line and never inside a character
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

function utcStamp(time) {
  const date = new Date(time);
  if (!Number.isFinite(time) || Number.isNaN(date.getTime())) throw new Error("not a time");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

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

export function calendarName(question) {
  const plain = String(question ?? "")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  const short = Array.from(plain).slice(0, 60).join("").trim();
  return `${short || "poll"}.ics`;
}
