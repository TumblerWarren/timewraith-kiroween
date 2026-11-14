import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ReduceMotionProvider } from "./a11y/ReduceMotionProvider";
import { App } from "./App";
import { ApiProvider } from "./api/ApiProvider";
import { createApi } from "./api/client";
import { AssetProvider } from "./assets/AssetProvider";
import { CaseStoreProvider } from "./cases/store";
import "./styles/index.css";

/** The TimeWraith backend, through the Vite proxy at /api/v1 (see vite.config.ts). */
const API = createApi();

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element in index.html");

// Provider order follows the design: ReduceMotionProvider (with MotionConfig) wraps everything else; the
// AssetProvider hands the bundled manifest to every mascot, so art that passed QA replaces its placeholder.
createRoot(container).render(
  <StrictMode>
    <ReduceMotionProvider>
      <AssetProvider>
        <ApiProvider api={API}>
          <CaseStoreProvider>
            <App />
          </CaseStoreProvider>
        </ApiProvider>
      </AssetProvider>
    </ReduceMotionProvider>
  </StrictMode>,
);
