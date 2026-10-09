// The plugin as the user sees it (plan-plugins-nuevos §12), against the fake core: a poll of dates
// or of texts; ✅ / 🤔 / ❌; anyone adds options; whoever created it closes it choosing one; 📤
// proposes the result; 📆 hands the chosen day to the calendar as an .ics file; the 21 languages;
// and two phones in one conversation voting live, losing each other and meeting again. Each
// conversation keeps its own polls under its opaque `chat` id (onOpen, core 1.3.0); outside a
// conversation polls are this phone's only and never live; the `chat` id never leaves the phone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarFile } from "./src/ics.js";
import { FORMAT } from "./src/index.js";
import { HELLO, UPDATE, VERSION, decode, encode, fromBase64 } from "./src/live.js";
import { APP_ICONS, OWN_ICONS } from "./src/icons.js";
import { Poll } from "./src/poll.js";
import { NO_CHAT, recordKey } from "./src/store.js";
import { STRINGS } from "./src/strings.js";
import { connect, fakeCore } from "./test/fake-core.js";

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "module.json"), "utf8"));

/** A conversation's opaque id as the core gives it: 43 characters, this phone's own. */
const chat = (name) => `Chat${name}`.padEnd(43, "x");
const CHAT_A = chat("OfAWithB");
const CHAT_B = chat("OfBWithA");

const flush = async () => {
  for (let at = 0; at < 60; at += 1) await Promise.resolve();
};

/** One phone with the plugin open: in a conversation (`chat`) with `live` granted, by default. */
async function phone(core, opening = { live: true, chat: CHAT_A }) {
  globalThis.ft = core.ft;
  const element = document.createElement("ft-poll");
  document.body.append(element);
  await core.open(opening);
  await flush();
  return element;
}

// In the page, not in a shadow root: Ionic's global styles do not cross a shadow boundary.
const inside = (element) => element;
// Ionic moves a button's label to the native button inside it once it has drawn.
const label = (one) => one?.getAttribute("aria-label") ?? one?.shadowRoot?.querySelector("button")?.getAttribute("aria-label") ?? null;
/** The app's ✕ (there is none in the plugin): its goodbye runs, then the window goes. */
async function closeWindow(element, core) {
  await core.closeWindow();
  await settle(element);
}
const settle = async (...elements) => {
  await flush();
  for (const element of elements) await element.keeper.settled();
  await flush();
};
async function press(element, act, extra = "") {
  const button = inside(element).querySelector(`[data-act="${act}"]${extra}`);
  if (!button) throw new Error(`no button ${act}${extra}`);
  button.click();
  await settle(element);
}
/**
 * Types in a field and confirms it: by tapping its button, or with Enter. Never through a form
 * `submit`: the plugin frame is `sandbox="allow-scripts"` without `allow-forms`, and Android's
 * WebView blocks a form submission before any `submit` event (seen on the Samsung and the Lenovo).
 */
async function fill(element, entry, value, { by = "click" } = {}) {
  const node = inside(element).querySelector(`[data-entry="${entry}"]`);
  if (!node) throw new Error(`no field ${entry}`);
  const input = node.querySelector("input");
  input.value = value;
  if (by === "enter") input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true, cancelable: true }));
  else node.querySelector("[data-act]").click();
  await settle(element);
}
/** Creates a poll from the home screen. */
async function create(element, question, kind = "dates") {
  await press(element, "kind", `[data-kind="${kind}"]`);
  await fill(element, "new", question);
}
/** The user taps days on the calendar: cally's value becomes them and it fires `change`. */
async function pick(element, ...days) {
  const calendar = inside(element).querySelector("[data-picker] calendar-multi");
  if (!calendar) throw new Error("no calendar");
  calendar.value = days.join(" ");
  calendar.dispatchEvent(new Event("change"));
  await settle(element);
}
const labels = (element) => [...inside(element).querySelectorAll("[data-option]")].map((row) => row.querySelector(".label").textContent);
const optionId = (element, label) => [...inside(element).querySelectorAll("[data-option]")].find((row) => row.querySelector(".label").textContent === label)?.dataset.option;
const vote = (element, label, answer) => press(element, "vote", `[data-id="${optionId(element, label)}"][data-answer="${answer}"]`);
const pressed = (element, label) => inside(element).querySelector(`[data-option="${optionId(element, label)}"] [data-act="vote"][aria-pressed="true"]`)?.dataset.answer ?? "none";
const good = (element, label) => inside(element).querySelector(`[data-option="${optionId(element, label)}"]`)?.dataset.good === "true";
const statusOf = (element) => inside(element).querySelector("[data-status]")?.textContent ?? "";
const text = (element) => inside(element).textContent;

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("the manifest", () => {
  it("asks for live and to propose, nothing more, on core 1.6.0 (the one that lends Ionic)", () => {
    expect(manifest).toEqual({
      id: "com.flickertalk.poll",
      name: "Poll",
      version: "1.0.3",
      icon: "stats-chart-outline",
      minCoreVersion: "1.6.0",
      components: ["ft-poll"],
      permissions: { live: true, send: "propose" },
      summary: expect.any(String),
      locales: expect.any(Object),
    });
    expect(manifest.summary.length).toBeLessThanOrEqual(200);
    expect(FORMAT).toBe("ftpoll");
  });

  // The 20 languages of the app besides English, in which the catalogue shows the plugin's name
  // and summary (plugin-sdk, `locales` in module.schema.json).
  const LOCALES = ["es", "pt", "fr", "de", "it", "ro", "ru", "uk", "pl", "tr", "ar", "hi", "bn", "id", "vi", "th", "ja", "ko", "zh-CN", "zh-TW"];
  const codePoints = (text) => [...text].length;

  it("names and sums up the plugin in the 20 other languages of the app, within the SDK's limits", () => {
    expect(Object.keys(manifest.locales ?? {})).toEqual(LOCALES);
    for (const lang of LOCALES) {
      const { name, summary } = manifest.locales[lang];
      expect(summary, lang).toBeTypeOf("string");
      expect(codePoints(summary.trim()), lang).toBeGreaterThan(0);
      expect(codePoints(summary), lang).toBeLessThanOrEqual(200);
      expect(name, lang).toBeTypeOf("string");
      expect(codePoints(name.trim()), lang).toBeGreaterThan(0);
      expect(codePoints(name), lang).toBeLessThanOrEqual(64);
    }
  });

  it("calls the plugin in each language what the plugin calls itself", () => {
    for (const lang of LOCALES) {
      expect(STRINGS[lang]?.title, lang).toBeTypeOf("string");
      expect(manifest.locales?.[lang]?.name, lang).toBe(STRINGS[lang].title);
    }
  });
});

