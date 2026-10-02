// A poll as the replica of the common live protocol (`live.js`): the whole state travels as `u`
// inside `sync`/`update`, `have` is the whole state too, and what arrives is taken as the
// envelope's `who`. Two phones against the fake core: going live, voting at the same time, one
// with the link down that joins when it comes back, and a twin that tries to write for others.
import { describe, expect, it } from "vitest";
import { HELLO, Inbox, LiveSession, SYNC, UPDATE, VERSION, decode, encode, inOrder } from "../src/live.js";
import { pollReplica } from "../src/live-poll.js";
import { Poll, canonical } from "../src/poll.js";
import { connect, fakeCore } from "./fake-core.js";

const FORMAT = "ftpoll";

/** One phone wired as the plugin wires it: one inbox, the envelope's `who` handed to the replica. */
function phone(core, poll) {
  const inbox = new Inbox(FORMAT);
  const replica = pollReplica(poll);
  const statuses = [];
  let session = null;
  const make = () =>
    new LiveSession({
      format: FORMAT,
      app: "1.0.0",
      doc: poll.id,
      who: poll.who,
      peer: poll.peer,
      replica,
      send: (data) => core.ft.live.send(data),
      onStatus: (status) => statuses.push(status),
      onPeer: (who) => {
        poll.peer = who;
      },
    });
  core.ft.live.onMessage(
    inOrder(async (data) => {
      const message = inbox.take(data);
      if (!message || message.doc !== poll.id) return;
      if (!session) {
        if (message.k !== HELLO) return;
        session = make();
      }
      replica.from(message.who);
      await session.hear(message);
    }),
  );
  return {
    poll,
    statuses,
    get session() {
      return session;
    },
    start(options) {
      session ??= make();
      return session.start(options);
    },
  };
}

async function pair() {
  const coreA = fakeCore();
  const coreB = fakeCore();
  await coreA.open({ live: true });
  await coreB.open({ live: true });
  const link = connect(coreA, coreB);
  let now = 1_000;
  const poll = Poll.create({ kind: "dates", question: "Dinner?", now: () => (now += 1) });
  poll.addOption("2026-10-12");
  poll.addOption("2026-10-13");
  const a = phone(coreA, poll);
  const b = phone(coreB, Poll.received(poll.id, { now: () => (now += 1) }));
  return { coreA, coreB, link, a, b };
}

const same = (a, b) => expect(canonical(a.poll.state())).toBe(canonical(b.poll.state()));

describe("a poll over live", () => {
  it("reaches the twin whole when the creator goes live", async () => {
    const { a, b, link } = await pair();
    await a.start();
    await link.idle();
    expect(b.poll.question).toBe("Dinner?");
    expect(b.poll.options().map((one) => one.date)).toEqual(["2026-10-12", "2026-10-13"]);
    expect(b.poll.creator).toBe(a.poll.who);
    expect(a.statuses.at(-1)).toBe("joined");
    expect(b.statuses.at(-1)).toBe("joined");
    expect(a.poll.peer).toBe(b.poll.who);
    expect(b.poll.peer).toBe(a.poll.who);
    same(a, b);
    // Each kind is one of the protocol's, and the state rides as `u`.
    const kinds = link.carried.map(({ data }) => decode(data, FORMAT).k);
    expect(new Set(kinds)).toEqual(new Set([HELLO, SYNC]));
  });

  it("carries votes made at the same time on both phones to both", async () => {
    const { a, b, link } = await pair();
    await a.start();
    await link.idle();
    const [first, second] = a.poll.options().map((one) => one.id);
    a.poll.vote(first, "yes");
    b.poll.vote(first, "yes");
    b.poll.vote(second, "no");
    a.poll.vote(second, "maybe");
    await link.idle();
    same(a, b);
    expect(a.poll.goodForAll(first)).toBe(true);
    expect(b.poll.goodForAll(first)).toBe(true);
    expect(a.poll.tally(second)).toEqual({ yes: 0, maybe: 1, no: 1 });
    expect(link.carried.some(({ data }) => decode(data, FORMAT).k === UPDATE)).toBe(true);
  });

  it("keeps what one did with the link down and joins it when it comes back", async () => {
    const { a, b, link } = await pair();
    await a.start();
    await link.idle();
    const [first] = a.poll.options().map((one) => one.id);
    link.down();
    b.poll.vote(first, "yes");
    b.poll.addOption("2026-10-20");
    a.poll.vote(first, "yes");
    await link.idle();
    expect(b.session.status).toBe("unreachable");
    expect(a.poll.options()).toHaveLength(2);
    link.up();
    await b.start({ resume: true });
    await link.idle();
    same(a, b);
    expect(a.poll.options().map((one) => one.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-20"]);
    expect(a.poll.goodForAll(first)).toBe(true);
  });

  it("takes from the twin only what the envelope's sender may write", async () => {
    const { a, b, coreA, link } = await pair();
    await a.start();
    await link.idle();
    const [first] = a.poll.options().map((one) => one.id);
    a.poll.vote(first, "no");
    await link.idle();
    // The twin sends a state where the creator said ✅ and the poll is closed in its name.
    const forged = b.poll.state();
    forged.votes[a.poll.who] = { [first]: { a: "yes", t: 9e12 } };
    forged.closed = { opt: first, by: a.poll.who, t: 1 };
    await coreA.hear(encode({ p: FORMAT, v: VERSION, k: UPDATE, doc: a.poll.id, who: b.poll.who, app: "1.0.0", u: JSON.stringify(forged) }));
    expect(a.poll.answerOf(a.poll.who, first)).toBe("no");
    expect(a.poll.closed).toBeNull();
  });

  it("ignores garbage in `u` and never echoes what it took", async () => {
    const { a, b, coreA, link } = await pair();
    await a.start();
    await link.idle();
    const before = canonical(a.poll.state());
    const sent = coreA.sent.length;
    for (const u of ["not json", "{}", JSON.stringify({ q: 1 }), "[]"]) {
      await coreA.hear(encode({ p: FORMAT, v: VERSION, k: UPDATE, doc: a.poll.id, who: b.poll.who, app: "1.0.0", u }));
    }
    expect(canonical(a.poll.state())).toBe(before);
    // A real update from the twin is taken and not sent back.
    b.poll.vote(b.poll.options()[0].id, "maybe");
    await link.idle();
    expect(a.poll.answerOf(b.poll.who, b.poll.options()[0].id)).toBe("maybe");
    expect(coreA.sent.length).toBe(sent);
  });
});

describe("the replica", () => {
  it("says the twin lacks nothing when the twin already has it all", () => {
    const poll = Poll.create({ kind: "text", question: "Where?" });
    poll.addOption("Here");
    const replica = pollReplica(poll);
    expect(replica.missing(replica.have())).toBeNull();
    const empty = pollReplica(Poll.received(poll.id));
    expect(replica.missing(empty.have())).not.toBeNull();
    expect(empty.missing(replica.have())).toBeNull();
    expect(() => replica.missing("garbage")).toThrow();
  });

  it("refuses to apply anything before it is told who sent it", () => {
    const poll = Poll.create({ kind: "text", question: "Where?" });
    const twin = pollReplica(Poll.received(poll.id));
    expect(() => twin.apply(JSON.stringify(poll.state()))).toThrow();
    twin.from(poll.who);
    expect(() => twin.apply(JSON.stringify(poll.state()))).not.toThrow();
  });
});
