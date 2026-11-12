import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIST = join(import.meta.dirname, "dist");
const CAP = 300 * 1024;
const NAMESPACES = ["http://www.w3.org/2000/svg", "http://www.w3.org/1999/xhtml", "http://www.w3.org/1999/xlink", "http://www.w3.org/XML/1998/namespace"];
const IN_NOTICES = ["http://ionic.io/"];

function files(dir = DIST) {
  const all = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) all.push(...files(path));
    else all.push(path);
  }
  return all;
}

describe("the package", () => {
  it("is one bundle and the notices, under the cap", () => {
    const names = files().map((path) => path.slice(DIST.length + 1)).sort();
    expect(names).toEqual(["THIRD_PARTY_NOTICES.md", "index.js"]);
    const total = files().reduce((sum, path) => sum + statSync(path).size, 0);
    expect(total).toBeGreaterThan(20_000);
    expect(total).toBeLessThan(CAP);
  });

  it("has no web address in any file", () => {
    for (const path of files()) {
      const text = readFileSync(path, "utf8");
      expect(text, path).not.toMatch(/https:\/\//i);
      const plain = [...text.matchAll(/http:\/\/[^\s"'`)<>]*/gi)].map((match) => match[0]);
      const allowed = path.endsWith("THIRD_PARTY_NOTICES.md") ? [...NAMESPACES, ...IN_NOTICES] : NAMESPACES;
      for (const address of plain) expect(allowed, `${path}: ${address}`).toContain(address);
    }
  });

  it("uses nothing the frame forbids: no network, no eval, no workers, no browser storage, no modals", () => {
    const code = readFileSync(join(DIST, "index.js"), "utf8");
    for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\beval\s*\(/, /new Function\s*\(/, /\bWorker\s*\(/, /SharedWorker/, /WebAssembly/, /localStorage/, /sessionStorage/, /indexedDB/, /\bconfirm\s*\(/, /\bprompt\s*\(/, /\balert\s*\(/, /\bimport\s*\(/]) {
      expect(code, String(forbidden)).not.toMatch(forbidden);
    }
    expect(code).toContain("ft-poll");
    expect(code).toContain("calendar-multi");
  });

  it("runs as it is: the bundle defines the element and keeps a poll through the fake core", async () => {
    const { fakeCore } = await import("./test/fake-core.js");
    const core = fakeCore();
    globalThis.ft = core.ft;
    await import("./dist/index.js");
    const element = document.createElement("ft-poll");
    document.body.append(element);
    await core.open({ live: false });
    const field = element.querySelector('[data-entry="new"]');
    field.querySelector("input").value = "Dinner?";
    field.querySelector("[data-act]").click();
    for (let at = 0; at < 50; at += 1) await Promise.resolve();
    await element.keeper.settled();
    expect(element.querySelector("[data-name]").textContent).toBe("Dinner?");
    expect(element.querySelector("[data-picker] calendar-multi")).not.toBeNull();
    expect([...core.records.keys()]).toEqual([`poll/local/${element.poll.id}`]);
  });

  it("carries the licence of everything inside the bundle", () => {
    const notices = readFileSync(join(DIST, "THIRD_PARTY_NOTICES.md"), "utf8");
    expect(notices).toBe(readFileSync(join(import.meta.dirname, "THIRD_PARTY_NOTICES.md"), "utf8"));
    for (const name of ["cally 0.9.2", "atomico", "Ionicons 8.1.0"]) expect(notices).toContain(name);
    expect(notices).toContain(readFileSync(join(import.meta.dirname, "node_modules", "ionicons", "LICENSE"), "utf8").trim());
    expect(notices.match(/Permission is hereby granted, free of charge/g).length).toBeGreaterThanOrEqual(3);
  });
});

describe("the image of the Apps grid", () => {
  const image = join(import.meta.dirname, "icon.svg");

  it("is a square 64 × 64 SVG of at most 4 KB at the root of the package, and not inside dist/", () => {
    expect(existsSync(image), "icon.svg").toBe(true);
    expect(statSync(image).size).toBeLessThanOrEqual(4096);
    const svg = readFileSync(image, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(existsSync(join(import.meta.dirname, "dist", "icon.svg"))).toBe(false);
  });
});
