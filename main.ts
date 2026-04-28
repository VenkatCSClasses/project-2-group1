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
import { runMigrations, db } from "./database/knex.ts";
import householdStaticRoutes from "./routes/household_static.ts";

// Run db migrations if not already applied
await runMigrations();

// Clean up expired nonces every hour
Deno.cron("cleanup-expired-nonces", "0 * * * *", async () => {
  try {
    await db("may_login_nonce").where("expires_at", "<", db.fn.now()).del();
  } catch (error) {
    console.error("Failed to clean up expired nonces:", error);
  }
});

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
app.route("/household", householdStaticRoutes);
app.route("/api/homepage", homepageRoutes);
app.route("/api/keychain", keychainRoutes);

// End API routes =================================================

showRoutes(app, {
  verbose: true,
});

// Serve the app!
Deno.serve(app.fetch);
