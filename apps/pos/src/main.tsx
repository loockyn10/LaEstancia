import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@pet-shop/ui";
import "@pet-shop/ui/styles.css";
import { App } from "./App";
import { config } from "./config/env";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary showDetails={config.isDev}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
