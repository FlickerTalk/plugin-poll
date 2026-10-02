// Keeping polls in `ft.records`, the plugin's own room on this phone (4 MB, `storage: small`), one
// record each, under the place the plugin was opened in: `poll/<place>/<id>`. The place is the
// conversation's opaque `chat` id from `onOpen` (43 characters, this phone's own, never sent), or
// `local` outside a conversation; a keeper lists, loads, saves and forgets only inside its place,
// so a poll of one conversation is unknown in any other. The plugin is never told it is being closed (finding 5 of the plan),
// so a poll is written after every change. Writes go one after another; changes that arrive
// while one is on its way are written together right after it. A write the core refuses (the
// quota is full) leaves the poll on screen and says so. A received poll is kept only once its
// question has arrived from the twin.

import { Poll } from "./poll.js";

/** The place of what is opened outside a conversation: never 43 characters, so never a chat id. */
export const NO_CHAT = "local";
const CHAT = /^[A-Za-z0-9_-]{43}$/;

/** Where a poll opened with this `chat` is kept: the chat id if it is one, otherwise `local`. */
export function placeOf(chat) {
  return typeof chat === "string" && CHAT.test(chat) ? chat : NO_CHAT;
}

/** The record of a poll in a place. At most 5 + 43 + 1 + 64 = 113 bytes, under the core's 128. */
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

  /** Hears the quota filling up (`true`) and having room again (`false`). */
  onFull(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Saves the poll on every change, from this phone or from the twin. */
  watch(poll) {
    return poll.onChange(() => {
      this.save(poll);
    });
  }

  /** Saves a poll; resolves true once it and everything queued with it are written. */
  save(poll) {
    if (!poll.hasHeader) return this.settled();
    this.dirty.set(poll.id, poll);
    this.running ??= this.drain();
    return this.running;
  }

  /** Resolves when nothing is waiting to be written. */
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

  /** What the list of polls shows, newest first. */
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

  /** A kept poll, or null. */
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
