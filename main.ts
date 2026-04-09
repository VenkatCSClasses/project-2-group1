import { Hono } from "@hono/hono";
import { secureHeaders } from "@hono/hono/secure-headers";
import { logger } from "@hono/hono/logger";
import { showRoutes } from "@hono/hono/dev";
import { serveStatic } from "@hono/hono/deno";
import accountRoutes from "./routes/account.ts";
import { addHeadHTML, upgradeHTTPS } from "./middlewares.ts";

const app = new Hono();

// Various browser security/logging middleware
app.use(secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
  },
}));
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
        : (path.endsWith("/") ? `${path}index.html` : `${path}.html`),
  }),
);

// All routes go here =============================================

app.route("/api/account", accountRoutes);

// End API routes =================================================

showRoutes(app, {
  verbose: true,
});

// Serve the app!
Deno.serve(app.fetch);
