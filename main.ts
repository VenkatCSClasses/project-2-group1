import { Hono } from "@hono/hono";
import { secureHeaders } from "@hono/hono/secure-headers";
import { logger } from "@hono/hono/logger";
import { showRoutes } from "@hono/hono/dev";
import { serveStatic } from "@hono/hono/deno";
import { trimTrailingSlash } from "@hono/hono/trailing-slash";
import accountRoutes from "./routes/account.ts";
import keychainRoutes from "./routes/keychain.ts";
import { addHeadHTML, upgradeHTTPS } from "./middlewares.ts";
import homepageRoutes from "./routes/homepage.ts";
import { runMigrations } from "./database/knex.ts";
import householdRoutes from "./routes/household.ts";
import householdStaticRoutes from "./routes/household_static.ts";

// Run db migrations if not already applied
await runMigrations();

const app = new Hono();

// Various browser security/logging middleware
app.use(secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
  },
}));

app.use(trimTrailingSlash());

app.use(logger());

// Upgrade to HTTPS (unless on localhost)
app.use(upgradeHTTPS(["0.0.0.0", "127.0.0.1", "localhost"]));

// Very basic template that adds some default <head> tags to all static routes
app.use(addHeadHTML());

// Static file serving
app.use(
  "*",
  serveStatic({
    root: "static/",
    rewriteRequestPath: (
      path,
    ) =>
      path.includes(".")
        ? path
        : (path == "/" ? "/index.html" : `${path}.html`),
  }),
);

// All routes go here =============================================

app.route("/api/account", accountRoutes);
app.route("/api/household", householdRoutes);
app.route("/household", householdStaticRoutes);
app.route("/api/homepage", homepageRoutes);
app.route("/api/keychain", keychainRoutes);

// End API routes =================================================

showRoutes(app, {
  verbose: true,
});

// Serve the app!
Deno.serve(app.fetch);
