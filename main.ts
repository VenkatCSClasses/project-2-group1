import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { secureHeaders } from "@hono/hono/secure-headers";
import { logger } from "@hono/hono/logger";
import { trimTrailingSlash } from "@hono/hono/trailing-slash";
import { showRoutes } from "@hono/hono/dev";
import { serveStatic } from "@hono/hono/deno";
import accountRoutes from "./routes/account.ts";
import householdRoutes from "./routes/household.ts";

const app = new Hono();

// Various browser security/logging middleware
app.use(trimTrailingSlash());
app.use(secureHeaders());
app.use("/api/*", cors({ origin: "*" })); // should be reduced in the future to only the published URL
app.use(logger());

// Static file serving
app.use("/static/*", serveStatic({ root: "./" }));
app.get("/", serveStatic({ path: "./static/index.html" }));

app.route("/api/account", accountRoutes);
app.route("/api/household", householdRoutes);

showRoutes(app, {
  verbose: true,
});

// Serve the app!
Deno.serve(app.fetch);
