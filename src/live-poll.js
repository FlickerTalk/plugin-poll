import { LOCAL, canonical, merge, normalise } from "./poll.js";

export function pollReplica(poll) {
  let sender = null;
  const read = (text) => normalise(JSON.parse(text));
  return {
    /** Call right before session.hear(). apply() isn't told the sender, and inOrder keeps it to one
     *  message at a time, so this is always the sender of the message being heard. */
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
