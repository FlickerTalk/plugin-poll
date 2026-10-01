// A poll (plan-plugins-nuevos §12): a question with text or date options; each participant marks
// ✅ / 🤔 / ❌; anyone adds options; whoever created it closes it by choosing one. The whole state
// travels, no Yjs, and two states join with a merge that must give the same result in any order
// and when applied twice: options by union (`gone` is never undone), each participant's votes by
// time, the first close. What comes from the twin is untrusted: the envelope's `who` decides
// what it may write.
import { describe, expect, it } from "vitest";
import { MAX_OPTION, MAX_OPTIONS, MAX_QUESTION, Poll, canonical, emptyState, merge, normalise } from "../src/poll.js";

const ME = "me-1";
const YOU = "you-2";
const OTHER = "third-3";

/** A poll created by `who`, with a fixed clock so votes are ordered. */
function made({ kind = "dates", question = "Dinner?", who = ME, clock } = {}) {
  let now = 1_000;
  return Poll.create({ kind, question, who, now: clock ?? (() => (now += 10)) });
}

/** The poll as the twin gets it: an empty one on its side, filled with what the creator sends. */
function twinOf(poll, who = YOU) {
  const twin = Poll.received(poll.id, { who });
  twin.take(poll.state(), poll.who);
  return twin;
}

describe("a new poll", () => {
  it("has a question, a kind, its creator and nothing else yet", () => {
    const poll = made({ question: "  Dinner   on Friday?  " });
    expect(poll.question).toBe("Dinner on Friday?");
    expect(poll.kind).toBe("dates");
    expect(poll.creator).toBe(ME);
    expect(poll.isMine).toBe(true);
    expect(poll.options()).toEqual([]);
    expect(poll.closed).toBeNull();
    expect(Poll.create({ kind: "text", question: "x".repeat(500), who: ME }).question).toHaveLength(MAX_QUESTION);
    expect(() => Poll.create({ kind: "hours", question: "x", who: ME })).toThrow();
    expect(() => Poll.create({ kind: "text", question: "   ", who: ME })).toThrow();
  });

  it("is kept as one record and read back the same", () => {
    const poll = made();
    poll.addOption("2026-10-12");
    poll.vote(poll.options()[0].id, "yes");
    poll.peer = YOU;
    poll.shared = true;
    const back = Poll.parse(poll.id, poll.record());
    expect(canonical(back.state())).toBe(canonical(poll.state()));
    expect(back).toMatchObject({ id: poll.id, who: ME, peer: YOU, shared: true });
    expect(Poll.parse(poll.id, "{broken")).toBeNull();
    expect(Poll.parse(poll.id, JSON.stringify({ poll: { q: 5 } }))).toBeNull();
  });
});

describe("options", () => {
  it("of a date poll are real days, once each, in calendar order", () => {
    const poll = made();
    expect(poll.addOption("2026-10-14")).toBeTruthy();
    expect(poll.addOption("2026-10-12")).toBe("d20261012");
    expect(poll.addOption("2026-10-12")).toBeNull();
    expect(poll.addOption("2026-02-30")).toBeNull();
    expect(poll.addOption("tomorrow")).toBeNull();
    expect(poll.options().map((one) => one.date)).toEqual(["2026-10-12", "2026-10-14"]);
  });

  it("of a text poll are short texts, once each, in the order they were added", () => {
    const poll = made({ kind: "text", question: "Where?" });
    poll.addOption("  Pizza   place ");
    poll.addOption("Sushi");
    expect(poll.addOption("Sushi")).toBeNull();
    expect(poll.addOption("   ")).toBeNull();
    expect(poll.addOption("2026-10-12")).toBeTruthy();
    poll.addOption("y".repeat(300));
    expect(poll.options().map((one) => one.text)).toEqual(["Pizza place", "Sushi", "2026-10-12", "y".repeat(MAX_OPTION)]);
  });

  it("stop at the cap", () => {
    const poll = made({ kind: "text" });
    for (let at = 0; at < MAX_OPTIONS + 5; at += 1) poll.addOption(`option ${at}`);
    expect(poll.options()).toHaveLength(MAX_OPTIONS);
  });

  it("are removed only by whoever added them, and a removed day can be added again", () => {
    const poll = made();
    const mine = poll.addOption("2026-10-12");
    const twin = twinOf(poll);
    const theirs = twin.addOption("2026-10-13");
    poll.take(twin.state(), YOU);
    expect(poll.removeOption(theirs)).toBe(false);
    expect(poll.removeOption(mine)).toBe(true);
    expect(poll.options().map((one) => one.date)).toEqual(["2026-10-13"]);
    const again = poll.addOption("2026-10-12");
    expect(again).toBeTruthy();
    expect(again).not.toBe(mine);
    expect(poll.options().map((one) => one.date)).toEqual(["2026-10-12", "2026-10-13"]);
  });
});

