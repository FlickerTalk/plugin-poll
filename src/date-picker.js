import "cally";
import { isDay } from "./dates.js";
import { icon } from "./icons.js";

// 0 = Sunday, as cally counts
export function firstDayOf(lang) {
  try {
    const locale = new Intl.Locale(lang);
    const info = typeof locale.getWeekInfo === "function" ? locale.getWeekInfo() : locale.weekInfo;
    if (info && Number.isInteger(info.firstDay)) return info.firstDay % 7;
  } catch {
    // not a tag Intl knows
  }
  return 1;
}

const daysOf = (list) => [...new Set(list.filter(isDay))].sort();

export function datePicker({ lang = "en", dir = "ltr", days = [], min, today, labels = {} } = {}) {
  const element = document.createElement("div");
  element.className = "picker";
  const calendar = document.createElement("calendar-multi");
  calendar.setAttribute("locale", lang);
  calendar.setAttribute("dir", dir);
  calendar.setAttribute("first-day-of-week", String(firstDayOf(lang)));
  if (min) calendar.setAttribute("min", min);
  if (today) calendar.setAttribute("today", today);
  const rtl = dir === "rtl";
  for (const [slot, name] of [
    ["previous", rtl ? "chevron-forward-outline" : "chevron-back-outline"],
    ["next", rtl ? "chevron-back-outline" : "chevron-forward-outline"],
  ]) {
    const arrow = document.createElement("span");
    arrow.setAttribute("slot", slot);
    arrow.setAttribute("aria-label", labels[slot] ?? slot);
    arrow.innerHTML = icon(name);
    calendar.append(arrow);
  }
  calendar.append(document.createElement("calendar-month"));
  element.append(calendar);

  let chosen = [];
  const listeners = new Set();
  const show = (list) => {
    chosen = daysOf(list);
    calendar.value = chosen.join(" ");
  };
  show(days);
  if (chosen.length) calendar.setAttribute("focused-date", chosen[0]);

  calendar.addEventListener("change", () => {
    chosen = daysOf(String(calendar.value ?? "").split(/\s+/));
    for (const listener of listeners) listener([...chosen]);
  });

  return {
    element,
    get days() {
      return [...chosen];
    },
    setDays(list) {
      show(list);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