describe("one phone", () => {
  it("creates a poll and adds options with a tap or with Enter, without any form", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false });
    expect(inside(element).querySelector("form")).toBeNull();
    await press(element, "kind", '[data-kind="text"]');
    await fill(element, "new", "Where?", { by: "enter" });
    expect(inside(element).querySelector("[data-name]").textContent).toBe("Where?");
    expect(inside(element).querySelector("form")).toBeNull();
    await fill(element, "add", "Sushi", { by: "enter" });
    await fill(element, "add", "Pizza");
    expect(labels(element)).toEqual(["Sushi", "Pizza"]);
    expect(inside(element).querySelector('[data-entry="add"] input').value).toBe("");
    // Enter while an input method is still composing a word does nothing yet.
    const input = inside(element).querySelector('[data-entry="add"] input');
    input.value = "Ramen";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, composed: true }));
    await settle(element);
    expect(labels(element)).toEqual(["Sushi", "Pizza"]);
    await press(element, "back");
    await press(element, "kind", '[data-kind="dates"]');
    await fill(element, "new", "Dinner?");
    expect(inside(element).querySelector("[data-name]").textContent).toBe("Dinner?");
  });

  it("makes a date poll: days from the calendar, in calendar order, votes, kept on every change", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false });
    expect(text(element)).toContain("No polls yet");
    await create(element, "Dinner?");
    expect(inside(element).querySelector("[data-name]").textContent).toBe("Dinner?");
    await pick(element, "2026-10-14", "2026-10-12");
    expect(labels(element)).toEqual(["Mon, Oct 12", "Wed, Oct 14"]);
    await vote(element, "Mon, Oct 12", "yes");
    expect(pressed(element, "Mon, Oct 12")).toBe("yes");
    await vote(element, "Mon, Oct 12", "yes");
    expect(pressed(element, "Mon, Oct 12")).toBe("none");
    await vote(element, "Wed, Oct 14", "maybe");
    const kept = Poll.parse(element.poll.id, core.records.get(recordKey(NO_CHAT, element.poll.id)));
    expect(kept.options().map((one) => one.date)).toEqual(["2026-10-12", "2026-10-14"]);
    expect(kept.answerOf(kept.who, kept.options()[1].id)).toBe("maybe");
    // Unticking a day on the calendar removes the option this phone added.
    await pick(element, "2026-10-14");
    expect(labels(element)).toEqual(["Wed, Oct 14"]);
    await press(element, "back");
    expect(inside(element).querySelector('[data-act="open"] .title').textContent).toBe("Dinner?");
  });

  it("makes a text poll: options added by text, removed by whoever added them", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false });
    await create(element, "Where?", "text");
    expect(inside(element).querySelector("[data-picker]")).toBeNull();
    await fill(element, "add", "Sushi");
    await fill(element, "add", "Pizza");
    await fill(element, "add", "  ");
    expect(labels(element)).toEqual(["Sushi", "Pizza"]);
    await press(element, "removeOption", `[data-id="${optionId(element, "Sushi")}"]`);
    expect(labels(element)).toEqual(["Pizza"]);
  });

  it("is closed by its creator choosing an option, inside the plugin, never with confirm()", async () => {
    const core = fakeCore();
    globalThis.confirm = vi.fn(() => true);
    const element = await phone(core, { live: false });
    await create(element, "Dinner?");
    await pick(element, "2026-10-12", "2026-10-13");
    await press(element, "closePoll");
    expect(text(element)).toContain("Choose the option the poll closes with.");
    await press(element, "choose", `[data-id="${optionId(element, "Mon, Oct 12")}"]`);
    expect(text(element)).toContain("Close the poll with “Monday, October 12”?");
    await press(element, "cancelClose");
    expect(element.poll.closed).toBeNull();
    await press(element, "closePoll");
    await press(element, "choose", `[data-id="${optionId(element, "Mon, Oct 12")}"]`);
    await press(element, "confirmClose");
    expect(element.poll.closed).not.toBeNull();
    expect(inside(element).querySelector("[data-banner]").textContent).toContain("Chosen: Monday, October 12");
    expect(inside(element).querySelector('[data-act="vote"]')).toBeNull();
    expect(inside(element).querySelector("[data-picker]")).toBeNull();
    expect(globalThis.confirm).not.toHaveBeenCalled();
    delete globalThis.confirm;
  });

  it("proposes the result as text in the chat", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false, chat: CHAT_A });
    await create(element, "Cena", "dates");
    await pick(element, "2026-10-12");
    await vote(element, "Mon, Oct 12", "yes");
    await press(element, "closePoll");
    await press(element, "choose");
    await press(element, "confirmClose");
    await press(element, "send");
    expect(core.said).toHaveLength(1);
    expect(core.said[0]).toMatch(/^📅 Cena\nLet's meet on Monday, October 12(, 2026)? \(✅ 1 of 1\)$/);
  });

  it("saves the chosen day as a calendar file, or sends it to the chat", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false, chat: CHAT_A });
    await create(element, "Dinner: Friday?");
    await pick(element, "2026-10-12");
    expect(inside(element).querySelector('[data-act="icsSave"]')).toBeNull();
    await press(element, "closePoll");
    await press(element, "choose");
    await press(element, "confirmClose");
    await press(element, "icsSave");
    expect(core.ft.save).toHaveBeenCalledTimes(1);
    const [name, mime, data] = core.ft.save.mock.calls[0];
    expect(name).toBe("Dinner Friday.ics");
    expect(mime).toBe("text/calendar");
    const file = new TextDecoder().decode(fromBase64(data));
    expect(file).toBe(calendarFile({ uid: element.poll.id, summary: "Dinner: Friday?", day: "2026-10-12", stamp: element.poll.closed.t }));
    expect(inside(element).querySelector("[data-ics-note]").textContent).toContain("Saved on this phone");
    core.ft.save.mockResolvedValueOnce(false);
    await press(element, "icsSave");
    expect(inside(element).querySelector("[data-ics-note]").textContent).toContain("could not be saved");
    await press(element, "icsSend");
    expect(core.ft.send).toHaveBeenCalledWith("Dinner Friday.ics", "text/calendar", data);
  });

  it("asks inside the plugin before deleting a poll", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false });
    await create(element, "Dinner?");
    await press(element, "back");
    await press(element, "delete");
    expect(text(element)).toContain("Delete “Dinner?” from this phone?");
    await press(element, "cancelDelete");
    expect(core.records.size).toBe(1);
    await press(element, "delete");
    await press(element, "confirmDelete");
    expect(core.records.size).toBe(0);
    expect(text(element)).toContain("No polls yet");
  });

  it("says when the phone has no room left, and keeps the poll on screen", async () => {
    const core = fakeCore({ quota: 900 });
    const element = await phone(core, { live: false });
    await create(element, "Where?", "text");
    for (let at = 0; at < 12; at += 1) await fill(element, "add", `a long option to fill the room ${at}`);
    expect(labels(element)).toHaveLength(12);
    expect(inside(element).querySelector("[data-warning]").textContent).toContain("No room left on this phone");
    core.quota = 1_000_000;
    await fill(element, "add", "fits now");
    expect(inside(element).querySelector("[data-warning]").textContent).toBe("");
  });

  it("speaks the phone's language, right to left in Arabic, the calendar too", async () => {
    const spanish = await phone(fakeCore({ lang: "es" }), { live: false });
    expect(text(spanish)).toContain("Todavía no hay encuestas");
    await create(spanish, "¿Cena?");
    await pick(spanish, "2026-10-12");
    expect(labels(spanish)).toEqual([new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(Date.UTC(2026, 9, 12))]);
    expect(inside(spanish).querySelector("calendar-multi").getAttribute("locale")).toBe("es");
    const arabic = await phone(fakeCore({ lang: "ar" }), { live: false });
    expect(arabic.getAttribute("dir")).toBe("rtl");
    await create(arabic, "متى؟");
    expect(inside(arabic).querySelector("calendar-multi").getAttribute("dir")).toBe("rtl");
    expect(spanish.getAttribute("dir")).toBe("ltr");
  });

  it("offers live only from a conversation, and says so otherwise; never speaks on its own", async () => {
    const alone = fakeCore();
    const element = await phone(alone, { live: false });
    await create(element, "Dinner?");
    expect(inside(element).querySelector('[data-act="live"]')).toBeNull();
    expect(text(element)).toContain("To vote together, open Poll from a conversation");
    const core = fakeCore();
    const inChat = await phone(core, { live: true, chat: CHAT_A });
    await create(inChat, "Dinner?");
    await pick(inChat, "2026-10-12");
    await press(inChat, "back");
    await press(inChat, "open");
    expect(inside(inChat).querySelector('[data-act="live"]')).not.toBeNull();
    expect(core.sent).toHaveLength(0);
  });
});