describe("votes", () => {
  it("are ✅, 🤔, ❌ or none; the latest of each participant wins, even if the clock goes back", () => {
    let now = 5_000;
    const poll = made({ clock: () => now });
    const day = poll.addOption("2026-10-12");
    expect(poll.vote(day, "yes")).toBe(true);
    expect(poll.answerOf(ME, day)).toBe("yes");
    now = 4_000;
    poll.vote(day, "no");
    expect(poll.answerOf(ME, day)).toBe("no");
    poll.vote(day, "none");
    expect(poll.answerOf(ME, day)).toBe("none");
    expect(poll.vote(day, "perhaps")).toBe(false);
    expect(poll.vote("nothing", "yes")).toBe(false);
    expect(poll.tally(day)).toEqual({ yes: 0, maybe: 0, no: 0 });
  });

  it("say which options are good for both: ✅ from the two of them", () => {
    const poll = made();
    const a = poll.addOption("2026-10-12");
    const b = poll.addOption("2026-10-13");
    poll.vote(a, "yes");
    poll.vote(b, "yes");
    expect(poll.goodForAll(a)).toBe(false);
    const twin = twinOf(poll);
    twin.vote(a, "yes");
    twin.vote(b, "maybe");
    poll.take(twin.state(), YOU);
    expect(poll.participants()).toEqual([ME, YOU].sort());
    expect(poll.goodForAll(a)).toBe(true);
    expect(poll.goodForAll(b)).toBe(false);
    expect(poll.tally(a)).toEqual({ yes: 2, maybe: 0, no: 0 });
    expect(poll.tally(b)).toEqual({ yes: 1, maybe: 1, no: 0 });
  });
});

describe("closing", () => {
  it("is for whoever created the poll, choosing an option, once", () => {
    const poll = made();
    const a = poll.addOption("2026-10-12");
    const b = poll.addOption("2026-10-13");
    const twin = twinOf(poll);
    expect(twin.close(a)).toBe(false);
    expect(poll.close("nothing")).toBe(false);
    expect(poll.close(a)).toBe(true);
    expect(poll.close(b)).toBe(false);
    expect(poll.closed).toMatchObject({ opt: a, by: ME });
    expect(poll.chosen()).toMatchObject({ id: a, date: "2026-10-12" });
    // Closed: no more votes, options or removals.
    expect(poll.vote(a, "no")).toBe(false);
    expect(poll.addOption("2026-10-20")).toBeNull();
    expect(poll.removeOption(a)).toBe(false);
  });
});

