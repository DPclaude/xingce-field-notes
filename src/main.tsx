import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "katex/dist/katex.min.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    let requestedUpdate = false;
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((reg) => {
        const announce = () => window.dispatchEvent(new Event("app-update"));
        if (reg.waiting) announce();
        reg.addEventListener("updatefound", () => {
          reg.installing?.addEventListener("statechange", () => {
            if (reg.waiting && navigator.serviceWorker.controller) announce();
          });
        });
        window.addEventListener("apply-update", () => {
          requestedUpdate = true;
          reg.waiting?.postMessage({ type: "ACTIVATE" });
        });
      })
      .catch(() => {});
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (
        requestedUpdate &&
        navigator.serviceWorker.controller &&
        !refreshing
      ) {
        refreshing = true;
        location.reload();
      }
    });
  });
}
