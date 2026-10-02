# plugin-poll

**Poll** for [FlickerTalk](https://flickertalk.com): propose dates or options, vote between the two
people of a conversation, and send the chosen date to the calendar.

## What it does

- **Two kinds of poll**: 📅 dates, picked on a calendar of several days, or 📝 text options.
- **Votes**: each one marks ✅ (works for me), 🤔 (maybe) or ❌ (doesn't work) on every option, and
  can take it back. Options where both said ✅ stand out ("✅ Good for both").
- **Anyone adds options**; whoever added an option can remove it. **Whoever created the poll closes
  it** by choosing one option, with a confirmation inside the plugin. After that nobody votes.
- **🔄 Live**, from a conversation: the same poll on both phones, each vote on the other phone as it
  happens. As in List, the other phone opens the poll by itself if Poll is open there; if it does
  not answer within about 8 seconds, Poll says "👤 The other person doesn't have Poll open in this
  conversation. They may not have it, may not have allowed it, or may have it closed." It never
  claims that a vote arrived when it did not.
- **Apart, then together**: what each one does with no connection, or with the poll closed, is kept
  on each phone and joins the other's the next time both have the poll open.
- **📤** puts the result in the conversation's composer as text, in the language of whoever sends
  it, for you to send:

  ```text
  📅 Dinner
  Let's meet on Saturday, October 10 (✅ both)
  ```

- **📆 To the calendar**: once a date poll is closed, 📆 💾 saves the chosen day on the phone as a
  calendar file (`.ics`), which the phone's calendar app opens and adds; 📆 📤 puts the same file in
  the composer instead, so the other person can add it too.
- **21 languages**, right to left in Arabic (the calendar too), dark mode. Days are written by the
  phone's `Intl`, and never move a day in another time zone.

Not in this version: hours, hidden votes, deadlines and reminders, more than two people.

## Privacy

You vote on your phones; options and votes travel encrypted over the direct connection and are not
stored on any server.

- Poll sees its own polls. It never sees the conversation, who the contact is, your calendar or
  anything else on the phone, and it has no network.
- Live messages go through the core's `ft.live`: only over the direct connection between the two
  phones, end-to-end encrypted like every message, never through the mailbox. If the connection is
  relayed by our TURN server, the server sees that there is traffic, never its content.
- Going live may wake the other phone with a push that carries no content.
- What 📤 or 📆 📤 puts in the composer and you send is a message like any other. The calendar file
  carries the question and the day, nothing else: no names, no votes, no contacts. A file saved with
  📆 💾 is a file on the phone like any other download.

## What it uses of the core

| Capability   | What for                                                                       |
| ------------ | ------------------------------------------------------------------------------ |
| `ft.records` | each poll in one record, `poll/<id>`, written on every change (`storage: small`, 4 MB) |
| `ft.live`    | live voting, 1 to 1, in messages of at most 48 KiB (bigger ones go in parts)    |
| `ft.say`     | 📤 (`send: propose`: the text lands in the composer and you send it)            |
| `ft.save`    | 📆 💾: the `.ics` file (`text/calendar`) saved on the phone                     |
| `ft.send`    | 📆 📤: the `.ics` file in the composer (`send: propose`)                         |
| `onOpen`     | `lang`, and `live` (true only from a conversation, with live allowed)           |

Permissions: `{ "live": true, "send": "propose" }`. Needs FlickerTalk core **1.1.0**
(`minCoreVersion`). The contract is in [plugin-sdk](https://github.com/FlickerTalk/plugin-sdk).

## How a poll is kept

The whole poll is one small JSON state, with no CRDT library:

```json
{ "schema": 1, "q": "Dinner?", "kind": "dates", "by": "<creator>",
  "opts": [{ "id": "d20261010", "by": "<who>", "gone": false, "date": "2026-10-10" }],
  "votes": { "<who>": { "<option>": { "a": "yes", "t": 1791900000000 } } },
  "closed": null }
```

Two states join with a merge that gives the same poll in any order and when applied twice
(commutative, associative, idempotent; tested as a property over random states):

- options by union of ids; a removed option (`gone`) is never brought back;
- each participant's vote on an option: the latest `t` wins;
- the close: the first one.

The same shape works for any number of people; the screen and live are for two. A day is kept as
`YYYY-MM-DD` text and only formatted in UTC, so it is the same day in every time zone. The record
also keeps this phone's side of the live session (`who`, `peer`, `shared`); a poll with a higher
`schema` than this plugin knows opens read only.

What comes from the other phone is untrusted. It must be a well-formed poll within its limits
(question 200 characters, option 100, 256 options in the state, 32 voters), and it may only write
what its sender may: its own votes (the envelope's `who` decides whose), options in its own name,
removals of its own options, the close if it created the poll, and the question only when this
phone has none yet. Anything else in it is ignored.

## The live protocol

Poll speaks the common live protocol of FlickerTalk's plugins (the one List defines; `src/live.js`
is List's file, unchanged), with the format `"p": "ftpoll"`. The poll's state travels whole as `u`
inside `sync` and `update`; `have` (`sv`) is the whole state too, and a side answers only with what
would change the other's. A poll already shared is only ever resumed with the same person.

## The calendar file

`src/ics.js` writes it by hand (iCalendar, RFC 5545): one all-day event, `DTSTART;VALUE=DATE` on the
chosen day and `DTEND` the day after, `SUMMARY` the question, a `UID` made from the poll's id (so the
file from either phone is the same event), `DTSTAMP` the moment the poll was closed, text escaped,
lines folded at 75 octets without cutting a character, CRLF line ends. The name is the question,
without anything a file system would choke on, and `.ics`.

## The calendar picker

`src/date-picker.js` is the only file that knows the calendar: [cally](https://github.com/WickyNilliams/cally)
(`calendar-multi`), given the phone's language, direction and first day of the week. If cally turns
out not to work with a finger in the plugin frame, a plain `<input type="date">` can replace that
file alone.

## Development

```sh
npm install
npm test          # Vitest + happy-dom: the merge, the protocol, days, the .ics, the view, two phones
npm run build     # esbuild: src/ → dist/index.js, and THIRD_PARTY_NOTICES.md beside it
```

`dist/` is generated and **committed**: what the catalogue signs is `module.json` + `dist/`. Run
the build before the tests: they check that `dist/` stays under 300 KB, holds no web address and
nothing the plugin frame forbids, and runs. The CI checks too that `dist/` comes from `src/`, and
the licences of the dependencies.

## Licence

MIT. The bundle contains cally and atomico (MIT); their licences are in `THIRD_PARTY_NOTICES.md`.
