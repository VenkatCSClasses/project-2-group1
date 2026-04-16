import { Hono } from "@hono/hono";
import { secureHeaders } from "@hono/hono/secure-headers";
import { logger } from "@hono/hono/logger";
import { showRoutes } from "@hono/hono/dev";
import { serveStatic } from "@hono/hono/deno";
import { trimTrailingSlash } from "@hono/hono/trailing-slash";
import accountRoutes from "./routes/account.ts";
import householdRoutes from "./routes/household.ts";
import { ensureSampleHousehold, runMigrations } from "./database/knex.ts";
import keychainRoutes from "./routes/keychain.ts";
import { addHeadHTML, upgradeHTTPS } from "./middlewares.ts";
import homepageRoutes from "./routes/homepage.ts";

// Run db migrations if not already applied
await runMigrations();
await ensureSampleHousehold();

const app = new Hono();

// Various browser security/logging middleware
app.use(secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
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
app.route("/api/homepage", homepageRoutes);
app.route("/api/keychain", keychainRoutes);

// End API routes =================================================

showRoutes(app, {
  verbose: true,
});

// Serve the app!
const hostname = Deno.env.get("HOST") ?? "127.0.0.1";
const port = Number(Deno.env.get("PORT") ?? "8000");

console.log(`Starting SubSeer on http://${hostname}:${port}`);
Deno.serve({ hostname, port }, app.fetch);
