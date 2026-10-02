// A poll (plan-plugins-nuevos §12): a question with text or date options; each participant marks
// ✅ / 🤔 / ❌ (`yes`, `maybe`, `no`, or `none` to take it back); anyone adds options; whoever
// created it closes it by choosing one. No Yjs: the whole state travels, and two states join with
// `merge`, which gives the same result in any order and when applied twice:
//
//   { schema, q, kind, by, opts: [{ id, by, gone, date | text }], votes: { <who>: { <opt>: { a, t } } },
//     closed: null | { opt, by, t } }
//
// - options by union of ids; `gone` (removed) is never undone;
// - each participant's vote on an option: the latest `t` wins (ties by answer);
// - the close: the first (`t`, then the option id).
// The same shape works for any number of participants; the plugin's screen and live are for two.
//
// What the twin sends is untrusted: `take` reads it with `normalise` (garbage throws) and keeps
// only what the sender (the envelope's `who`) may write: its own votes, options in its own name,
// removals of its own options, the close if it created the poll, and the question only when this
// phone has none yet.

import { isDay, compactDay } from "./dates.js";
import { isId, newWho } from "./live.js";

/** The shape of the state. A poll with a higher schema came from a newer plugin: read only. */
export const SCHEMA = 1;
export const KINDS = ["dates", "text"];
/** The answers, in the order that breaks a tie between two votes made at the same time. */
export const ANSWERS = ["none", "no", "maybe", "yes"];
export const MAX_QUESTION = 200;
export const MAX_OPTION = 100;
/** How many options a poll shows at most. */
export const MAX_OPTIONS = 64;
/** How many options, removed ones included, a state may carry at most. */
export const WIRE_OPTIONS = 256;
export const MAX_VOTERS = 32;
const MAX_TIME = 8.64e15;

/** The origin of a change made on this phone, and of one taken from the twin. */
export const LOCAL = "local";
export const LIVE = "live";

let lastId = 0;

/**
 * An id for a poll or an option: time first, so ids sort as things were made, and never the
 * same time twice on this phone, so two made in the same millisecond keep their order.
 */
export function newId(now = Date.now()) {
  lastId = Math.max(now, lastId + 1);
  const random = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, "0");
  return `${lastId.toString(36).padStart(9, "0")}${random}`;
}

const clean = (text, limit) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isTime = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_TIME;
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** A poll with nothing in it, not even a question: what a phone has before the twin sends it. */
export function emptyState() {
  return { schema: SCHEMA, q: "", kind: null, by: null, opts: [], votes: {}, closed: null };
}

function fail(why) {
  throw new Error(`not a poll: ${why}`);
}

function readOption(raw, kind) {
  if (!isObject(raw) || !isId(raw.id) || !isId(raw.by) || typeof raw.gone !== "boolean") fail("option");
  const option = { id: raw.id, by: raw.by, gone: raw.gone };
  if (kind === "dates") {
    if (!isDay(raw.date)) fail("option date");
    option.date = raw.date;
  } else {
    if (typeof raw.text !== "string" || !raw.text || raw.text.length > MAX_OPTION) fail("option text");
    option.text = raw.text;
  }
  return option;
}

/**
 * A state read from anywhere (the twin, a record), checked and put in its one canonical order.
 * Throws on what is not a poll or breaks a limit; drops what a newer version may add and this
 * one does not know (unknown fields, answers, votes on options it does not carry).
 */
