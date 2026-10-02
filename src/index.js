// Poll for FlickerTalk (plan-plugins-nuevos §12): a question with dates (a calendar of several days)
// or text options; each one marks ✅ / 🤔 / ❌; options with ✅ from both stand out; anyone adds
// options; whoever created the poll closes it choosing one. From a conversation, "🔄 Live" lets the
// two phones vote at once over the core's direct channel (`live.js`, the whole state as `u`); what
// each does apart is kept here and joins the other's when both have the poll open. 📤 puts the
// result in the composer as text; 📆 hands the chosen day to the phone's calendar as an .ics file
// (saved with `ft.save`, or sent with `ft.send`). Nothing leaves this frame but what the user
// sends or saves, and what live says to the same plugin on the other phone.
//
// Each conversation keeps its own polls: they live under the conversation's opaque `chat` id from
// `onOpen` (core 1.3.0), this phone's own and never sent. In a chat, only that chat's polls exist;
// a poll of another chat is unknown there, so a hello that resumes it gets no answer. Outside a
// conversation (no valid `chat`) polls are this phone's only and never go live.

import { name as APP_NAME, version as APP_VERSION } from "../module.json";
import { datePicker } from "./date-picker.js";
import { shortDay, todayOf } from "./dates.js";
import { dirOf, makeT } from "./i18n.js";
import { calendarFile, calendarName } from "./ics.js";
import { HELLO, Inbox, LiveSession, inOrder, isNewer, toBase64 } from "./live.js";
import { pollReplica } from "./live-poll.js";
import { MAX_OPTION, MAX_QUESTION, Poll } from "./poll.js";
import { Keeper, NO_CHAT, placeOf } from "./store.js";
import { STRINGS } from "./strings.js";
import { labelOf, summaryOf } from "./summary.js";

/** The `p` of every live message of this plugin. */
export const FORMAT = "ftpoll";
/** What the calendar file is, for the app and the phone. */
const CALENDAR = "text/calendar";

const t = makeT(STRINGS);

