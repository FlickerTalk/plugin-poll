// The plugin is never told it is being closed, so a poll is written after every change.
// A keeper works only inside its place, so a poll of one conversation is unknown in any other.

import { Poll } from "./poll.js";

// never 43 characters, so never a chat id
export const NO_CHAT = "local";
const CHAT = /^[A-Za-z0-9_-]{43}$/;

export function placeOf(chat) {
  return typeof chat === "string" && CHAT.test(chat) ? chat : NO_CHAT;
}

// at most 113 bytes, the core allows 128
export const recordKey = (place, id) => `poll/${place}/${id}`;

export class Keeper {
  constructor(records, place = NO_CHAT) {
    this.records = records;
    this.place = place;
    this.prefix = `poll/${place}/`;
    this.full = false;
    this.listeners = new Set();
    this.dirty = new Map();
    this.running = null;
  }

  onFull(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  watch(poll) {
    return poll.onChange(() => {
      this.save(poll);
    });
  }

  save(poll) {
    if (!poll.hasHeader) return this.settled();
    this.dirty.set(poll.id, poll);
    this.running ??= this.drain();
    return this.running;
  }

  settled() {
    return this.running ?? Promise.resolve(!this.full);
  }

  async drain() {
    let ok = true;
    while (this.dirty.size) {
      const [id, poll] = this.dirty.entries().next().value;
      this.dirty.delete(id);
      ok = await this.write(poll);
    }
    this.running = null;
    return ok;
  }

  async write(poll) {
    let ok = false;
    try {
      ok = (await this.records.set(recordKey(this.place, poll.id), poll.record())) === true;
    } catch {
      ok = false;
    }
    if (this.full === ok) {
      this.full = !ok;
      for (const listener of this.listeners) listener(this.full);
    }
    return ok;
  }

  async index() {
    let keys = [];
    try {
      keys = (await this.records.keys(this.prefix)) || [];
    } catch {
      keys = [];
    }
    const polls = [];
    for (const key of keys) {
      if (!key.startsWith(this.prefix)) continue;
      const id = key.slice(this.prefix.length);
      if (!id || id.includes("/")) continue;
      const poll = await this.load(id);
      if (poll) polls.push({ id, question: poll.question, kind: poll.kind, closed: Boolean(poll.closed), shared: poll.shared, updatedAt: poll.updatedAt });
    }
    return polls.sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  }

  async load(id) {
    try {
      const text = await this.records.get(recordKey(this.place, id));
      if (typeof text !== "string") return null;
      const poll = Poll.parse(id, text);
      return poll?.hasHeader ? poll : null;
    } catch {
      return null;
    }
  }

  async forget(id) {
    this.dirty.delete(id);
    await this.settled();
    await this.records.forget(recordKey(this.place, id));
  }
}
