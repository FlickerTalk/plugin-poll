// What 📤 puts in the composer (plan-plugins-nuevos §12), in the language of whoever sends it:
//
//   📅 <question>                       📝 <question>             📊 <question>
//   Let's meet on <day> (✅ both)       🏁 <option> (✅ both)     ⭐ <option>: ✅ 2 · 🤔 0 · ❌ 0
//                                                                • <option>: ✅ 1 · 🤔 0 · ❌ 1
//
// The day is written by `Intl.DateTimeFormat` in UTC (`dates.js`), with the year only when it is
// not this year; counts by `Intl.NumberFormat`. It never carries an id or who voted what.

import { formatDay, todayOf } from "./dates.js";
import { makeT } from "./i18n.js";
import { STRINGS } from "./strings.js";

const t = makeT(STRINGS);

const number = (lang, value) => {
  try {
    return new Intl.NumberFormat(lang).format(value);
  } catch {
    return String(value);
  }
};

/** An option in words: a day in the phone's language, or its text. */
export function labelOf(option, lang, today = todayOf()) {
  if (typeof option.date !== "string") return option.text ?? "";
  return formatDay(option.date, lang, { year: option.date.slice(0, 4) !== today.slice(0, 4) });
}

/** `(✅ both)`, `(✅ everyone)` or `(✅ 1 of 2)`. */
function agreement(poll, id, lang) {
  const all = poll.participants();
  const { yes } = poll.tally(id);
  if (poll.goodForAll(id)) return t(lang, all.length === 2 ? "both" : "everyone", { mark: "✅" });
  return t(lang, "some", { mark: "✅", yes: number(lang, yes), total: number(lang, all.length) });
}

export function summaryOf(poll, lang, { today = todayOf() } = {}) {
  const chosen = poll.chosen();
  if (chosen) {
    const label = labelOf(chosen, lang, today);
    const agreed = agreement(poll, chosen.id, lang);
    if (poll.kind === "dates") return `📅 ${poll.question}\n${t(lang, "decidedDate", { day: label })} ${agreed}`;
    return `📝 ${poll.question}\n🏁 ${label} ${agreed}`;
  }
  const lines = [`📊 ${poll.question}`];
  for (const option of poll.options()) {
    const { yes, maybe, no } = poll.tally(option.id);
    const mark = poll.goodForAll(option.id) ? "⭐" : "•";
    lines.push(`${mark} ${labelOf(option, lang, today)}: ✅ ${number(lang, yes)} · 🤔 ${number(lang, maybe)} · ❌ ${number(lang, no)}`);
  }
  return lines.join("\n");
}
