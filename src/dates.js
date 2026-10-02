// Days as `YYYY-MM-DD` (plan-plugins-nuevos §12). A day of a poll is a calendar day, not an
// instant: it is kept and sent as text, and only turned into a `Date` at midnight UTC, which is
// always formatted with `timeZone: "UTC"`, so it reads the same in every zone.
// Never `new Date("2026-10-12")` with a local formatter: that is the 11th west of Greenwich.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const parts = (day) => {
  const match = DAY.exec(day);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

/** Whether a value is a real calendar day written `YYYY-MM-DD` (years 1000 to 9999). */
export function isDay(value) {
  if (typeof value !== "string") return false;
  const read = parts(value);
  if (!read) return false;
  const [year, month, date] = read;
  if (year < 1000 || month < 1 || month > 12 || date < 1) return false;
  const back = new Date(Date.UTC(year, month - 1, date));
  return back.getUTCFullYear() === year && back.getUTCMonth() === month - 1 && back.getUTCDate() === date;
}

/** The day as an instant at midnight UTC: only ever formatted in UTC. */
const utc = (day) => {
  const [year, month, date] = parts(day);
  return Date.UTC(year, month - 1, date);
};

const pad = (value, size = 2) => String(value).padStart(size, "0");

const write = (date) => `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** The day after. */
export function nextDay(day) {
  return write(new Date(utc(day) + 86_400_000));
}

/** `20261012`, as a calendar file writes a date. */
export function compactDay(day) {
  return day.replaceAll("-", "");
}

/** This phone's local day at an instant (today, by default). */
export function todayOf(now = new Date()) {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const formatter = (lang, options) => {
  try {
    return new Intl.DateTimeFormat(lang, { ...options, timeZone: "UTC" });
  } catch {
    return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" });
  }
};

/** A day in words, in the phone's language: "Monday, October 12" (and the year if asked). */
export function formatDay(day, lang, { year = false } = {}) {
  const options = { weekday: "long", day: "numeric", month: "long" };
  if (year) options.year = "numeric";
  return formatter(lang, options).format(utc(day));
}

/** A day in few words, for a row: "Mon, Oct 12". */
export function shortDay(day, lang) {
  return formatter(lang, { weekday: "short", day: "numeric", month: "short" }).format(utc(day));
}
