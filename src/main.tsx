import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "@sentry/react";
import App from "./App";
import "./index.css";
import "./sentry.ts";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root was not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary
      fallback={<div>Something went wrong. The error has been reported.</div>}
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
