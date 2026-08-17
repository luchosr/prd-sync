import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts"],
  // tsdown defaults to a fixed ".mjs" extension for the "node" platform
  // regardless of package.json's "type": "module" (verified empirically —
  // design §8 assumed no config change was needed here, which turned out
  // to be wrong). package.json's `bin` field points at "./dist/cli.js", so
  // the output extension must match; ".js" is unambiguous ESM anyway
  // because of "type": "module".
  fixedExtension: false,
});
