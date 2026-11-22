# Third-Party Notices — P025 GuidancePulse

GuidancePulse itself is MIT-licensed (see `LICENSE`). This file lists
the third-party packages declared in `package.json` (direct
dependencies and development dependencies), with the license each
package declares in its own `package.json` as installed in
`node_modules/` at the time of writing (2026-11-15). The full license
text of each package ships with that package under `node_modules/`;
transitive dependencies are pinned by `package-lock.json` and are not
listed individually here.

## Direct dependencies (shipped / used at runtime)

| Package | Version | License |
|---|---|---|
| better-sqlite3 | 13.2.0 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| yaml | 2.8.1 | ISC |

Notes:

- `better-sqlite3` vendors the SQLite library (public domain) and
  ships prebuilt native binaries (`prebuilds/*.node`); its own code
  is MIT-licensed (Copyright (c) 2017 Joshua Wise). GuidancePulse
  vendors `better-sqlite3` (and `yaml`) into installed projects
  under `.guidancepulse/hooks/.build/node_modules/` — the vendored
  copies keep their own `package.json` and `LICENSE` files.
- `yaml` is ISC-licensed (Copyright Eemeli Aro).

## Development dependencies (build / test only, not shipped)

| Package | Version | License |
|---|---|---|
| @testing-library/jest-dom | 6.9.1 | MIT |
| @testing-library/react | 16.3.3 | MIT |
| @types/better-sqlite3 | 9.6.0 | MIT |
| @types/node | 24.10.1 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @vitejs/plugin-react | 5.2.0 | MIT |
| ajv | 8.17.1 | MIT |
| jsdom | 27.4.0 | MIT |
| playwright-core | 1.65.1 | Apache-2.0 |
| typescript | 5.9.3 | Apache-2.0 |
| vite | 7.3.8 | MIT |
| vite-node | 3.2.4 | MIT |
| vitest | 3.2.4 | MIT |

If a dependency is upgraded, this list must be regenerated from the
installed `node_modules/*/package.json` license fields and
`package-lock.json`.