const escape = (text) =>
  String(text).replace(/[&<>"']/g, (one) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[one]);

const EMOJI = { yes: "✅", maybe: "🤔", no: "❌", none: "·" };
const ANSWERED = ["yes", "maybe", "no"];

const STYLE = `
:host { display: block; font: 15px system-ui, sans-serif; color: #111; --paper: #fff; --line: #d8d8d8; --soft: #666; --accent: #e0562b; --good: #1f8a4c; --good-bg: #e6f5ec; }
@media (prefers-color-scheme: dark) { :host { color: #f4f4f4; --paper: #111; --line: #3a3a3a; --soft: #aaa; --good: #6fd39b; --good-bg: #16301f; } }
:host-context([data-dark]) { color: #f4f4f4; --paper: #111; --line: #3a3a3a; --soft: #aaa; --good: #6fd39b; --good-bg: #16301f; }
* { box-sizing: border-box; }
.bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 4px 0 8px; }
.grow { flex: 1; min-width: 0; }
h1 { font-size: 18px; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button {
  appearance: none; border: 1px solid currentColor; background: transparent; color: inherit;
  border-radius: 10px; min-width: 44px; height: 44px; font: inherit; padding: 0 10px; cursor: pointer; opacity: .8;
}
button.on, button[aria-pressed="true"] { opacity: 1; box-shadow: inset 0 0 0 2px currentColor; }
button.danger { color: var(--accent); }
button.plain { border: 0; }
.i { display: block; width: 22px; height: 22px; margin: auto; background: currentColor; -webkit-mask: var(--i) center/contain no-repeat; mask: var(--i) center/contain no-repeat; }
form { display: flex; gap: 6px; align-items: center; margin: 0; }
input { flex: 1; min-width: 0; font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; height: 44px; }
ul { list-style: none; margin: 8px 0 0; padding: 0; }
li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; border-bottom: 1px solid var(--line); min-height: 52px; padding: 6px 4px; }
li[data-good="true"] { background: var(--good-bg); }
li.chosen { box-shadow: inset 4px 0 0 var(--good); }
li .open { flex: 1; display: flex; flex-direction: column; align-items: flex-start; text-align: start; border: 0; border-radius: 0; height: auto; padding: 10px 4px; opacity: 1; }
.title { font-weight: 600; }
.meta { color: var(--soft); font-size: 13px; }
.label { flex: 1 1 40%; min-width: 0; overflow-wrap: anywhere; }
.badge { color: var(--good); font-size: 13px; font-weight: 600; }
.theirs, .mine { min-width: 28px; text-align: center; }
.votes { display: flex; gap: 4px; }
.votes button { min-width: 44px; padding: 0; }
.status, .hint, .warn, .note { margin: 4px 0; }
.status:empty, .warn:empty, .note:empty { display: none; }
.hint, .note { color: var(--soft); font-size: 13px; }
.warn { color: var(--accent); }
.invite, .banner, .footer { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
.invite, .banner { padding: 8px; border: 1px solid var(--line); border-radius: 10px; }
.invite:empty, .banner:empty, .footer:empty { display: none; }
.invite span, .banner .chosen-text, .footer span { flex: 1 1 60%; }
.banner .chosen-text { font-weight: 600; }
.banner p { flex: 1 1 100%; margin: 0; color: var(--soft); font-size: 13px; }
.banner p:empty { display: none; }
.kinds { display: flex; gap: 6px; margin: 0 0 6px; }
.confirm { flex-wrap: wrap; padding: 8px 0; }
.confirm span { flex: 1 1 100%; }
.empty { color: var(--soft); text-align: center; padding: 40px 0; }
calendar-multi { display: block; margin: 4px 0; }
calendar-multi::part(header) { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
calendar-multi::part(button) { appearance: none; border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 10px; min-width: 44px; height: 44px; font: inherit; }
calendar-month { width: 100%; }
calendar-month::part(button) { min-width: 40px; height: 40px; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; }
calendar-month::part(selected) { background: var(--accent); color: #fff; }
calendar-month::part(today) { box-shadow: inset 0 0 0 1px currentColor; }
calendar-month::part(disallowed) { opacity: .35; }
`;

const icon = (name) => `<i class="i" style="--i:url(./icon/${name}.svg)"></i>`;
const button = (act, label, name, extra = "") => `<button type="button" data-act="${act}" aria-label="${escape(label)}" ${extra}>${icon(name)}</button>`;

/** The plugin's view: the polls this phone keeps, or one poll. */
class PollElement extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.lang = "en";
    this.mayLive = false;
    this.screen = "home";
    this.metas = [];
    this.poll = null;
    this.session = null;
    this.replica = null;
    this.status = "off";
    this.stops = [];
    this.newKind = "dates";
    this.confirming = null;
    this.choosing = false;
    this.closing = null;
    this.invite = null;
    this.pendingTitle = "";
    this.icsNote = "";
    this.picker = null;
    this.paintedAs = "";
  }

  connectedCallback() {
    this.ft = globalThis.ft;
    this.useKeeper(NO_CHAT);
    this.inbox = new Inbox(FORMAT);
    this.root.innerHTML = `<style>${STYLE}</style><div class="view"></div>`;
    this.view = this.root.querySelector(".view");
    this.root.addEventListener("click", (event) => this.onClick(event));
    this.root.addEventListener("submit", (event) => this.onSubmit(event));
    this.ft.onOpen((opening) => this.onOpen(opening));
    // The frame does not wait for one message to be handled before handing the next.
    this.ft.live?.onMessage?.(inOrder((data) => this.onLive(data)));
    this.paint();
  }

  /** The keeper of one place: it lists, loads, saves and forgets only there. */
  useKeeper(place) {
    this.place = place;
    this.keeper = new Keeper(this.ft.records, place);
    this.keeper.onFull(() => this.paintWarning());
  }

  T(key, holes = {}) {
    return t(this.lang, key, { app: APP_NAME, ...holes });
  }

  // ---- What the app hands over ----

  async onOpen(opening) {
    this.lang = opening.lang || "en";
    const place = placeOf(opening.chat);
    if (place !== this.place) {
      if (this.poll) await this.leave();
      this.screen = "home";
      this.useKeeper(place);
    }
    // Live needs a conversation to keep the poll in: if the core said live without a chat, no live.
    this.mayLive = Boolean(opening.live) && place !== NO_CHAT;
    this.setAttribute("lang", this.lang);
    this.setAttribute("dir", dirOf(this.lang));
    this.metas = await this.keeper.index();
    this.paint();
  }

  // ---- Polls ----

  /** Puts a poll on screen and keeps it on every change, from this phone or from the twin. */
  show(poll, { title = "" } = {}) {
    this.poll = poll;
    this.screen = "poll";
    this.status = "off";
    this.choosing = false;
    this.closing = null;
    this.invite = null;
    this.icsNote = "";
    this.picker = null;
    this.pendingTitle = typeof title === "string" ? title.slice(0, MAX_QUESTION) : "";
    this.stops.push(this.keeper.watch(poll));
    this.stops.push(poll.onChange(() => this.changed()));
    this.paint();
  }

  /** The poll changed: repaint what shows it, or the whole screen if its shape changed. */
  changed() {
    if (this.screen !== "poll" || !this.poll) return;
    if (this.shapeOf(this.poll) !== this.paintedAs) this.paint();
    else this.paintPoll();
  }

  shapeOf(poll) {
    return `${poll.hasHeader}|${poll.kind}|${poll.editable}`;
  }

  /** Opens a kept poll; if it was shared and this is a conversation, says hello on its own. */
  async enter(id) {
    const poll = await this.keeper.load(id);
    if (!poll) return;
    this.show(poll);
    if (this.mayLive && poll.shared && poll.peer && !poll.readOnly) await this.startLive({ resume: true });
  }

  /** Leaves the poll on screen: a bye if live, and everything written. */
  async leave() {
    if (this.session) {
      const session = this.session;
      this.session = null;
      await session.stop();
    }
    this.status = "off";
    for (const stop of this.stops.splice(0)) stop();
    await this.keeper.settled();
    this.poll = null;
    this.picker = null;
  }

  async home() {
    await this.leave();
    this.screen = "home";
    this.metas = await this.keeper.index();
    this.paint();
  }

  // ---- Live ----

  makeSession(poll) {
    const replica = pollReplica(poll);
    this.replica = replica;
    const session = new LiveSession({
      format: FORMAT,
      app: APP_VERSION,
      doc: poll.id,
      who: poll.who,
      peer: poll.peer,
      replica,
      send: (data) => this.ft.live.send(data),
      onStatus: (status) => {
        if (this.session !== session) return;
        this.status = status;
        this.paintStatus();
      },
      onPeer: (who) => {
        poll.peer = who;
        poll.shared = true;
        this.keeper.save(poll);
      },
    });
    return session;
  }

  async startLive({ resume = false } = {}) {
    if (!this.poll) return;
    this.session ??= this.makeSession(this.poll);
    this.paintStatus();
    await this.session.start({ resume, title: this.poll.question });
  }

  /**
   * 🔄: stops a live session, or starts one. A poll already shared is only ever resumed, with the
   * same person: its votes and options are theirs and this phone's, nobody else's.
   */
  async toggleLive() {
    if (this.session && (this.status === "joined" || this.status === "waiting")) {
      const session = this.session;
      this.session = null;
      this.status = "off";
      this.paintStatus();
      await session.stop();
      return;
    }
    await this.startLive({ resume: Boolean(this.poll?.shared && this.poll?.peer) });
  }

  /** What the twin says: for the live poll, or a hello for one that is not live here. */
  async onLive(data) {
    if (!this.mayLive) return;
    const message = this.inbox.take(data);
    if (!message) return;
    if (this.session && message.doc === this.session.doc) {
      this.replica.from(message.who);
      await this.session.hear(message);
      return;
    }
    if (isNewer(message)) {
      if (this.poll && this.poll.id === message.doc) {
        this.status = "outdated";
        this.paintStatus();
      }
      return;
    }
    if (message.k !== HELLO || !this.mayLive || typeof message.sv !== "string") return;
    const here = this.poll && this.poll.id === message.doc ? this.poll : null;
    const known = here ?? (await this.keeper.load(message.doc));
    // A resumed hello only reopens what this phone shared with that same person.
    if (message.resume && (!known || (known.peer && known.peer !== message.who))) return;
    if (known?.readOnly) return;
    if (this.screen === "poll" && this.poll && !here) {
      const title = typeof message.title === "string" ? message.title.slice(0, MAX_QUESTION) : "";
      this.invite = { message, name: known?.question || title || this.T("received") };
      this.paintInvite();
      return;
    }
    await this.join(message, known);
  }

  async join(message, known) {
    let poll = known;
    if (!poll || poll !== this.poll) {
      if (this.screen === "poll") await this.leave();
      poll = known ?? Poll.received(message.doc);
      this.show(poll, { title: message.title });
    }
    this.session = this.makeSession(poll);
    this.replica.from(message.who);
    await this.session.hear(message);
  }

  // ---- Clicks and forms ----

  async onClick(event) {
    const target = event.target.closest("button[data-act]");
    if (!target) return;
    const { act, id } = target.dataset;
    const poll = this.poll;
    switch (act) {
      case "close":
        await this.leave();
        return this.ft.close();
      case "back":
        return this.home();
      case "kind":
        this.newKind = target.dataset.kind === "text" ? "text" : "dates";
        return this.paint();
      case "open":
        return this.enter(id);
      case "delete":
        this.confirming = id;
        return this.paint();
      case "cancelDelete":
        this.confirming = null;
        return this.paint();
      case "confirmDelete":
        this.confirming = null;
        await this.keeper.forget(id);
        this.metas = await this.keeper.index();
        return this.paint();
      case "vote": {
        if (!poll) return;
        const answer = target.dataset.answer;
        poll.vote(id, poll.answerOf(poll.who, id) === answer ? "none" : answer);
        return;
      }
      case "removeOption":
        poll?.removeOption(id);
        return;
      case "closePoll":
        this.choosing = true;
        this.closing = null;
        return this.paintPoll();
      case "cancelChoose":
      case "cancelClose":
        this.choosing = false;
        this.closing = null;
        return this.paintPoll();
      case "choose":
        this.closing = id;
        return this.paintPoll();
      case "confirmClose": {
        const closing = this.closing;
        this.choosing = false;
        this.closing = null;
        if (!poll?.close(closing)) this.paintPoll();
        return;
      }
      case "live":
        return this.toggleLive();
      case "send":
        return this.sendSummary();
      case "icsSave":
        return this.saveCalendar();
      case "icsSend":
        return this.sendCalendar();
      case "join": {
        const invite = this.invite;
        this.invite = null;
        if (!invite) return;
        return this.join(invite.message, await this.keeper.load(invite.message.doc));
      }
      case "notNow":
        this.invite = null;
        return this.paintInvite();
      default:
    }
  }

  async onSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector("input");
    const value = input?.value ?? "";
    if (form.dataset.form === "new") {
      let poll;
      try {
        poll = Poll.create({ kind: this.newKind, question: value });
      } catch {
        return;
      }
      await this.keeper.save(poll);
      this.show(poll);
    } else if (form.dataset.form === "add" && this.poll?.addOption(value)) {
      input.value = "";
      input.focus?.();
    }
  }

  /** Days ticked or unticked on the calendar: add the new ones, remove this phone's unticked ones. */
  picked(days) {
    const poll = this.poll;
    if (!poll?.editable) return;
    const chosen = new Set(days);
    const shown = poll.options();
    for (const day of days) if (!shown.some((one) => one.date === day)) poll.addOption(day);
    for (const option of shown) if (!chosen.has(option.date) && option.by === poll.who) poll.removeOption(option.id);
    // What could not change (someone else's day, the cap) goes back on the calendar.
    this.picker?.setDays(this.poll.options().map((one) => one.date));
  }

  /** 📤: the result as text in the composer. The app closes the plugin, so leave cleanly first. */
  async sendSummary() {
    if (!this.poll?.hasHeader) return;
    const text = summaryOf(this.poll, this.lang);
    await this.leave();
    this.ft.say(text);
  }

  /** The chosen day as an .ics file: its name and its bytes in base64; null if there is none. */
  calendar() {
    const poll = this.poll;
    const chosen = poll?.chosen();
    if (!poll || poll.kind !== "dates" || !chosen?.date) return null;
    const text = calendarFile({ uid: poll.id, summary: poll.question, day: chosen.date, stamp: poll.closed.t });
    return { name: calendarName(poll.question), data: toBase64(new TextEncoder().encode(text)) };
  }

  /** 📆 💾: the phone keeps the file; opening it adds the day to its calendar. */
  async saveCalendar() {
    const file = this.calendar();
    if (!file) return;
    let answer = false;
    try {
      answer = await this.ft.save(file.name, CALENDAR, file.data);
    } catch {
      answer = false;
    }
    this.icsNote = answer === false ? "failed" : "saved";
    this.paintBanner();
  }

  /** 📆 📤: the file in the composer, for the user to send. The app closes the plugin. */
  async sendCalendar() {
    const file = this.calendar();
    if (!file) return;
    await this.leave();
    this.ft.send(file.name, CALENDAR, file.data);
  }

  // ---- Painting ----

  paint() {
    if (!this.view) return;
    if (this.screen === "poll" && this.poll) {
      this.paintedAs = this.shapeOf(this.poll);
      this.view.innerHTML = this.pollScreen();
      this.paintHeader();
      this.paintStatus();
      this.paintWarning();
      this.paintInvite();
      this.mountPicker();
      this.paintPoll();
    } else {
      this.view.innerHTML = this.homeScreen();
    }
  }

  homeScreen() {
    const T = (key, holes) => this.T(key, holes);
    const rows = this.metas
      .map((meta) => {
        if (this.confirming === meta.id) {
          return `<li class="confirm"><span>${escape(T("confirmDelete", { name: meta.question }))}</span>
            <button type="button" class="danger" data-act="confirmDelete" data-id="${escape(meta.id)}">${escape(T("delete"))}</button>
            <button type="button" data-act="cancelDelete">${escape(T("cancel"))}</button></li>`;
        }
        const kind = meta.kind === "dates" ? `📅 ${T("kindDates")}` : `📝 ${T("kindText")}`;
        const closed = meta.closed ? ` · 🏁 ${T("closedTag")}` : "";
        const shared = meta.shared ? ` · 🔄 ${T("shared")}` : "";
        return `<li><button type="button" class="open" data-act="open" data-id="${escape(meta.id)}"><span class="title">${escape(meta.question)}</span><span class="meta">${escape(kind + closed + shared)}</span></button>
          ${button("delete", T("delete"), "trash-outline", `data-id="${escape(meta.id)}"`)}</li>`;
      })
      .join("");
    const kind = (name, emoji) => `<button type="button" data-act="kind" data-kind="${name}" aria-pressed="${this.newKind === name}">${emoji} ${escape(T(name === "dates" ? "kindDates" : "kindText"))}</button>`;
    return `
      <div class="bar"><h1 class="grow">${escape(T("title"))}</h1>${button("close", T("close"), "close-outline")}</div>
      ${this.place === NO_CHAT ? `<p class="hint" data-local>${escape(T("localHome"))}</p>` : ""}
      <div class="kinds" role="group">${kind("dates", "📅")}${kind("text", "📝")}</div>
      <form data-form="new"><input name="value" maxlength="${MAX_QUESTION}" autocomplete="off" placeholder="${escape(T("questionPlaceholder"))}" aria-label="${escape(T("questionPlaceholder"))}"><button type="submit" aria-label="${escape(T("create"))}">${icon("add-outline")}</button></form>
      ${rows ? `<ul>${rows}</ul>` : `<p class="empty">${escape(T("empty"))}</p>`}`;
  }

  pollScreen() {
    const T = (key) => this.T(key);
    const poll = this.poll;
    const editable = poll.editable;
    return `
      <div class="bar" data-header></div>
      <p class="status" data-status aria-live="polite"></p>
      <p class="hint" data-hint>${escape(this.mayLive ? T("liveHint") : T("needsChat"))}</p>
      <p class="warn" data-warning role="alert"></p>
      <p class="note" data-note>${poll.readOnly ? escape(T("readOnly")) : ""}</p>
      <div class="invite" data-invite></div>
      ${poll.hasHeader ? "" : `<p class="empty" data-loading>${escape(T("loading"))}</p>`}
      <div class="banner" data-banner></div>
      ${editable && poll.kind === "dates" ? `<p class="hint">${escape(T("pickDays"))}</p><div data-picker></div>` : ""}
      ${editable && poll.kind === "text" ? `<form data-form="add"><input name="value" maxlength="${MAX_OPTION}" autocomplete="off" enterkeyhint="done" placeholder="${escape(T("addPlaceholder"))}" aria-label="${escape(T("addPlaceholder"))}"><button type="submit" aria-label="${escape(T("add"))}">${icon("add-outline")}</button></form>` : ""}
      <ul data-options></ul>
      <div class="footer" data-footer></div>`;
  }

  /** The calendar, made once per poll screen so it keeps its month while the poll changes. */
  mountPicker() {
    const slot = this.view?.querySelector("[data-picker]");
    if (!slot || !this.poll) return;
    if (!this.picker) {
      const today = todayOf();
      this.picker = datePicker({
        lang: this.lang,
        dir: dirOf(this.lang),
        days: this.poll.options().map((one) => one.date),
        min: today,
        today,
        labels: { previous: this.T("previousMonth"), next: this.T("nextMonth") },
      });
      this.picker.onChange((days) => this.picked(days));
    }
    slot.append(this.picker.element);
  }

  paintHeader() {
    const header = this.view?.querySelector("[data-header]");
    if (!header || !this.poll) return;
    const T = (key) => this.T(key);
    const poll = this.poll;
    const name = poll.question || this.pendingTitle || T("received");
    const live = this.session && (this.status === "joined" || this.status === "waiting");
    header.innerHTML = `
      ${button("back", T("back"), "arrow-back-outline")}
      <h1 class="grow" data-name>${escape(name)}</h1>
      ${this.mayLive && poll.hasHeader && !poll.readOnly ? `<button type="button" data-act="live" class="${live ? "on" : ""}" aria-pressed="${live ? "true" : "false"}" aria-label="${escape(live ? T("stopLive") : T("live"))}">🔄 ${escape(T("live"))}</button>` : ""}
      ${poll.hasHeader ? button("send", T("send"), "send-outline") : ""}
      ${button("close", T("close"), "close-outline")}`;
  }

  paintStatus() {
    this.paintHeader();
    const node = this.view?.querySelector("[data-status]");
    if (!node) return;
    const T = (key) => this.T(key);
    const texts = {
      waiting: T("waiting"),
      joined: T("joined"),
      silent: `${T("silent")} ${T("kept")}`,
      unreachable: `${T("unreachable")} ${T("kept")}`,
      left: `${T("left")} ${T("kept")}`,
      outdated: T("outdated"),
    };
    node.textContent = texts[this.status] ?? "";
  }

  paintWarning() {
    const node = this.view?.querySelector("[data-warning]");
    if (node) node.textContent = this.keeper.full ? this.T("full") : "";
  }

  paintInvite() {
    const node = this.view?.querySelector("[data-invite]");
    if (!node) return;
    if (!this.invite) {
      node.innerHTML = "";
      return;
    }
    node.innerHTML = `<span>${escape(this.T("joinPrompt", { name: this.invite.name }))}</span>
      <button type="button" data-act="join">${escape(this.T("join"))}</button>
      <button type="button" data-act="notNow">${escape(this.T("notNow"))}</button>`;
  }

  /** Everything that shows the poll's state: the name, the close, the options and the calendar. */
  paintPoll() {
    if (!this.poll || this.screen !== "poll") return;
    const name = this.view.querySelector("[data-name]");
    if (name) name.textContent = this.poll.question || this.pendingTitle || this.T("received");
    this.paintBanner();
    this.paintOptions();
    this.paintFooter();
    this.picker?.setDays(this.poll.options().map((one) => one.date));
  }

  paintBanner() {
    const node = this.view?.querySelector("[data-banner]");
    if (!node || !this.poll) return;
    const chosen = this.poll.chosen();
    if (!chosen) {
      node.innerHTML = "";
      return;
    }
    const T = (key, holes) => this.T(key, holes);
    const calendar =
      this.poll.kind === "dates"
        ? `<button type="button" data-act="icsSave" aria-label="${escape(T("icsSave"))}">📆 💾</button>
           <button type="button" data-act="icsSend" aria-label="${escape(T("icsSend"))}">📆 📤</button>`
        : "";
    const note = { saved: T("icsSaved"), failed: T("icsFailed") }[this.icsNote] ?? "";
    node.innerHTML = `<span class="chosen-text">${escape(T("chosen", { option: labelOf(chosen, this.lang) }))}</span>${calendar}<p data-ics-note role="status">${escape(note)}</p>`;
  }

  /** A day in few words for a row, or the option's text. */
  rowLabel(option) {
    return typeof option.date === "string" ? shortDay(option.date, this.lang) : option.text;
  }

  /** The other participants' answers on an option, as emoji, with a label to read them out. */
  theirs(option) {
    const poll = this.poll;
    const others = poll.participants().filter((who) => who !== poll.who);
    const answers = others.map((who) => poll.answerOf(who, option.id));
    const shown = answers.length ? answers.map((answer) => EMOJI[answer]).join("") : EMOJI.none;
    const said = answers.filter((answer) => ANSWERED.includes(answer));
    const label = said.length ? this.T("theirAnswer", { answer: said.map((answer) => EMOJI[answer]).join(" ") }) : this.T("theyHaventAnswered");
    return `<span class="theirs" aria-label="${escape(label)}">${shown}</span>`;
  }

  paintOptions() {
    const node = this.view?.querySelector("[data-options]");
    if (!node || !this.poll) return;
    const T = (key, holes) => this.T(key, holes);
    const poll = this.poll;
    const editable = poll.editable;
    const chosen = poll.closed?.opt;
    node.innerHTML = poll
      .options()
      .map((option) => {
        const id = escape(option.id);
        const mine = poll.answerOf(poll.who, option.id);
        const good = poll.goodForAll(option.id);
        const votes =
          editable && !this.choosing
            ? `<span class="votes" role="group">${ANSWERED.map((answer) => `<button type="button" data-act="vote" data-id="${id}" data-answer="${answer}" aria-pressed="${mine === answer}" aria-label="${escape(T(answer))}">${EMOJI[answer]}</button>`).join("")}</span>`
            : `<span class="mine">${EMOJI[mine]}</span>`;
        const choose = editable && this.choosing ? `<button type="button" data-act="choose" data-id="${id}" aria-pressed="${this.closing === option.id}">🏁 ${escape(T("choose"))}</button>` : "";
        const remove = editable && !this.choosing && option.by === poll.who ? button("removeOption", T("remove"), "trash-outline", `class="plain" data-id="${id}"`) : "";
        return `<li data-option="${id}" data-good="${good}" class="${option.id === chosen ? "chosen" : ""}">
          <span class="label">${escape(this.rowLabel(option))}</span>
          ${good ? `<span class="badge">${escape(T("goodForBoth"))}</span>` : ""}
          ${this.theirs(option)}${votes}${choose}${remove}</li>`;
      })
      .join("");
  }

  paintFooter() {
    const node = this.view?.querySelector("[data-footer]");
    if (!node || !this.poll) return;
    const T = (key, holes) => this.T(key, holes);
    const poll = this.poll;
    if (!poll.editable) {
      node.innerHTML = "";
      return;
    }
    if (!poll.isMine) {
      node.innerHTML = `<span class="hint">${escape(T("onlyCreator"))}</span>`;
      return;
    }
    const closing = this.closing ? poll.option(this.closing) : null;
    if (closing) {
      node.innerHTML = `<span>${escape(T("confirmClose", { option: labelOf(closing, this.lang) }))}</span>
        <button type="button" class="danger" data-act="confirmClose">🏁 ${escape(T("closePoll"))}</button>
        <button type="button" data-act="cancelClose">${escape(T("cancel"))}</button>`;
    } else if (this.choosing) {
      node.innerHTML = `<span>${escape(T("chooseHint"))}</span><button type="button" data-act="cancelChoose">${escape(T("cancel"))}</button>`;
    } else if (poll.options().length) {
      node.innerHTML = `<button type="button" data-act="closePoll">🏁 ${escape(T("closePoll"))}</button>`;
    } else {
      node.innerHTML = "";
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("ft-poll")) customElements.define("ft-poll", PollElement);
