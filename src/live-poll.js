// A poll as the replica of the common live protocol (`live.js`), with no Yjs: what this side has
// is its whole state (JSON), what the twin lacks is this side's whole state when merging it would
// change the twin's, and every change made here sends the whole state. A poll is small (at most
// 256 options and a few votes each); `live.js` splits what does not fit in one message.
//
// The state rides as `u` inside the protocol's `sync` and `update`, not as a kind of its own:
// that keeps `live.js` as it is (plan §12 sketched a `state` kind; this is the same state).
//
// `live.js` hands `apply` only the payload, not who sent it, and a poll must know the sender to
// take only what the sender may write. So the plugin tells the replica the envelope's `who` with
// `from(who)` right before `session.hear(message)`; messages are handled one after another
// (`inOrder`), so it is always the sender of the message being heard.

import { LOCAL, canonical, merge, normalise } from "./poll.js";

export function pollReplica(poll) {
  let sender = null;
  const read = (text) => normalise(JSON.parse(text));
  return {
    /** The `who` of the envelope about to be heard. */
    from(who) {
      sender = who;
    },
    have: () => JSON.stringify(poll.state()),
    missing(have) {
      const theirs = read(have);
      return canonical(merge(theirs, poll.state())) === canonical(theirs) ? null : JSON.stringify(poll.state());
    },
    apply(payload) {
      if (!sender) throw new Error("who sent this is not known");
      poll.take(JSON.parse(payload), sender);
    },
    onChange(listener) {
      return poll.onChange((origin) => {
        if (origin === LOCAL) listener(JSON.stringify(poll.state()));
      });
    },
  };
}
