import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "@sentry/react";
import * as Sentry from "@sentry/react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import App from "./App";
import "./index.css";
import "./sentry.ts";

Sentry.init({
  dsn: "https://3ee482487035cdb1620b04057216101a@o4511430903988224.ingest.us.sentry.io/4511430909755392",
  integrations: [
    Sentry.reactRouterV6BrowserTracingIntegration({
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  environment: import.meta.env.MODE,
});

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
    <Sentry.ErrorBoundary fallback={<p>Something went wrong.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
