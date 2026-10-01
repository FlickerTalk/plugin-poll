// Keeping polls in `ft.records`, the plugin's own room on this phone (4 MB, `storage: small`), one
// record each: `poll/<id>`. The plugin is never told it is being closed (finding 5 of the plan),
// so a poll is written after every change. Writes go one after another; changes that arrive
// while one is on its way are written together right after it. A write the core refuses (the
// quota is full) leaves the poll on screen and says so. A received poll is kept only once its
// question has arrived from the twin.

import { PREFIX, Poll, recordKey } from "./poll.js";

export class Keeper {
  constructor(records) {
    this.records = records;
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
      ok = (await this.records.set(recordKey(poll.id), poll.record())) === true;
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
      keys = (await this.records.keys(PREFIX)) || [];
    } catch {
      keys = [];
    }
    const polls = [];
    for (const key of keys) {
      const id = key.slice(PREFIX.length);
      if (!id || id.includes("/")) continue;
      const poll = await this.load(id);
      if (poll) polls.push({ id, question: poll.question, kind: poll.kind, closed: Boolean(poll.closed), shared: poll.shared, updatedAt: poll.updatedAt });
    }
    return polls.sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  }

  /** A kept poll, or null. */
  async load(id) {
    try {
      const text = await this.records.get(recordKey(id));
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
    await this.records.forget(recordKey(id));
  }
}