export function normalise(raw) {
  if (!isObject(raw)) fail("not an object");
  const schema = raw.schema === undefined ? SCHEMA : raw.schema;
  if (!Number.isInteger(schema) || schema < 1) fail("schema");
  const state = { ...emptyState(), schema };
  if (raw.by === null || raw.by === undefined) {
    if ((raw.q ?? "") !== "" || (raw.kind ?? null) !== null) fail("a question with no creator");
    if ((Array.isArray(raw.opts) && raw.opts.length) || (isObject(raw.votes) && Object.keys(raw.votes).length) || raw.closed) fail("options with no question");
    return state;
  }
  if (!isId(raw.by)) fail("creator");
  if (typeof raw.q !== "string" || !raw.q.trim() || raw.q.length > MAX_QUESTION) fail("question");
  if (!KINDS.includes(raw.kind)) fail("kind");
  if (!Array.isArray(raw.opts) || raw.opts.length > WIRE_OPTIONS) fail("options");
  Object.assign(state, { q: raw.q, kind: raw.kind, by: raw.by });
  const options = new Map();
  for (const one of raw.opts) {
    const option = readOption(one, raw.kind);
    const before = options.get(option.id);
    options.set(option.id, before ? mergeOption(before, option) : option);
  }
  state.opts = [...options.values()].sort((a, b) => compare(a.id, b.id));
  const votes = raw.votes ?? {};
  if (!isObject(votes) || Object.keys(votes).length > MAX_VOTERS) fail("votes");
  for (const who of Object.keys(votes).sort()) {
    if (!isId(who) || !isObject(votes[who])) fail("voter");
    const mine = {};
    for (const opt of Object.keys(votes[who]).sort()) {
      const vote = votes[who][opt];
      if (!isObject(vote) || !isTime(vote.t)) fail("vote");
      if (options.has(opt) && ANSWERS.includes(vote.a)) mine[opt] = { a: vote.a, t: vote.t };
    }
    if (Object.keys(mine).length) state.votes[who] = mine;
  }
  if (raw.closed !== null && raw.closed !== undefined) {
    const { closed } = raw;
    if (!isObject(closed) || !options.has(closed.opt) || !isId(closed.by) || !isTime(closed.t)) fail("close");
    state.closed = { opt: closed.opt, by: closed.by, t: closed.t };
  }
  return state;
}

/** One string per state: two states are the same poll when their canonical forms are equal. */
export function canonical(state) {
  const { schema, q, kind, by, opts, votes, closed } = state;
  const ordered = {};
  for (const who of Object.keys(votes).sort()) {
    ordered[who] = {};
    for (const opt of Object.keys(votes[who]).sort()) ordered[who][opt] = { a: votes[who][opt].a, t: votes[who][opt].t };
  }
  const options = [...opts]
    .sort((a, b) => compare(a.id, b.id))
    .map((one) => ("date" in one ? { id: one.id, by: one.by, gone: one.gone, date: one.date } : { id: one.id, by: one.by, gone: one.gone, text: one.text }));
  return JSON.stringify({ schema, q, kind, by, opts: options, votes: ordered, closed: closed && { opt: closed.opt, by: closed.by, t: closed.t } });
}

const contentOf = (option) => JSON.stringify([option.by, option.date ?? null, option.text ?? null]);

/** The same option seen twice: removed if either removed it; its content, the smaller one. */
function mergeOption(a, b) {
  const kept = contentOf(a) <= contentOf(b) ? a : b;
  return { ...kept, gone: a.gone || b.gone };
}

const later = (a, b) => (a.t !== b.t ? (a.t > b.t ? a : b) : ANSWERS.indexOf(a.a) >= ANSWERS.indexOf(b.a) ? a : b);
const first = (a, b) => {
  const order = a.t - b.t || compare(a.opt, b.opt) || compare(a.by, b.by);
  return order <= 0 ? a : b;
};

/** Two states joined. Commutative, associative and idempotent: the order of arrival never matters. */
export function merge(a, b) {
  const state = emptyState();
  state.schema = Math.max(a.schema, b.schema);
  const headers = [a, b].filter((one) => one.by !== null).sort((x, y) => compare(JSON.stringify([x.q, x.kind, x.by]), JSON.stringify([y.q, y.kind, y.by])));
  if (headers.length) Object.assign(state, { q: headers[0].q, kind: headers[0].kind, by: headers[0].by });
  const options = new Map();
  for (const option of [...a.opts, ...b.opts]) {
    const before = options.get(option.id);
    options.set(option.id, before ? mergeOption(before, option) : { ...option });
  }
  state.opts = [...options.values()].sort((x, y) => compare(x.id, y.id));
  for (const who of new Set([...Object.keys(a.votes), ...Object.keys(b.votes)])) {
    const joined = { ...(a.votes[who] ?? {}) };
    for (const [opt, vote] of Object.entries(b.votes[who] ?? {})) joined[opt] = joined[opt] ? later(joined[opt], vote) : vote;
    state.votes[who] = joined;
  }
  if (a.closed && b.closed) state.closed = { ...first(a.closed, b.closed) };
  else if (a.closed || b.closed) state.closed = { ...(a.closed ?? b.closed) };
  return normaliseOrder(state);
}

