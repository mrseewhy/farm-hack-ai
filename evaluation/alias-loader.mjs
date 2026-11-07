// Resolve the app's "@/..." alias for Node's ESM loader.
//
// The Next.js bundler resolves "@/lib/foo" to the repo root, but Node does not.
// The evaluation runner imports lib/ai.ts directly, so this hook maps "@/..."
// to the file on disk and appends the extension Node needs (.ts/.tsx/.js).

import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

function resolveAliasTarget(specifier) {
  const base = resolvePath(projectRoot, specifier.slice(2));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mjs`,
    `${base}.js`,
    resolvePath(base, "index.ts"),
    resolvePath(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  // Fall through to the likely TS path so Node reports a useful error.
  return `${base}.ts`;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(pathToFileURL(resolveAliasTarget(specifier)).href, {
      ...context,
      shortCircuit: true,
    });
  }
  return nextResolve(specifier, context);
}