describe("the state that travels", () => {
  it("is read only when it is well formed, within its limits", () => {
    const good = made();
    good.addOption("2026-10-12");
    expect(() => normalise(good.state())).not.toThrow();
    const base = good.state();
    const bad = [
      null,
      "text",
      [],
      { ...base, q: 5 },
      { ...base, q: "x".repeat(MAX_QUESTION + 1) },
      { ...base, kind: "hours" },
      { ...base, by: "has space" },
      { ...base, opts: "no" },
      { ...base, opts: [{ id: "a/b", by: ME, date: "2026-10-12", gone: false }] },
      { ...base, opts: [{ id: "x", by: ME, date: "2026-02-30", gone: false }] },
      { ...base, opts: [{ id: "x", by: ME, date: "2026-10-12", gone: "no" }] },
      { ...base, opts: Array.from({ length: 300 }, (_, at) => ({ id: `o${at}`, by: ME, date: "2026-10-12", gone: false })) },
      { ...base, votes: [] },
      { ...base, votes: { "bad id!": {} } },
      { ...base, closed: { opt: "nothing", by: ME, t: 1 } },
      { ...emptyState(), opts: base.opts },
    ];
    for (const one of bad) expect(() => normalise(one), JSON.stringify(one)?.slice(0, 80)).toThrow();
  });

  it("drops what a newer version may add and this one does not know, instead of failing", () => {
    const poll = made();
    const day = poll.addOption("2026-10-12");
    const state = poll.state();
    state.extra = { anything: true };
    state.votes = { [ME]: { [day]: { a: "later", t: 3 } }, [YOU]: { [day]: { a: "yes", t: 4 }, ghost: { a: "yes", t: 4 } } };
    const read = normalise(state);
    expect(read.extra).toBeUndefined();
    expect(read.votes).toEqual({ [YOU]: { [day]: { a: "yes", t: 4 } } });
  });
});

// ---- The merge, as a property: random states over shared ids, in any order, applied twice ----

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const DAYS = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"];
const IDS = ["o1", "o2", "o3", "o4", "o5"];
const VOTERS = ["v1", "v2", "v3"];

/** One replica's view: the same header, a random part of the options and votes. */
function randomState(rand) {
  const state = { ...emptyState(), q: "When?", kind: "dates", by: "v1" };
  for (const id of IDS) {
    if (rand() < 0.6) state.opts.push({ id, by: pick(rand, VOTERS), date: pick(rand, DAYS), gone: rand() < 0.3 });
  }
  for (const voter of VOTERS) {
    for (const option of state.opts) {
      if (rand() < 0.5) {
        state.votes[voter] ??= {};
        state.votes[voter][option.id] = { a: pick(rand, ["yes", "maybe", "no", "none"]), t: Math.floor(rand() * 4) };
      }
    }
  }
  if (state.opts.length && rand() < 0.3) state.closed = { opt: pick(rand, state.opts).id, by: "v1", t: Math.floor(rand() * 3) };
  return normalise(state);
}

describe("the merge", () => {
  it("is commutative, associative and idempotent", () => {
    const rand = random(42);
    for (let round = 0; round < 400; round += 1) {
      const a = randomState(rand);
      const b = randomState(rand);
      const c = randomState(rand);
      expect(canonical(merge(a, b))).toBe(canonical(merge(b, a)));
      expect(canonical(merge(merge(a, b), c))).toBe(canonical(merge(a, merge(b, c))));
      expect(canonical(merge(a, a))).toBe(canonical(a));
      expect(canonical(merge(merge(a, b), b))).toBe(canonical(merge(a, b)));
    }
  });

  it("unites options, never undoes a removal, keeps each one's latest vote and the first close", () => {
    const a = normalise({
      ...emptyState(),
      q: "When?",
      kind: "dates",
      by: "v1",
      opts: [
        { id: "o1", by: "v1", date: "2026-10-12", gone: false },
        { id: "o2", by: "v1", date: "2026-10-13", gone: true },
      ],
      votes: { v1: { o1: { a: "yes", t: 5 } } },
      closed: { opt: "o1", by: "v1", t: 9 },
    });
    const b = normalise({
      ...emptyState(),
      q: "When?",
      kind: "dates",
      by: "v1",
      opts: [
        { id: "o2", by: "v1", date: "2026-10-13", gone: false },
        { id: "o3", by: "v2", date: "2026-10-14", gone: false },
      ],
      votes: { v1: { o1: { a: "no", t: 4 } }, v2: { o3: { a: "yes", t: 1 } } },
      closed: { opt: "o3", by: "v1", t: 7 },
    });
    const both = merge(a, b);
    expect(both.opts.map((one) => [one.id, one.gone])).toEqual([
      ["o1", false],
      ["o2", true],
      ["o3", false],
    ]);
    expect(both.votes).toEqual({ v1: { o1: { a: "yes", t: 5 } }, v2: { o3: { a: "yes", t: 1 } } });
    expect(both.closed).toEqual({ opt: "o3", by: "v1", t: 7 });
  });
});

