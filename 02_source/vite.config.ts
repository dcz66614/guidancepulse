/**
 * Vite config — P025 GuidancePulse, T008.
 *
 * React 19 + Vite 7 (frozen stack, IMPLEMENTATION_PLAN §1). The
 * dashboard is a local-only app: it is built to `dist/` and served on
 * 127.0.0.1. `base: "./"` makes the built assets relative, so the
 * output also opens from disk. No CDN, no remote font, no external
 * URL is referenced anywhere in the bundle (verified by
 * `npm run test:ui-offline`).
 */

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
});