function normaliseOrder(state) {
  const votes = {};
  for (const who of Object.keys(state.votes).sort()) {
    votes[who] = {};
    for (const opt of Object.keys(state.votes[who]).sort()) votes[who][opt] = { ...state.votes[who][opt] };
  }
  state.votes = votes;
  return state;
}

/**
 * What of the twin's state this phone takes, given who sent it: its own votes only; new options
 * only in its own name; a removal only of its own options; the close only if it created the poll;
 * the question only when this phone has none, and only if the sender is its creator.
 */
function admit(mine, theirs, sender) {
  const header = mine.by !== null ? mine : theirs.by === sender ? theirs : null;
  if (!header) return null;
  const out = { ...emptyState(), schema: theirs.schema, q: header.q, kind: header.kind, by: header.by };
  const known = new Map(mine.opts.map((option) => [option.id, option]));
  let count = mine.opts.length;
  for (const option of theirs.opts) {
    const have = known.get(option.id);
    if (have) {
      out.opts.push({ ...have, gone: have.gone || (option.gone && have.by === sender) });
      continue;
    }
    if (option.by !== sender || count >= WIRE_OPTIONS) continue;
    if (header.kind === "dates" ? !("date" in option) : !("text" in option)) continue;
    out.opts.push({ ...option });
    count += 1;
  }
  const ids = new Set([...known.keys(), ...out.opts.map((option) => option.id)]);
  const votes = {};
  for (const [opt, vote] of Object.entries(theirs.votes[sender] ?? {})) if (ids.has(opt)) votes[opt] = vote;
  if (Object.keys(votes).length) out.votes[sender] = votes;
  const { closed } = theirs;
  if (closed && sender === header.by && closed.by === sender && ids.has(closed.opt)) out.closed = { ...closed };
  return out;
}

export class Poll {
  /**
   * A poll on this phone. `who` is this phone's random id in this poll, `peer` the twin's once
   * known, `shared` whether it went live: these three are this phone's own and never travel in
   * the state. `now` is the clock (a function), for votes and the close.
   */
  constructor({ id = newId(), who = newWho(), peer = null, shared = false, updatedAt = Date.now(), state = emptyState(), now = Date.now } = {}) {
    this.id = id;
    this.who = who;
    this.peer = peer;
    this.shared = shared;
    this.updatedAt = updatedAt;
    this.now = now;
    this.data = state;
    this.listeners = new Set();
  }

  /** A new poll, created by this phone. */
  static create({ kind, question, who = newWho(), id = newId(), now = Date.now }) {
    const q = clean(question, MAX_QUESTION);
    if (!KINDS.includes(kind) || !q) throw new Error("a poll needs a kind and a question");
    return new Poll({ id, who, now, state: { ...emptyState(), q, kind, by: who } });
  }

  /** A poll this phone does not have yet, to be filled by the twin who created it. */
  static received(id, { who = newWho(), now = Date.now } = {}) {
    return new Poll({ id, who, now });
  }

  get question() {
    return this.data.q;
  }

  get kind() {
    return this.data.kind;
  }

  get creator() {
    return this.data.by;
  }

  get hasHeader() {
    return this.data.by !== null;
  }

  get isMine() {
    return this.hasHeader && this.data.by === this.who;
  }

  get closed() {
    return this.data.closed;
  }

  get readOnly() {
    return this.data.schema > SCHEMA;
  }

  get editable() {
    return this.hasHeader && !this.readOnly && !this.data.closed;
  }

  /** A copy of the state, as it travels. */
  state() {
    return structuredClone(this.data);
  }

  /** Hears every change: `origin` is `local` (this phone) or `live` (the twin). */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(origin) {
    this.updatedAt = Date.now();
    for (const listener of this.listeners) listener(origin);
  }

  option(id) {
    return this.data.opts.find((one) => one.id === id) ?? null;
  }

  /** The options shown: not removed; days in calendar order, texts in the order they came. */
  options() {
    const shown = this.data.opts.filter((one) => !one.gone);
    if (this.kind === "dates") return shown.sort((a, b) => compare(a.date ?? "", b.date ?? "") || compare(a.id, b.id));
    return shown.sort((a, b) => compare(a.id, b.id));
  }

