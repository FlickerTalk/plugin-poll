// Poll's own texts: the 21 languages of the app, the same keys and holes in each, nothing empty,
// and the plugin's name never written into a text (it comes from the manifest, one place).
import { describe, expect, it } from "vitest";
import { LANGUAGES, makeT, problemsOf } from "../src/i18n.js";
import { STRINGS } from "../src/strings.js";

describe("Poll's catalogue", () => {
  it("speaks the 21 languages of the app, with the same keys and holes in each", () => {
    expect(Object.keys(STRINGS).sort()).toEqual([...LANGUAGES].sort());
    expect(Object.keys(STRINGS.en).length).toBeGreaterThan(40);
    expect(problemsOf(STRINGS)).toEqual([]);
  });

  it("takes the plugin's name from a hole, so renaming it is one change", () => {
    const t = makeT(STRINGS);
    expect(t("en", "silent", { app: "Poll" })).toContain("Poll");
    for (const lang of LANGUAGES) for (const text of Object.values(STRINGS[lang])) expect(text, lang).not.toMatch(/(?<![\p{L}\p{N}])Poll(?![\p{L}\p{N}])/u);
    expect(t("es", "empty")).toBe("Todavía no hay encuestas");
  });

  it("leaves no sentence in English in another language", () => {
    // A single word may be the same ("Live" in German, "Options" in French); a sentence may not.
    for (const lang of LANGUAGES.filter((one) => one !== "en")) {
      const same = Object.keys(STRINGS.en).filter((key) => STRINGS[lang][key] === STRINGS.en[key] && /\p{L}{2,} \p{L}{2,}/u.test(STRINGS.en[key]));
      expect(same, lang).toEqual([]);
    }
  });
});
