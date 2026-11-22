/**
 * Vendored runtime dependencies for installed Hook entries —
 * P025 GuidancePulse, FIX-T013 (F-17).
 *
 * Root cause (T013 final review, F-17): `install` compiled
 * `scripts/hook-entry.ts` with bare `tsc` and the compiled output
 * kept bare imports of `yaml` and `better-sqlite3`. Node ESM
 * resolves those by walking up from the importing file, so in any
 * project outside the source tree there was no `node_modules` above
 * `.guidancepulse/hooks/.build/` and every installed Hook failed
 * with `HOOK_ENTRY_FAILED` / `Cannot find package 'yaml'` (exit 2).
 *
 * Fix (option (b) from the review pack — vendor dependencies at
 * install time; chosen over bundling because `better-sqlite3`
 * carries a native `.node` binary no JS bundler can inline, and
 * vendoring keeps the compiled entry byte-identical to the form the
 * S0 perf harness measures):
 *
 *   - `install` copies the two runtime packages the compiled entry
 *     needs into `<project>/.guidancepulse/hooks/.build/node_modules/`
 *     (`yaml` whole, `better-sqlite3` as package.json + LICENSE +
 *     `lib/` + all `prebuilds/*.node`). Node finds them walking up
 *     from `.build/src/config/parse.js` / `.build/src/store/store.js`.
 *   - Only files the Hook needs at runtime are copied:
 *     `better-sqlite3`'s `deps/` (SQLite amalgamation sources),
 *     `src/` (C++ sources) and `binding.gyp` are build-time only and
 *     are left behind; its only runtime dependency,
 *     `node-addon-api`, is a header-only build dependency and is
 *     never `require`d by `lib/`. All eight platform prebuilds are
 *     copied (about 17 MB) so an installed project keeps working if
 *     its directory is later opened on another supported platform
 *     without a re-install; a re-install refreshes the vendored copy
 *     for the installing platform anyway.
 *   - Install stays offline: this is a local file copy from the
 *     source tree's own `node_modules`, never `npm install`.
 *   - `uninstall` removes `.guidancepulse/hooks/.build/` (compiled
 *     entry + vendored deps); launchers, config, DB and path key
 *     stay, per the uninstall contract.
 *
 * The S0 perf harness (`scripts/perf-hook.ts`) vendors the same two
 * packages into its `.hook-build/` dir, so the measured entry
 * resolves its dependencies exactly the way an installed entry
 * does. This module has no runtime dependency of its own and never
 * touches the network.
 */

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** Runtime packages the compiled hook entry imports bare. */
export const VENDORED_RUNTIME_DEPS: readonly string[] = ["yaml", "better-sqlite3"] as const;

/**
 * Copy the runtime dependencies the compiled hook entry needs from
 * the source tree's `node_modules` into `<buildDir>/node_modules/`,
 * so the entry resolves them no matter where the project lives.
 * Throws an `Error` when a required package (or a required part of
 * it) is missing from the source tree — the caller turns that into
 * a build failure instead of installing hooks that cannot run.
 * Returns the vendored package names, in order.
 */
export function vendorHookDependencies(sourceRoot: string, buildDir: string): string[] {
  const sourceModules = join(sourceRoot, "node_modules");
  const destModules = join(buildDir, "node_modules");
  mkdirSync(destModules, { recursive: true });

  // yaml: pure JS, no runtime dependencies — copy the whole package.
  const yamlSrc = join(sourceModules, "yaml");
  if (!existsSync(join(yamlSrc, "package.json")) || !existsSync(join(yamlSrc, "dist", "index.js"))) {
    throw new Error(`runtime dependency 'yaml' is missing or incomplete in ${sourceModules}`);
  }
  cpSync(yamlSrc, join(destModules, "yaml"), { recursive: true, dereference: true });

  // better-sqlite3: CJS entry (lib/) + native prebuilds. Only the
  // files the Hook loads at runtime are copied: package.json,
  // LICENSE, lib/** and prebuilds/**. deps/, src/ and binding.gyp
  // are build-time only; node-addon-api is never required by lib/.
  const sqliteSrc = join(sourceModules, "better-sqlite3");
  const sqliteDest = join(destModules, "better-sqlite3");
  const requiredSqlite = [
    join(sqliteSrc, "package.json"),
    join(sqliteSrc, "lib", "index.js"),
    join(sqliteSrc, "lib", "binding.js"),
    join(sqliteSrc, "lib", "database.js"),
  ];
  for (const required of requiredSqlite) {
    if (!existsSync(required)) {
      throw new Error(`runtime dependency 'better-sqlite3' is missing or incomplete in ${sourceModules} (missing ${required})`);
    }
  }
  if (!existsSync(join(sqliteSrc, "prebuilds"))) {
    throw new Error(`runtime dependency 'better-sqlite3' has no prebuilds/ in ${sourceModules}`);
  }
  mkdirSync(sqliteDest, { recursive: true });
  cpSync(join(sqliteSrc, "package.json"), join(sqliteDest, "package.json"), { dereference: true });
  if (existsSync(join(sqliteSrc, "LICENSE"))) {
    cpSync(join(sqliteSrc, "LICENSE"), join(sqliteDest, "LICENSE"), { dereference: true });
  }
  cpSync(join(sqliteSrc, "lib"), join(sqliteDest, "lib"), { recursive: true, dereference: true });
  cpSync(join(sqliteSrc, "prebuilds"), join(sqliteDest, "prebuilds"), {
    recursive: true,
    dereference: true,
  });
  return [...VENDORED_RUNTIME_DEPS];
}