describe("what the twin sends", () => {
  it("joins two polls edited apart into the same poll on both sides, in any order, twice", () => {
    const poll = made();
    const a = poll.addOption("2026-10-12");
    const twin = twinOf(poll);
    // Apart: each votes and adds.
    poll.vote(a, "yes");
    const mine = poll.addOption("2026-10-20");
    twin.vote(a, "maybe");
    const theirs = twin.addOption("2026-10-21");
    twin.vote(theirs, "yes");
    const fromMe = poll.state();
    const fromYou = twin.state();
    expect(poll.take(fromYou, YOU)).toBe(true);
    expect(twin.take(fromMe, ME)).toBe(true);
    expect(canonical(poll.state())).toBe(canonical(twin.state()));
    expect(poll.take(fromYou, YOU)).toBe(false);
    expect(poll.options().map((one) => one.id)).toEqual([a, mine, theirs]);
    expect(poll.answerOf(YOU, a)).toBe("maybe");
  });

  it("cannot write anyone's votes but the sender's own", () => {
    const poll = made();
    const a = poll.addOption("2026-10-12");
    poll.vote(a, "no");
    const forged = poll.state();
    forged.votes = { [ME]: { [a]: { a: "yes", t: 9e12 } }, [OTHER]: { [a]: { a: "yes", t: 1 } }, [YOU]: { [a]: { a: "yes", t: 1 } } };
    poll.take(forged, YOU);
    expect(poll.answerOf(ME, a)).toBe("no");
    expect(poll.answerOf(OTHER, a)).toBe("none");
    expect(poll.answerOf(YOU, a)).toBe("yes");
  });

  it("cannot add an option in someone else's name, nor remove someone else's", () => {
    const poll = made();
    const a = poll.addOption("2026-10-12");
    const forged = poll.state();
    forged.opts = [
      { id: a, by: ME, date: "2026-10-12", gone: true },
      { id: "x1", by: ME, date: "2026-10-30", gone: false },
      { id: "x2", by: OTHER, date: "2026-10-31", gone: false },
      { id: "x3", by: YOU, date: "2026-11-01", gone: false },
    ];
    poll.take(forged, YOU);
    expect(poll.options().map((one) => one.id)).toEqual([a, "x3"]);
  });

  it("cannot close the poll unless it is its creator, nor change its question", () => {
    const poll = made();
    const a = poll.addOption("2026-10-12");
    const forged = poll.state();
    forged.closed = { opt: a, by: ME, t: 1 };
    forged.q = "Something else?";
    forged.by = YOU;
    poll.take(forged, YOU);
    expect(poll.closed).toBeNull();
    expect(poll.question).toBe("Dinner?");
    expect(poll.creator).toBe(ME);
    // The creator's own close does arrive.
    const twin = twinOf(poll);
    poll.close(a);
    twin.take(poll.state(), ME);
    expect(twin.closed).toMatchObject({ opt: a, by: ME });
    expect(twin.isMine).toBe(false);
  });

  it("gives a received poll its question only from the one who created it", () => {
    const poll = made();
    const stranger = Poll.received(poll.id, { who: YOU });
    expect(stranger.take(poll.state(), OTHER)).toBe(false);
    expect(stranger.hasHeader).toBe(false);
    expect(stranger.take(poll.state(), ME)).toBe(true);
    expect(stranger.question).toBe("Dinner?");
  });

  it("tells who changed it: this phone or the twin", () => {
    const poll = made();
    const heard = [];
    poll.onChange((origin) => heard.push(origin));
    const a = poll.addOption("2026-10-12");
    const twin = twinOf(poll);
    twin.vote(a, "yes");
    poll.take(twin.state(), YOU);
    poll.take(twin.state(), YOU);
    expect(heard).toEqual(["local", "live"]);
  });
});
