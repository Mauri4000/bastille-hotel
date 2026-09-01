import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n/index.ts";
import "./index.css";
import App from "./App.tsx";

// Select-all on focus for number inputs — prevents "040" issue when typing over existing value
document.addEventListener('focus', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
    e.target.select();
  }
}, true);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