/** Two phones in one conversation, both with Poll open. */
async function twoPhones() {
  const coreA = fakeCore();
  const coreB = fakeCore();
  const link = connect(coreA, coreB);
  const a = await phone(coreA, { live: true, chat: CHAT_A });
  const b = await phone(coreB, { live: true, chat: CHAT_B });
  const idle = async () => {
    await link.idle();
    await settle(a, b);
  };
  return { coreA, coreB, link, a, b, idle };
}

/** A shares a date poll with two days. */
async function shared() {
  const phones = await twoPhones();
  const { a, idle } = phones;
  await create(a, "Dinner?");
  await pick(a, "2026-10-12", "2026-10-13");
  await press(a, "live");
  await idle();
  return phones;
}

describe("two phones", () => {
  it("go live: the other phone opens the poll by itself, and votes at the same time reach both", async () => {
    const { a, b, coreB, idle } = await shared();
    expect(b.poll?.id).toBe(a.poll.id);
    expect(inside(b).querySelector("[data-name]").textContent).toBe("Dinner?");
    expect(labels(b)).toEqual(["Mon, Oct 12", "Tue, Oct 13"]);
    expect(statusOf(a)).toContain("Live");
    expect(statusOf(b)).toContain("Live");
    await vote(a, "Mon, Oct 12", "yes");
    await vote(b, "Mon, Oct 12", "yes");
    await vote(b, "Tue, Oct 13", "no");
    await idle();
    expect(good(a, "Mon, Oct 12")).toBe(true);
    expect(good(b, "Mon, Oct 12")).toBe(true);
    expect(good(a, "Tue, Oct 13")).toBe(false);
    expect(text(a)).toContain("Good for both");
    expect(inside(a).querySelector(`[data-option="${optionId(a, "Tue, Oct 13")}"] .theirs`).getAttribute("aria-label")).toBe("The other person: Doesn't work for me");
    // The other phone can add a day; only the creator can close.
    await pick(b, "2026-10-12", "2026-10-13", "2026-10-20");
    await idle();
    expect(labels(a)).toEqual(["Mon, Oct 12", "Tue, Oct 13", "Tue, Oct 20"]);
    expect(inside(b).querySelector('[data-act="closePoll"]')).toBeNull();
    expect(text(b)).toContain("Only the person who created the poll can close it.");
    // The close reaches the other phone, which can save the day too.
    await press(a, "closePoll");
    await press(a, "choose", `[data-id="${optionId(a, "Mon, Oct 12")}"]`);
    await press(a, "confirmClose");
    await idle();
    expect(inside(b).querySelector("[data-banner]").textContent).toContain("Monday, October 12");
    await press(b, "icsSave");
    const file = new TextDecoder().decode(fromBase64(coreB.ft.save.mock.calls[0][2]));
    expect(file).toContain(`UID:${a.poll.id}@poll.flickertalk`);
    expect(file).toContain("DTSTART;VALUE=DATE:20261012");
    const kept = Poll.parse(b.poll.id, coreB.records.get(recordKey(CHAT_B, b.poll.id)));
    expect(kept.closed).not.toBeNull();
    expect(kept.shared).toBe(true);
  });

  it("keep what one did with the link down and join it when they meet again", async () => {
    const { a, b, link, idle } = await shared();
    link.down();
    await vote(a, "Mon, Oct 12", "yes");
    await vote(b, "Mon, Oct 12", "yes");
    await pick(b, "2026-10-12", "2026-10-13", "2026-10-21");
    await idle();
    expect(labels(a)).toEqual(["Mon, Oct 12", "Tue, Oct 13"]);
    expect(statusOf(a)).toContain("can't be reached");
    expect(statusOf(a)).toContain("Your votes stay on this phone");
    expect(good(a, "Mon, Oct 12")).toBe(false);
    link.up();
    await press(b, "live");
    await idle();
    expect(good(a, "Mon, Oct 12")).toBe(true);
    expect(good(b, "Mon, Oct 12")).toBe(true);
    expect(labels(a)).toEqual(["Mon, Oct 12", "Tue, Oct 13", "Wed, Oct 21"]);
    expect(statusOf(a)).toContain("Live");
  });

  it("say so when the other phone does not answer in 8 seconds, without pretending", async () => {
    vi.useFakeTimers();
    const { coreB, a, idle } = await twoPhones();
    coreB.shut();
    await create(a, "Dinner?");
    await press(a, "live");
    await idle();
    expect(statusOf(a)).toContain("Waiting");
    await vi.advanceTimersByTimeAsync(8000);
    await settle(a);
    expect(statusOf(a)).toContain("doesn't have Poll open in this conversation");
    expect(statusOf(a)).not.toContain("Live:");
  });

  it("catch up by themselves when one closes the plugin and comes back to the shared poll", async () => {
    const { coreB, a, b, idle } = await shared();
    const id = a.poll.id;
    await closeWindow(b, coreB);
    await idle();
    // Said as leaving the poll, never as closing it (closing is choosing the result).
    expect(statusOf(a)).toContain("doesn't have the poll open any more");
    expect(statusOf(a)).not.toMatch(/clos/i);
    await vote(a, "Mon, Oct 12", "yes");
    await idle();
    document.body.removeChild(b);
    coreB.reload();
    const again = await phone(coreB, { live: true, chat: CHAT_B });
    await press(again, "open", `[data-id="${id}"]`);
    await idle();
    expect(again.poll.answerOf(a.poll.who, optionId(again, "Mon, Oct 12"))).toBe("yes");
    expect(statusOf(again)).toContain("Live");
  });

  it("offer to join when the other opens a poll while this one is on another", async () => {
    const { a, b, idle } = await twoPhones();
    await create(b, "Mine");
    await create(a, "Dinner?");
    await press(a, "live");
    await idle();
    expect(b.poll.question).toBe("Mine");
    expect(inside(b).querySelector("[data-invite]").textContent).toContain("The other person opened “Dinner?”");
    await press(b, "join");
    await idle();
    expect(b.poll.id).toBe(a.poll.id);
    expect(statusOf(b)).toContain("Live");
  });

  it("ignore a hello whose poll id could not be a record key, or that resumes an unknown poll", async () => {
    const coreB = fakeCore();
    const b = await phone(coreB);
    for (const doc of ["a/b", "", "x".repeat(200), "has space"]) {
      await coreB.hear(encode({ p: FORMAT, v: VERSION, k: HELLO, doc, who: "w", app: "1.0.0", sv: "{}", title: "Evil" }));
    }
    await coreB.hear(encode({ p: FORMAT, v: VERSION, k: HELLO, doc: "unknown", who: "w", app: "1.0.0", sv: "{}", resume: true }));
    await coreB.hear("garbage");
    await settle(b);
    expect(b.poll).toBeNull();
    expect(coreB.records.size).toBe(0);
    expect(coreB.sent).toHaveLength(0);
    expect(text(b)).not.toContain("Evil");
  });

  it("say to update when the other phone speaks a newer version, and apply nothing", async () => {
    const { a, b, coreB } = await shared();
    const before = labels(b);
    await coreB.hear(encode({ p: FORMAT, v: VERSION + 1, k: UPDATE, doc: a.poll.id, who: a.poll.who, app: "2.0.0", u: "{}" }));
    await settle(b);
    expect(statusOf(b)).toContain("newer Poll");
    expect(labels(b)).toEqual(before);
  });

  it("send only small messages, in parts when a poll is big", async () => {
    const { a, b, link, idle } = await twoPhones();
    await create(a, "Where?", "text");
    // Many options added and removed (the state keeps the removed ones), made at once.
    const opts = [];
    for (let at = 0; at < 240; at += 1) opts.push({ id: `o${String(at).padStart(3, "0")}`, by: a.poll.who, gone: at < 180, text: `${"option ".repeat(12)}${at}` });
    a.poll.data.opts = opts;
    a.poll.changed("local");
    await settle(a);
    await press(a, "live");
    await idle();
    expect(b.poll.options()).toHaveLength(60);
    for (const { data } of link.carried) expect(atob(data).length).toBeLessThanOrEqual(48 * 1024);
    expect(link.carried.some(({ data }) => decode(data, FORMAT).k === "part")).toBe(true);
  });

});

