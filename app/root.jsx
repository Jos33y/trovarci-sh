import {
  Links,
  Meta,
  Outlet,
  Scripts,
  isRouteErrorResponse,
  useLocation,
} from "react-router";
import { useEffect } from "react";

import { getOptionalUser } from "~/utils/session.server";
import { TELEMETRY_CLIENT_SOURCE } from "~/utils/telemetryClient";

import globalStyles from "~/styles/global.css?url";
import animationStyles from "~/styles/animations.css?url";

export const links = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Anybody:wght@700;900&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap",
  },
  { rel: "stylesheet", href: globalStyles },
  { rel: "stylesheet", href: animationStyles },
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  { rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
  { rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/site.webmanifest" },
];

/**
 * Root meta is intentionally empty for charSet/viewport/theme-color.
 *
 * In React Router v7, child routes that export their own `meta` REPLACE
 * the parent's meta entirely - they do not merge by default. Putting
 * viewport here meant any route with its own meta export (Email Scorer,
 * Verifier, credits pending, etc.) silently dropped the viewport tag,
 * which is why mobile rendered at the 980px synthetic-desktop fallback.
 *
 * Those three tags now live as STATIC markup in <head> below (in the
 * Layout component). They can never be overridden by route-level meta
 * and apply uniformly across the entire app.
 */
export const meta = () => [];

/**
 * Root loader. Runs on every request, on every route.
 *
 * Returns the current user (from opaque session cookie) or null. The Header,
 * Footer, and any deep component can read this via:
 *
 *   const { user } = useRouteLoaderData('root') ?? {};
 *
 * Cost of this loader for anonymous traffic is a cookie-parse + null return
 * (no DB hit). For authenticated traffic it's a single indexed lookup on
 * sessions.token_hash, which is sub-millisecond.
 */
export async function loader({ request }) {
  const user = await getOptionalUser(request);

  // Note: page views are recorded client-side via the telemetry beacon
  // (see telemetryClient.js + /api/telemetry/beacon). We deliberately
  // DON'T record an SSR pageview here because:
  //   1. RR v7 invokes the root loader on every client-side navigation
  //      as a .data fetch, which would either double-count real users
  //      or require us to discriminate document vs data requests
  //      (fragile).
  //   2. The client beacon already covers the only audience that
  //      matters (humans with JS); bots are filtered upstream by
  //      isbot, and no-JS scrapers don't fund the business.
  //   3. One source = one funnel definition = one set of dashboards.

  return { user };
}

export function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Static head tags - never overridden by route meta exports. */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#09090B" />

        <Meta />
        <Links />
      </head>
      <body>
        {/* Page entrance - server-rendered, fades after hydration */}
        <div id="page-loader" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1.5" y="1.5" width="45" height="45" rx="11" fill="#09090B" stroke="#D4A843" strokeWidth="1.5" />
            <path d="M24 7L11 13.5V24C11 28.5 13 32.5 16 35.5C18.5 38 21.2 39.8 24 41C26.8 39.8 29.5 38 32 35.5C35 32.5 37 28.5 37 24V13.5L24 7Z" fill="none" stroke="#D4A843" strokeWidth="2" strokeLinejoin="round" />
            <path d="M27 13L17.5 25H22.5L20 36L32 23H26L27 13Z" fill="#D4A843" />
          </svg>
          <div id="page-loader-bar"><div id="page-loader-fill" /></div>
        </div>
        {children}
        <Scripts />
        {/* Client telemetry: pageview beacon + window.onerror /
            unhandledrejection capture. Inlined (not a separate bundle
            chunk) so it runs before hydration completes and survives
            React render crashes. Source lives in
            app/utils/telemetryClient.server.js. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: TELEMETRY_CLIENT_SOURCE }}
        />
      </body>
    </html>
  );
}

export default function App() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    document.body.setAttribute('data-hydrated', '');
  }, []);

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return <Outlet />;
}

export function ErrorBoundary({ error }) {
  let status = 500;
  let message = "Something went wrong";
  let desc = "An unexpected error occurred. Try refreshing the page.";

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (status === 404) {
      message = "Page not found";
      desc = "The page you're looking for doesn't exist or has been moved.";
    } else {
      message = error.statusText || message;
    }
  }

  // Client-side: if this boundary rendered for a non-route 5xx, fire
  // the beacon so the error_events table sees that the user actually
  // landed on the error page (not just that the server logged it).
  // Wrapped in a try/catch + typeof check to handle SSR safely.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isRouteErrorResponse(error) && error.status === 404) return;
    try {
      const payload = {
        type: 'error',
        kind: 'client_route',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error ?? 'Route error'),
        stack: error instanceof Error ? error.stack || null : null,
        path: window.location.pathname,
        url: window.location.href,
        context: { source: 'ErrorBoundary', status },
      };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/telemetry/beacon', blob);
      }
    } catch {
      // Telemetry failure must never crash the error page.
    }
  }, [error, status]);

  const linkStyle = {
    color: "#D4A843",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
    transition: "color 0.15s ease",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
        color: "#FAFAFA",
        backgroundColor: "#09090B",
        padding: "24px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            fontWeight: 600,
            color: "#52525B",
            letterSpacing: "0.06em",
            marginBottom: 16,
          }}
        >
          ERROR {status}
        </p>

        <h1
          style={{
            fontFamily: "'Anybody', sans-serif",
            fontSize: "clamp(2.5rem, 8vw, 5rem)",
            fontWeight: 900,
            color: "#D4A843",
            letterSpacing: "-0.03em",
            lineHeight: 1,
            marginBottom: 16,
          }}
        >
          {status}
        </h1>

        <p style={{ fontSize: 20, fontWeight: 500, color: "#FAFAFA", marginBottom: 8 }}>
          {message}
        </p>

        <p style={{ fontSize: 15, color: "#A1A1AA", lineHeight: 1.6, marginBottom: 32 }}>
          {desc}
        </p>

        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "12px 28px",
            backgroundColor: "#D4A843",
            color: "#09090B",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 15,
            textDecoration: "none",
          }}
        >
          Back to Home
        </a>

        {status === 404 && (
          <div style={{ marginTop: 48, borderTop: "1px solid #27272A", paddingTop: 32 }}>
            <p
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: 600,
                color: "#52525B",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              Try these instead
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px 24px" }}>
              <a href="/score" style={linkStyle}>Email Scorer</a>
              <a href="/domain" style={linkStyle}>Domain Checker</a>
              <a href="/verify" style={linkStyle}>Email Verifier</a>
              <a href="/records" style={linkStyle}>DNS Generator</a>
              <a href="/smtp-test" style={linkStyle}>SMTP Tester</a>
              <a href="/blog" style={linkStyle}>Blog</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
