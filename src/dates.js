// Days stay `YYYY-MM-DD` text and become a Date only at midnight UTC, always formatted in UTC.
// new Date() on such a string with a local formatter shows the day before west of Greenwich.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const parts = (day) => {
  const match = DAY.exec(day);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

export function isDay(value) {
  if (typeof value !== "string") return false;
  const read = parts(value);
  if (!read) return false;
  const [year, month, date] = read;
  if (year < 1000 || month < 1 || month > 12 || date < 1) return false;
  const back = new Date(Date.UTC(year, month - 1, date));
  return back.getUTCFullYear() === year && back.getUTCMonth() === month - 1 && back.getUTCDate() === date;
}

const utc = (day) => {
  const [year, month, date] = parts(day);
  return Date.UTC(year, month - 1, date);
};

const pad = (value, size = 2) => String(value).padStart(size, "0");

const write = (date) => `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

export function nextDay(day) {
  return write(new Date(utc(day) + 86_400_000));
}

export function compactDay(day) {
  return day.replaceAll("-", "");
}

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

export function formatDay(day, lang, { year = false } = {}) {
  const options = { weekday: "long", day: "numeric", month: "long" };
  if (year) options.year = "numeric";
  return formatter(lang, options).format(utc(day));
}

export function shortDay(day, lang) {
  return formatter(lang, { weekday: "short", day: "numeric", month: "short" }).format(utc(day));
}