describe("each conversation apart", () => {
  it("outside a conversation offers nothing for the chat, and the view stays alive", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false });
    await create(element, "Alone");
    await pick(element, "2026-10-12");
    expect(inside(element).querySelector('[data-act="send"]')).toBeNull();
    await press(element, "closePoll");
    await press(element, "choose");
    await press(element, "confirmClose");
    expect(inside(element).querySelector('[data-act="icsSend"]')).toBeNull();
    expect(inside(element).querySelector('[data-act="send"]')).toBeNull();
    await press(element, "icsSave");
    expect(core.ft.save).toHaveBeenCalledTimes(1);
    // Even if asked directly, nothing goes to a chat that is not there, and the poll stays on screen.
    await element.sendSummary();
    await element.sendCalendar();
    await settle(element);
    expect(core.ft.say).not.toHaveBeenCalled();
    expect(core.ft.send).not.toHaveBeenCalled();
    expect(element.poll?.question).toBe("Alone");
    await press(element, "back");
    expect(inside(element).querySelector('[data-act="open"] .title').textContent).toBe("Alone");
  });

  it("in a chat still offers 📤 and 📆 📤", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: true, chat: CHAT_A });
    await create(element, "Dinner?");
    await pick(element, "2026-10-12");
    expect(inside(element).querySelector('[data-act="send"]')).not.toBeNull();
    await press(element, "closePoll");
    await press(element, "choose");
    await press(element, "confirmClose");
    expect(inside(element).querySelector('[data-act="icsSend"]')).not.toBeNull();
  });

  it("shows in a chat only that chat's polls, and none of them outside a conversation", async () => {
    const core = fakeCore();
    const one = chat("One");
    const two = chat("Two");
    const reopen = async (opening) => {
      document.body.innerHTML = "";
      core.reload();
      return phone(core, opening);
    };
    let element = await phone(core, { live: true, chat: one });
    await create(element, "In one");
    const id = element.poll.id;
    expect([...core.records.keys()]).toEqual([`poll/${one}/${id}`]);
    element = await reopen({ live: true, chat: two });
    expect(text(element)).toContain("No polls yet");
    await create(element, "In two");
    element = await reopen({ live: false });
    expect(text(element)).toContain("No polls yet");
    element = await reopen({ live: true, chat: one });
    const titles = [...inside(element).querySelectorAll('[data-act="open"] .title')].map((node) => node.textContent);
    expect(titles).toEqual(["In one"]);
  });

  it("outside a conversation keeps polls on this phone only: no live, nothing sent, nothing heard", async () => {
    for (const opening of [{ live: false }, { live: true }, { live: true, chat: "too-short" }, { live: true, chat: `${chat("Bad")}`.slice(0, 42) + "/" }]) {
      document.body.innerHTML = "";
      const core = fakeCore();
      const element = await phone(core, opening);
      expect(text(element)).toContain("stay on this phone");
      await create(element, "Alone");
      await pick(element, "2026-10-12");
      expect([...core.records.keys()]).toEqual([`poll/local/${element.poll.id}`]);
      expect(inside(element).querySelector('[data-act="live"]')).toBeNull();
      await core.hear(encode({ p: FORMAT, v: VERSION, k: HELLO, doc: element.poll.id, who: "someone", app: "1.0.0", sv: "{}", resume: true }));
      await core.hear(encode({ p: FORMAT, v: VERSION, k: HELLO, doc: "another", who: "someone", app: "1.0.0", sv: "{}", title: "Hi" }));
      await settle(element);
      expect(element.poll.question).toBe("Alone");
      expect(text(element)).not.toContain("Hi");
      expect(core.sent).toHaveLength(0);
    }
  });

  it("the attack: a hello resuming another chat's poll with its creator's who gets nothing", async () => {
    // A shares X with C.
    const coreA = fakeCore();
    const coreC = fakeCore();
    const withA = chat("COfCWithA");
    const ac = connect(coreA, coreC);
    const a = await phone(coreA, { live: true, chat: CHAT_A });
    const c = await phone(coreC, { live: true, chat: withA });
    await create(a, "Dinner?");
    await pick(a, "2026-10-12");
    await press(a, "live");
    await ac.idle();
    await settle(a, c);
    await vote(c, "Mon, Oct 12", "yes");
    await ac.idle();
    await settle(a, c);
    const x = a.poll.id;
    const whoA = a.poll.who;
    const whoC = c.poll.who;
    const keptX = coreC.records.get(recordKey(withA, x));
    expect(Poll.parse(x, keptX).answerOf(whoC, "d20261012")).toBe("yes");
    // Later C opens Poll in the conversation with B, who learnt X's id and A's who.
    await closeWindow(c, coreC);
    document.body.innerHTML = "";
    coreC.reload();
    const coreB = fakeCore();
    connect(coreB, coreC);
    const withB = chat("COfCWithB");
    const cb = await phone(coreC, { live: true, chat: withB });
    const sent = coreC.sent.length;
    await coreC.hear(encode({ p: FORMAT, v: VERSION, k: HELLO, doc: x, who: whoA, app: "1.0.0", sv: "{}", resume: true }));
    await settle(cb);
    expect(coreC.sent.length).toBe(sent);
    expect(cb.poll).toBeNull();
    expect(coreC.records.get(recordKey(withA, x))).toBe(keptX);
    // A hello without resume makes a poll of its own in this chat, with nothing of C's other one.
    await coreC.hear(encode({ p: FORMAT, v: VERSION, k: HELLO, doc: x, who: whoA, app: "1.0.0", sv: "{}", title: "Dinner?" }));
    await settle(cb);
    expect(cb.poll.id).toBe(x);
    const replies = coreC.sent.slice(sent).map((data) => decode(data, FORMAT));
    expect(replies.map((one) => one.k)).toEqual(["sync"]);
    expect(replies[0].who).not.toBe(whoC);
    expect(JSON.parse(replies[0].sv).opts).toEqual([]);
    const forged = Poll.create({ kind: "dates", question: "Forged", who: whoA, id: x });
    forged.addOption("2026-10-12");
    const state = forged.state();
    state.votes[whoC] = { d20261012: { a: "no", t: 9e12 } };
    await coreC.hear(encode({ p: FORMAT, v: VERSION, k: "sync", doc: x, who: whoA, app: "1.0.0", u: JSON.stringify(state) }));
    await settle(cb);
    expect(cb.poll.question).toBe("Forged");
    expect(cb.poll.answerOf(whoC, "d20261012")).toBe("none");
    expect(coreC.records.get(recordKey(withA, x))).toBe(keptX);
    expect(Poll.parse(x, coreC.records.get(recordKey(withB, x))).question).toBe("Forged");
  });

  it("never lets the chat id leave the phone: not live, not in the state, not in the text or the file", async () => {
    const { a, b, coreA, coreB, link, idle } = await shared();
    const id = a.poll.id;
    await vote(a, "Mon, Oct 12", "yes");
    await vote(b, "Mon, Oct 12", "yes");
    await pick(b, "2026-10-12", "2026-10-13", "2026-10-20");
    await idle();
    await press(a, "closePoll");
    await press(a, "choose");
    await press(a, "confirmClose");
    await idle();
    await press(b, "icsSave");
    await press(b, "icsSend");
    await press(a, "send");
    await idle();
    const seen = [...coreA.said, ...coreB.said];
    const parts = new Map();
    for (const data of [...coreA.sent, ...coreB.sent, ...link.carried.map((one) => one.data)]) {
      seen.push(data);
      const text = new TextDecoder().decode(fromBase64(data));
      seen.push(text);
      const message = JSON.parse(text);
      if (message.k === "part") parts.set(message.id, `${parts.get(message.id) ?? ""}${message.data}`);
    }
    for (const whole of parts.values()) seen.push(new TextDecoder().decode(fromBase64(whole)));
    for (const [name, mime, data] of [...coreB.ft.save.mock.calls, ...coreB.ft.send.mock.calls]) seen.push(name, mime, data, new TextDecoder().decode(fromBase64(data)));
    expect(coreA.said).toHaveLength(1);
    expect(coreB.ft.send).toHaveBeenCalledTimes(1);
    const file = new TextDecoder().decode(fromBase64(coreB.ft.save.mock.calls[0][2]));
    expect(file).toContain(`UID:${id}@poll.flickertalk`);
    for (const secret of [CHAT_A, CHAT_B]) for (const one of seen) expect(one).not.toContain(secret);
  });
});

