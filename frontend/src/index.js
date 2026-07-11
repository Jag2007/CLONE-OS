// Prevent ResizeObserver "loop completed with undelivered notifications" by
// deferring callbacks to the next frame (so layout doesn't re-trigger in same turn).
const OriginalRO = window.ResizeObserver;
window.ResizeObserver = class extends OriginalRO {
  constructor(callback) {
    super((entries, observer) => {
      requestAnimationFrame(() => {
        callback(entries, observer);
      });
    });
  }
};

import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import QueryProvider from "./provider/QueryProvider";

// Fallback: suppress ResizeObserver error if it still fires (e.g. in some browsers).
window.addEventListener(
  "error",
  (e) => {
    if (
      e.message ===
      "ResizeObserver loop completed with undelivered notifications."
    ) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return true;
    }
  },
  true,
);

const root = ReactDOM.createRoot(document.getElementById("root"));

// StrictMode omitted: dev double-mount can make animated route trees feel like they load twice.
root.render(
  <QueryProvider>
    <App />
  </QueryProvider>,
);
