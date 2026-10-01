// Keeping polls in `ft.records` (plan-plugins-nuevos §12: `poll/<id>`): on every change, because
// the plugin is never told it is being closed; one write after another; a full quota says so
// without losing what is on screen; and a received poll is not kept until its question arrives.
import { describe, expect, it } from "vitest";
import { Poll, canonical, recordKey } from "../src/poll.js";
import { Keeper } from "../src/store.js";
import { fakeCore } from "./fake-core.js";

const kept = (core, id) => Poll.parse(id, core.records.get(recordKey(id)));

describe("the keeper", () => {
  it("writes a poll on every change, its own and the twin's", async () => {
    const core = fakeCore();
    const keeper = new Keeper(core.ft.records);
    const poll = Poll.create({ kind: "dates", question: "Dinner?" });
    keeper.watch(poll);
    await keeper.save(poll);
    expect(kept(core, poll.id).question).toBe("Dinner?");
    const day = poll.addOption("2026-10-12");
    poll.vote(day, "yes");
    await keeper.settled();
    expect(canonical(kept(core, poll.id).state())).toBe(canonical(poll.state()));
    const twin = Poll.received(poll.id);
    twin.take(poll.state(), poll.who);
    twin.vote(day, "maybe");
    poll.take(twin.state(), twin.who);
    await keeper.settled();
    expect(kept(core, poll.id).answerOf(twin.who, day)).toBe("maybe");
    // Many changes at once: never two writes at a time, the last state kept.
    for (let at = 0; at < 10; at += 1) poll.addOption(`2026-11-${String(at + 10)}`);
    await keeper.settled();
    expect(kept(core, poll.id).options()).toHaveLength(11);
    expect(core.ft.records.set.mock.calls.length).toBeLessThan(15);
  });

  it("does not keep a received poll until its question has arrived", async () => {
    const core = fakeCore();
    const keeper = new Keeper(core.ft.records);
    const empty = Poll.received("abc");
    keeper.watch(empty);
    expect(await keeper.save(empty)).toBe(true);
    expect(core.records.size).toBe(0);
    const poll = Poll.create({ kind: "text", question: "Where?", id: "abc" });
    empty.take(poll.state(), poll.who);
    await keeper.settled();
    expect(kept(core, "abc").question).toBe("Where?");
  });

  it("says when the quota is full, keeps the poll on screen, and recovers", async () => {
    const core = fakeCore({ quota: 900 });
    const keeper = new Keeper(core.ft.records);
    const states = [];
    keeper.onFull((full) => states.push(full));
    const poll = Poll.create({ kind: "text", question: "Where?" });
    keeper.watch(poll);
    await keeper.save(poll);
    expect(keeper.full).toBe(false);
    for (let at = 0; at < 20; at += 1) poll.addOption(`a long option to fill the quota ${at}`);
    await keeper.settled();
    expect(keeper.full).toBe(true);
    expect(states).toEqual([true]);
    expect(poll.options()).toHaveLength(20);
    expect(kept(core, poll.id)).not.toBeNull();
    core.quota = 1_000_000;
    poll.addOption("room again");
    await keeper.settled();
    expect(keeper.full).toBe(false);
    expect(states).toEqual([true, false]);
    expect(kept(core, poll.id).options()).toHaveLength(21);
  });

  it("treats a core that fails as full, not as saved", async () => {
    const core = fakeCore();
    core.ft.records.set = async () => {
      throw new Error("gone");
    };
    const keeper = new Keeper(core.ft.records);
    expect(await keeper.save(Poll.create({ kind: "text", question: "x" }))).toBe(false);
    expect(keeper.full).toBe(true);
  });

  it("lists what is kept, newest first, skipping what is broken, and forgets a poll", async () => {
    const core = fakeCore();
    const keeper = new Keeper(core.ft.records);
    const old = Poll.create({ kind: "text", question: "Old", id: "a" });
    old.updatedAt = 1;
    const recent = Poll.create({ kind: "dates", question: "Recent", id: "b" });
    await keeper.save(old);
    await keeper.save(recent);
    core.records.set(recordKey("c"), "{broken");
    core.records.set("something/else", "1");
    const index = await keeper.index();
    expect(index.map((one) => one.id)).toEqual(["b", "a"]);
    expect(index[0]).toMatchObject({ id: "b", question: "Recent", kind: "dates", closed: false, shared: false });
    expect((await keeper.load("b")).question).toBe("Recent");
    expect(await keeper.load("c")).toBeNull();
    expect(await keeper.load("nothing")).toBeNull();
    await keeper.forget("b");
    expect(core.records.has(recordKey("b"))).toBe(false);
  });
});
