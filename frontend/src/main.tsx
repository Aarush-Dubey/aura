import React from "react";
import { createRoot } from "react-dom/client";
import "./i18n/i18n";
import { App } from "./App";
import "katex/dist/katex.min.css";
import "./styles/design-system.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
