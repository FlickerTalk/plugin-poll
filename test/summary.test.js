// What 📤 proposes in the chat (plan-plugins-nuevos §12): `📅 Quedamos el sábado 12 de octubre
// (✅ los dos)`, in the language of whoever sends it, with the day written by
// `Intl.DateTimeFormat` and the counts by `Intl.NumberFormat`. Never an id or a name.
import { afterEach, describe, expect, it } from "vitest";
import { LANGUAGES, makeT } from "../src/i18n.js";
import { Poll } from "../src/poll.js";
import { STRINGS } from "../src/strings.js";
import { summaryOf } from "../src/summary.js";

const t = makeT(STRINGS);
const original = process.env.TZ;
afterEach(() => {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
});

/** A poll between two, voted, and closed on its first option when `close` says so. */
function voted({ kind = "dates", question = "Cena", options = ["2026-10-12", "2026-10-13"], mine = [], theirs = [], close = true } = {}) {
  const poll = Poll.create({ kind, question });
  const ids = options.map((one) => poll.addOption(one));
  const twin = Poll.received(poll.id);
  twin.take(poll.state(), poll.who);
  mine.forEach((answer, at) => answer && poll.vote(ids[at], answer));
  theirs.forEach((answer, at) => answer && twin.vote(ids[at], answer));
  poll.take(twin.state(), twin.who);
  if (close) poll.close(ids[0]);
  return poll;
}

const day = (lang) => new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(Date.UTC(2026, 9, 12));

describe("the summary of a closed date poll", () => {
  it("says the day and that it is good for both, as the plan writes it", () => {
    const poll = voted({ mine: ["yes"], theirs: ["yes"] });
    expect(summaryOf(poll, "es", { today: "2026-10-02" })).toBe("📅 Cena\nQuedamos el lunes, 12 de octubre (✅ los dos)");
    expect(summaryOf(poll, "en", { today: "2026-10-02" })).toBe("📅 Cena\nLet's meet on Monday, October 12 (✅ both)");
  });

  it("is written in each of the 21 languages, the day by Intl", () => {
    const poll = voted({ mine: ["yes"], theirs: ["yes"] });
    for (const lang of LANGUAGES) {
      expect(summaryOf(poll, lang, { today: "2026-10-02" }), lang).toBe(`📅 Cena\n${t(lang, "decidedDate", { day: day(lang) })} ${t(lang, "both", { mark: "✅" })}`);
    }
  });

  it("is the same day in every time zone", () => {
    const poll = voted({ mine: ["yes"], theirs: ["yes"] });
    const texts = new Set();
    for (const zone of ["America/Los_Angeles", "Pacific/Kiritimati", "UTC"]) {
      process.env.TZ = zone;
      texts.add(summaryOf(poll, "en", { today: "2026-10-02" }));
    }
    expect([...texts]).toEqual(["📅 Cena\nLet's meet on Monday, October 12 (✅ both)"]);
  });

  it("counts the ✅ when not everyone said yes, with Intl's digits", () => {
    const poll = voted({ mine: ["yes"], theirs: ["maybe"] });
    expect(summaryOf(poll, "en", { today: "2026-10-02" })).toBe("📅 Cena\nLet's meet on Monday, October 12 (✅ 1 of 2)");
    const n = (value) => new Intl.NumberFormat("ar").format(value);
    expect(summaryOf(poll, "ar", { today: "2026-10-02" })).toContain(t("ar", "some", { mark: "✅", yes: n(1), total: n(2) }));
  });

  it("adds the year when the day is not in this year", () => {
    const poll = voted({ options: ["2027-01-08"], mine: ["yes"], theirs: ["yes"] });
    expect(summaryOf(poll, "en", { today: "2026-10-02" })).toBe("📅 Cena\nLet's meet on Friday, January 8, 2027 (✅ both)");
  });
});

describe("the summary of other polls", () => {
  it("of a closed text poll gives the chosen option", () => {
    const poll = voted({ kind: "text", question: "Where?", options: ["Sushi", "Pizza"], mine: ["yes"], theirs: ["yes"] });
    expect(summaryOf(poll, "en")).toBe("📝 Where?\n🏁 Sushi (✅ both)");
  });

  it("of an open poll lists each option with its counts, ⭐ where it is good for both", () => {
    const poll = voted({ mine: ["yes", "yes"], theirs: ["yes", "no"], close: false });
    expect(summaryOf(poll, "en", { today: "2026-10-02" })).toBe("📊 Cena\n⭐ Monday, October 12: ✅ 2 · 🤔 0 · ❌ 0\n• Tuesday, October 13: ✅ 1 · 🤔 0 · ❌ 1");
    const text = voted({ kind: "text", question: "Where?", options: ["Sushi"], close: false });
    expect(summaryOf(text, "en")).toBe("📊 Where?\n• Sushi: ✅ 0 · 🤔 0 · ❌ 0");
  });

  it("never carries an id or who voted", () => {
    const poll = voted({ mine: ["yes"], theirs: ["yes"], close: false });
    const text = summaryOf(poll, "en", { today: "2026-10-02" });
    for (const secret of [poll.id, poll.who, ...poll.participants(), ...poll.options().map((one) => one.id)]) expect(text).not.toContain(secret);
  });
});
