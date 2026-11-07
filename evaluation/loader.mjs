// Register the "@/" alias resolver for the evaluation runner.
//
// Usage:
//   node --import ./evaluation/loader.mjs --experimental-strip-types evaluation/runner.mjs
//
// This mirrors what tsconfig.json's paths mapping does for the Next.js build.

import { register } from "node:module";

register("./alias-loader.mjs", import.meta.url);
