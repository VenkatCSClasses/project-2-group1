import { Hono } from "@hono/hono";
import { secureHeaders } from "@hono/hono/secure-headers";
import { logger } from "@hono/hono/logger";
import { trimTrailingSlash } from "@hono/hono/trailing-slash";
import { showRoutes } from "@hono/hono/dev";
import { serveStatic } from "@hono/hono/deno";
import accountRoutes from "./routes/account.ts";
import { upgradeHTTPS } from "./upgradeHTTPS.ts";

const app = new Hono();

// Various browser security/logging middleware
app.use(trimTrailingSlash());
app.use(secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
  },
}));
app.use(logger());

// Upgrade to HTTPS (unless on localhost)
app.use(upgradeHTTPS(["0.0.0.0", "127.0.0.1", "localhost"]));

// Static file serving
app.use("*", serveStatic({ root: "static/" }));

// All routes go here =============================================

app.route("/api/account", accountRoutes);

// End API routes =================================================

showRoutes(app, {
  verbose: true,
});

// Serve the app!
Deno.serve(app.fetch);