describe("the look", () => {
  it("follows the app's dark mode with an attribute WebKit understands, the system's as a fallback", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false, dark: true });
    expect(element.hasAttribute("dark")).toBe(true);
    await core.open({ live: false, dark: false });
    await flush();
    expect(element.hasAttribute("dark")).toBe(false);
    const css = inside(element).querySelector("style").textContent;
    expect(css).toContain("ft-poll[dark]");
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).not.toContain("host-context");
  });

  it("lays each option out as one row: what it is, then its actions together, the bin never alone", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false });
    await create(element, "Where?", "text");
    await fill(element, "add", "A rather long option that has to wrap onto a second line inside its own column");
    const dates = await phone(fakeCore(), { live: false });
    await create(dates, "Dinner?");
    await pick(dates, "2026-10-12");
    await vote(dates, "Mon, Oct 12", "yes");
    for (const one of [element, dates]) {
      for (const row of inside(one).querySelectorAll("[data-option]")) {
        // Two blocks only: what the option is (text or day, and its badge), and what can be done.
        expect([...row.children].map((child) => child.className)).toEqual(["what", "acts"]);
        const acts = row.querySelector(".acts");
        expect(acts.querySelector(".theirs")).not.toBeNull();
        expect(acts.querySelectorAll('[data-act="vote"]')).toHaveLength(3);
        expect(acts.querySelector('[data-act="removeOption"]')).not.toBeNull();
        expect(row.querySelector(".what .label")).not.toBeNull();
      }
    }
    const style = inside(element).querySelector("style").textContent;
    const rule = (selector) => style.match(new RegExp(`(?:^|\\n)(?:ft-poll )?${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    // The row may put the actions under the text, all together and at the end; they never split.
    expect(rule("li[data-option]")).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(".acts")).toMatch(/flex-wrap:\s*nowrap/);
    expect(rule(".acts")).toMatch(/flex:\s*none/);
    expect(rule(".acts")).toMatch(/margin-inline-start:\s*auto/);
    // The text takes what is left and wraps instead of being cut.
    expect(rule(".what")).toMatch(/flex:\s*1 1/);
    expect(rule(".what")).toMatch(/min-width:\s*0/);
    expect(rule(".label")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(style).not.toMatch(/\.label[^{]*\{[^}]*(ellipsis|nowrap)/);
  });

  it("can be made with createElement: its constructor adds no attribute (a browser refuses that)", () => {
    const element = document.createElement("ft-poll");
    expect(element.attributes).toHaveLength(0);
  });

  it("puts the whole question on its own line, the buttons on a wrapping row below it", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: true, chat: CHAT_A });
    const long = `${"Which film shall we watch on Friday night ".repeat(5)}`.slice(0, 200);
    await press(element, "kind", '[data-kind="text"]');
    await fill(element, "new", long);
    const header = inside(element).querySelector("[data-header]");
    const titleRow = header.querySelector(":scope > [data-title-row]");
    const actions = header.querySelector(":scope > [data-actions]");
    expect(titleRow).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(titleRow.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(titleRow.querySelector("[data-name]").textContent).toBe(long);
    expect(long).toHaveLength(200);
    expect(titleRow.querySelector("button, ion-button")).toBeNull();
    for (const act of ["back", "live", "send"]) expect(actions.querySelector(`[data-act="${act}"]`), act).not.toBeNull();
    const css = [...inside(element).querySelectorAll("style")].map((one) => one.textContent).join("\n");
    expect(css).not.toContain("ellipsis");
    expect(css).toMatch(/\.actions\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/button\s*\{[^}]*min-width:\s*44px[^}]*\}/);
    expect(css).toMatch(/button\s*\{[^}]*min-height:\s*44px[^}]*\}/);
    expect(css).toMatch(/h1\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).not.toMatch(/h1\s*\{[^}]*nowrap/);
  });

  it("keeps the content to a comfortable width on a tablet, centred", () => {
    const element = document.createElement("ft-poll");
    document.body.append(element);
    const style = inside(element).querySelector("style").textContent;
    expect(style).toMatch(/\.view\s*\{[^}]*max-inline-size:\s*640px/);
    expect(style).toMatch(/\.view\s*\{[^}]*margin-inline:\s*auto/);
  });

  it("lets the calendar fill the width, in either direction", () => {
    const css = document.createElement("ft-poll");
    document.body.append(css);
    const style = inside(css).querySelector("style").textContent;
    expect(style).toMatch(/calendar-multi\s*\{[^}]*inline-size:\s*100%/);
    expect(style).toMatch(/calendar-month\s*\{[^}]*inline-size:\s*100%/);
    expect(style).toMatch(/calendar-month::part\(table\)\s*\{[^}]*inline-size:\s*100%/);
    expect(style).not.toMatch(/\b(margin|padding)-(left|right)\b|\b(left|right):/);
  });
});

describe("with the Ionic the app lends", () => {
  it("asks for an app that lends Ionic", () => {
    expect(manifest.minCoreVersion).toBe("1.6.0");
  });

  it("draws the polls in the page, in Ionic's header and content, with no close of its own", async () => {
    const element = await phone(fakeCore(), { live: true, chat: CHAT_A });
    expect(element.shadowRoot).toBe(null);
    expect(element.querySelector(":scope > ion-header > ion-toolbar > ion-title").textContent).toBe("Polls");
    expect(element.querySelector(':scope > ion-content .view [data-entry="new"]')).not.toBeNull();
    expect(element.querySelector('[data-act="close"]')).toBeNull();
    expect(element.querySelector('[data-entry="new"] [data-act="create"]').tagName).toBe("ION-BUTTON");
    // The kind of poll: two Ionic buttons, the chosen one filled and pressed.
    const kind = (name) => element.querySelector(`ion-button[data-act="kind"][data-kind="${name}"]`);
    expect(kind("dates").getAttribute("fill")).toBe("solid");
    expect(kind("text").getAttribute("fill")).toBe("outline");
    await press(element, "kind", '[data-kind="text"]');
    expect(kind("text").getAttribute("fill")).toBe("solid");
  });

  it("draws a poll with its question and its buttons in two toolbars of the header, Ionic buttons with labels", async () => {
    const { a } = await shared();
    const header = a.querySelector(":scope > ion-header[data-header]");
    expect(header.querySelector(":scope > ion-toolbar[data-title-row] [data-name]").textContent).toBeTruthy();
    const actions = header.querySelector(":scope > ion-toolbar[data-actions]");
    for (const act of ["back", "live", "send"]) {
      const button = actions.querySelector(`ion-button[data-act="${act}"]`);
      expect(button, act).not.toBeNull();
      expect(label(button), act).toBeTruthy();
    }
    const live = actions.querySelector('ion-button[data-act="live"]');
    expect(live.getAttribute("fill")).toBe("solid");
    expect(live.getAttribute("aria-pressed") ?? live.shadowRoot?.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
    expect(a.querySelector(":scope > ion-content [data-options]")).not.toBeNull();
    expect(a.querySelector('ion-content ion-button[data-act="closePoll"]')).not.toBeNull();
  });

  it("says goodbye to the other phone when the app's window closes", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false });
    await create(element, "Dinner?");
    let left = 0;
    const leave = element.leave.bind(element);
    element.leave = async () => ((left += 1), leave());
    await closeWindow(element, core);
    expect(left).toBe(1);
  });
});

describe("the icons", () => {
  it("draws no emoji on any screen, only Ionicons lent by the app or carried, and every button says what it does", async () => {
    const screens = [];
    const look = (element, what) => {
      const root = inside(element);
      screens.push([what, root.innerHTML]);
      for (const one of root.querySelectorAll("button, ion-button")) {
        const said = label(one) || one.textContent.trim();
        expect(said, `${what}: ${one.outerHTML.slice(0, 120)}`).toBeTruthy();
      }
    };
    // One phone, outside a conversation.
    const core = fakeCore();
    const alone = await phone(core, { live: false });
    look(alone, "home, empty, local");
    await create(alone, "Dinner?");
    look(alone, "date poll, no days");
    await pick(alone, "2026-10-12", "2026-10-13");
    await vote(alone, "Mon, Oct 12", "yes");
    await vote(alone, "Tue, Oct 13", "maybe");
    look(alone, "date poll with votes");
    await press(alone, "closePoll");
    look(alone, "choosing");
    await press(alone, "choose");
    look(alone, "confirming");
    await press(alone, "confirmClose");
    look(alone, "closed");
    await press(alone, "icsSave");
    look(alone, "calendar saved");
    core.ft.save.mockResolvedValueOnce(false);
    await press(alone, "icsSave");
    look(alone, "calendar not saved");
    alone.keeper.full = true;
    alone.paintWarning();
    look(alone, "no room");
    await press(alone, "back");
    look(alone, "home with a closed poll");
    await create(alone, "Where?", "text");
    await fill(alone, "add", "Sushi");
    look(alone, "text poll");
    alone.show(Poll.received("abc"));
    look(alone, "waiting for a poll");
    const newer = Poll.create({ kind: "text", question: "Newer" });
    newer.data.schema = 2;
    alone.show(newer);
    look(alone, "read only");
    // Two phones in a conversation, through every live state.
    const { a, b, idle } = await shared();
    await vote(a, "Mon, Oct 12", "no");
    await vote(a, "Tue, Oct 13", "yes");
    await vote(b, "Tue, Oct 13", "yes");
    await idle();
    look(a, "live, one good for both");
    for (const status of ["waiting", "joined", "silent", "unreachable", "left", "outdated"]) {
      a.status = status;
      a.paintStatus();
      look(a, `status ${status}`);
    }
    b.invite = { name: "Other", message: null };
    b.paintInvite();
    look(b, "invite");
    const lent = new Set();
    const drawn = new Set();
    for (const [what, html] of screens) {
      expect(html, what).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(html, `${what}: a form, which the sandboxed frame blocks on Android`).not.toMatch(/<form\b/i);
      for (const match of html.matchAll(/\.\/icon\/([a-z-]+)\.svg/g)) lent.add(match[1]);
      for (const match of html.matchAll(/data-icon="([a-z-]+)"/g)) drawn.add(match[1]);
    }
    for (const name of lent) expect(APP_ICONS, name).toContain(name);
    for (const name of drawn) expect([...APP_ICONS, ...Object.keys(OWN_ICONS)], name).toContain(name);
    for (const name of ["sync-outline", "calendar-outline", "list-outline", "flag-outline", "star-outline", "checkmark-circle", "help-circle-outline", "close-circle-outline", "person-outline", "cloud-offline-outline", "alert-circle-outline", "download-outline", "send-outline"]) {
      expect(drawn, name).toContain(name);
    }
  });

  it("marks the chosen vote by shape as well as colour", async () => {
    const element = await phone(fakeCore(), { live: false });
    await create(element, "Dinner?");
    await pick(element, "2026-10-12");
    await vote(element, "Mon, Oct 12", "maybe");
    const row = inside(element).querySelector(`[data-option="${optionId(element, "Mon, Oct 12")}"]`);
    const shapes = Object.fromEntries([...row.querySelectorAll('[data-act="vote"]')].map((one) => [one.dataset.answer, one.querySelector("[data-icon]").dataset.icon]));
    expect(shapes).toEqual({ yes: "checkmark-circle-outline", maybe: "help-circle", no: "close-circle-outline" });
  });
});

