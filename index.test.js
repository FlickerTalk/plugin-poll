// The plugin as the user sees it (plan-plugins-nuevos §12), against the fake core: a poll of dates
// or of texts; ✅ / 🤔 / ❌; anyone adds options; whoever created it closes it choosing one; 📤
// proposes the result; 📆 hands the chosen day to the calendar as an .ics file; the 21 languages;
// and two phones in one conversation voting live, losing each other and meeting again.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarFile } from "./src/ics.js";
import { FORMAT } from "./src/index.js";
import { HELLO, UPDATE, VERSION, decode, encode, fromBase64 } from "./src/live.js";
import { Poll, recordKey } from "./src/poll.js";
import { connect, fakeCore } from "./test/fake-core.js";

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "module.json"), "utf8"));

const flush = async () => {
  for (let at = 0; at < 60; at += 1) await Promise.resolve();
};

/** One phone with the plugin open: `live` when opened from a conversation with it granted. */
async function phone(core, opening = { live: true }) {
  globalThis.ft = core.ft;
  const element = document.createElement("ft-poll");
  document.body.append(element);
  await core.open(opening);
  await flush();
  return element;
}

const inside = (element) => element.shadowRoot;
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
async function fill(element, form, value) {
  const node = inside(element).querySelector(`form[data-form="${form}"]`);
  if (!node) throw new Error(`no form ${form}`);
  node.querySelector("input").value = value;
  node.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
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
  it("asks for live and to propose, nothing more, on core 1.1.0", () => {
    expect(manifest).toEqual({
      id: "com.flickertalk.poll",
      name: "Poll",
      version: "1.0.0",
      minCoreVersion: "1.1.0",
      components: ["ft-poll"],
      permissions: { live: true, send: "propose" },
      summary: expect.any(String),
    });
    expect(manifest.summary.length).toBeLessThanOrEqual(200);
    expect(FORMAT).toBe("ftpoll");
  });
});

describe("one phone", () => {
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
    const kept = Poll.parse(element.poll.id, core.records.get(recordKey(element.poll.id)));
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
    expect(inside(element).querySelector("[data-banner]").textContent).toContain("🏁 Chosen: Monday, October 12");
    expect(inside(element).querySelector('[data-act="vote"]')).toBeNull();
    expect(inside(element).querySelector("[data-picker]")).toBeNull();
    expect(globalThis.confirm).not.toHaveBeenCalled();
    delete globalThis.confirm;
  });

  it("proposes the result as text in the chat", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false });
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
    const element = await phone(core, { live: false });
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
    const inChat = await phone(core, { live: true });
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
  const a = await phone(coreA);
  const b = await phone(coreB);
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
    expect(text(a)).toContain("✅ Good for both");
    expect(inside(a).querySelector(`[data-option="${optionId(a, "Tue, Oct 13")}"] .theirs`).getAttribute("aria-label")).toBe("The other person: ❌");
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
    const kept = Poll.parse(b.poll.id, coreB.records.get(recordKey(b.poll.id)));
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
    await press(b, "close");
    await idle();
    expect(statusOf(a)).toContain("closed the poll");
    await vote(a, "Mon, Oct 12", "yes");
    await idle();
    document.body.removeChild(b);
    coreB.reload();
    const again = await phone(coreB);
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
    // Many options added and removed: the state keeps the removed ones.
    for (let round = 0; round < 4; round += 1) {
      const ids = [];
      for (let at = 0; at < 60; at += 1) ids.push(a.poll.addOption(`${"option ".repeat(12)}${round}-${at}`));
      for (const id of ids.slice(0, round < 3 ? 60 : 0)) a.poll.removeOption(id);
    }
    await settle(a);
    await press(a, "live");
    await idle();
    expect(b.poll.options()).toHaveLength(60);
    for (const { data } of link.carried) expect(atob(data).length).toBeLessThanOrEqual(48 * 1024);
    expect(link.carried.some(({ data }) => decode(data, FORMAT).k === "part")).toBe(true);
  });
});
