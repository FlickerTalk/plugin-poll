// Builds `dist/` from `src/`: one bundle with cally and atomico inside, and the licences of what it
// carries beside it. The package the catalogue signs is `module.json` + `dist/`.
//
// Unlike List, nothing of the libraries needs changing on the way in: cally and atomico hold no
// web address (only the SVG namespace, a name that is never fetched) and do not touch browser
// storage. `build.test.js` checks that this stays true.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  minify: true,
  target: ["es2022"],
  outfile: "dist/index.js",
  legalComments: "none",
  logLevel: "info",
});

copyFileSync("THIRD_PARTY_NOTICES.md", "dist/THIRD_PARTY_NOTICES.md");
