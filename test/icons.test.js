// Every icon of Poll's interface is an Ionicon (brief-iconos, 2026-10-02), drawn through one
// function, `icon(name, { label })`, so that moving to `<ion-icon>` later is one change. The app
// lends some (`./icon/<name>.svg`, painted as a CSS mask); the rest travel inside the bundle as the
// exact SVG of the `ionicons` package the app uses (8.1.0, MIT).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ICONS, OWN_ICONS, icon } from "../src/icons.js";

/**
 * What the app lends, copied from `ICONS` in app `src-tauri/src/plugins.rs`, branch
 * `games-section`, commit c3df572. A name not here would be a broken icon in the frame.
 */
const LENT_BY_THE_APP = [
  "add-outline", "alarm-outline", "arrow-back-outline", "arrow-redo-outline", "arrow-undo-outline", "arrow-up-outline", "brush-outline",
  "calculator-outline", "chatbubble-outline", "checkmark-outline", "close-outline", "cloud-done-outline", "cloud-outline", "cloud-upload-outline",
  "color-palette-outline", "crop-outline", "document-text-outline", "download-outline", "ellipsis-horizontal-outline", "expand-outline",
  "eye-outline", "folder-open-outline", "folder-outline", "grid-outline", "hand-left-outline", "image-outline", "key-outline", "link-outline",
  "location-outline", "lock-closed-outline", "move-outline", "options-outline", "pause-outline", "pencil-outline", "play-outline",
  "refresh-outline", "remove-outline", "resize-outline", "save-outline", "search-outline", "send-outline", "square-outline", "text-outline",
  "time-outline", "trash-outline",
];

const ionicon = (name) => readFileSync(join(import.meta.dirname, "..", "node_modules", "ionicons", "dist", "svg", `${name}.svg`), "utf8").trim();

describe("the icons", () => {
  it("asks the app only for icons the app lends", () => {
    expect(APP_ICONS.length).toBeGreaterThan(0);
    for (const name of APP_ICONS) expect(LENT_BY_THE_APP, name).toContain(name);
  });

  it("carries its own only when the app does not lend them, each the exact SVG of ionicons", () => {
    expect(Object.keys(OWN_ICONS).length).toBeGreaterThan(0);
    for (const [name, svg] of Object.entries(OWN_ICONS)) {
      expect(LENT_BY_THE_APP, name).not.toContain(name);
      expect(svg, name).toBe(ionicon(name));
      expect(svg).not.toMatch(/https:|<script|\bon[a-z]+=/i);
    }
  });

  it("draws a lent icon as a mask and an own one inline, hidden from screen readers unless labelled", () => {
    const lent = icon("send-outline");
    expect(lent).toContain("./icon/send-outline.svg");
    expect(lent).toContain('data-icon="send-outline"');
    expect(lent).toContain('aria-hidden="true"');
    const own = icon("calendar-outline");
    expect(own).toContain(OWN_ICONS["calendar-outline"]);
    expect(own).toContain('data-icon="calendar-outline"');
    expect(own).toContain('aria-hidden="true"');
    const labelled = icon("star-outline", { label: 'Good "for" both' });
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Good &quot;for&quot; both"');
    expect(labelled).not.toContain("aria-hidden");
    expect(() => icon("no-such-icon")).toThrow();
  });
});
