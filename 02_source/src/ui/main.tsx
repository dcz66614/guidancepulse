/**
 * Dashboard entry point — P025 GuidancePulse, T008.
 *
 * Renders the local timeline with the synthetic demo model. The same
 * `App` component renders real store data in the static report
 * (see src/report/report.ts); this entry point is the interactive
 * local demo served by `vite build` / `vite preview` on 127.0.0.1.
 */

import { createRoot } from "react-dom/client";
import App from "./App.js";
import { buildDemoModel } from "./demo-data.js";
import "./styles.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("UI_MISSING_ROOT: no #root element in index.html");
}
createRoot(rootElement).render(<App model={buildDemoModel()} />);