  /** Adds a day (`YYYY-MM-DD`) or a text; returns the option's id, or null when it cannot. */
  addOption(value) {
    if (!this.editable) return null;
    const shown = this.options();
    if (shown.length >= MAX_OPTIONS || this.data.opts.length >= WIRE_OPTIONS) return null;
    let option;
    if (this.kind === "dates") {
      const day = String(value ?? "").trim();
      if (!isDay(day) || shown.some((one) => one.date === day)) return null;
      const plain = `d${compactDay(day)}`;
      option = { id: this.option(plain) ? newId() : plain, by: this.who, gone: false, date: day };
    } else {
      const text = clean(value, MAX_OPTION);
      if (!text || shown.some((one) => one.text?.toLocaleLowerCase() === text.toLocaleLowerCase())) return null;
      option = { id: newId(), by: this.who, gone: false, text };
    }
    this.data.opts = [...this.data.opts, option].sort((a, b) => compare(a.id, b.id));
    this.changed(LOCAL);
    return option.id;
  }

  /** Removes an option this phone added. Removed stays removed. */
  removeOption(id) {
    const option = this.option(id);
    if (!this.editable || !option || option.gone || option.by !== this.who) return false;
    option.gone = true;
    this.changed(LOCAL);
    return true;
  }

  /** This phone's answer on an option: `yes`, `maybe`, `no`, or `none` to take it back. */
  vote(id, answer) {
    const option = this.option(id);
    if (!this.editable || !option || option.gone || !ANSWERS.includes(answer)) return false;
    const mine = (this.data.votes[this.who] ??= {});
    const before = mine[id]?.t ?? -1;
    mine[id] = { a: answer, t: Math.max(this.now(), before + 1) };
    this.data = normaliseOrder(this.data);
    this.changed(LOCAL);
    return true;
  }

  /** Closes the poll choosing an option: only whoever created it, only once. */
  close(id) {
    const option = this.option(id);
    if (!this.isMine || !this.editable || !option || option.gone) return false;
    this.data.closed = { opt: id, by: this.who, t: this.now() };
    this.changed(LOCAL);
    return true;
  }

  /** The option the poll was closed on, or null. */
  chosen() {
    return this.data.closed ? this.option(this.data.closed.opt) : null;
  }

  answerOf(who, id) {
    return this.data.votes[who]?.[id]?.a ?? "none";
  }

  tally(id) {
    const count = { yes: 0, maybe: 0, no: 0 };
    for (const who of Object.keys(this.data.votes)) {
      const answer = this.answerOf(who, id);
      if (answer in count) count[answer] += 1;
    }
    return count;
  }

  /** Everyone in the poll as this phone knows it: itself, the twin, and whoever voted. */
  participants() {
    const all = new Set([this.who, ...Object.keys(this.data.votes)]);
    if (this.peer) all.add(this.peer);
    return [...all].sort();
  }

  /** Whether everyone, at least two, said ✅ to an option. */
  goodForAll(id) {
    const all = this.participants();
    return all.length >= 2 && all.every((who) => this.answerOf(who, id) === "yes");
  }

  /**
   * Takes what the twin sent, as `sender`. Throws when it is not a poll; returns whether anything
   * changed here.
   */
  take(raw, sender) {
    const theirs = normalise(raw);
    if (!isId(sender)) return false;
    const admitted = admit(this.data, theirs, sender);
    if (!admitted) return false;
    const next = merge(this.data, admitted);
    if (canonical(next) === canonical(this.data)) return false;
    this.data = next;
    this.changed(LIVE);
    return true;
  }

  /** The record this phone keeps: the state and this phone's side of the live session. */
  record() {
    return JSON.stringify({ id: this.id, who: this.who, peer: this.peer, shared: this.shared, updatedAt: this.updatedAt, poll: this.data });
  }

  /** A poll read back from its record; null when it is not one. */
  static parse(id, text) {
    try {
      const read = JSON.parse(text);
      if (!isObject(read)) return null;
      return new Poll({
        id,
        who: isId(read.who) ? read.who : newWho(),
        peer: isId(read.peer) ? read.peer : null,
        shared: read.shared === true,
        updatedAt: isTime(read.updatedAt) ? read.updatedAt : Date.now(),
        state: normalise(read.poll),
      });
    } catch {
      return null;
    }
  }
}
