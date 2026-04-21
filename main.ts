import { Hono } from "@hono/hono";
import type { Context } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { secureHeaders } from "@hono/hono/secure-headers";
import { logger } from "@hono/hono/logger";
import { trimTrailingSlash } from "@hono/hono/trailing-slash";
import { showRoutes } from "@hono/hono/dev";
import { serveStatic } from "@hono/hono/deno";
import { setJWTCookie } from "./cryptography.ts";
import { db } from "./database/knex.ts";
import accountRoutes from "./routes/account.ts";
import householdRoutes from "./routes/household.ts";
import { runMigrations } from "./database/knex.ts";
import homepageRoutes from "./routes/homepage.ts";

// Run db migrations if not already applied
await runMigrations();

const app = new Hono();

// Various browser security/logging middleware
app.use(trimTrailingSlash());
app.use(secureHeaders());
app.use("/api/*", cors({ 
  origin: ["http://127.0.0.1:8000", "http://localhost:8000"],
  credentials: true,
})); // should be reduced in the future to only the published URL
app.use(logger());

// Static file serving
app.use("/static/*", serveStatic({ root: "./" }));
app.get("/", serveStatic({ path: "./static/index.html" }));
app.get("/household", serveStatic({ path: "./static/household.html" }));
app.get("/login", serveStatic({ path: "./static/login.html" }));
app.get("/signup", serveStatic({ path: "./static/signup.html" }));
app.get("/homepage", serveStatic({ path: "./static/homepage.html" }));

// Test endpoint for Blake to access homepage
app.get("/test-blake-login", async (c) => {
  const blakeUsername = "blake";
  const existingUser = await db("user_account")
    .select("user_id")
    .where({ username: blakeUsername })
    .first();

  const createdUsers = existingUser ? [] : await db("user_account")
    .insert({
      username: blakeUsername,
      public_key: new Uint8Array(),
      password_salt: new Uint8Array(),
      encrypted_private_key: new Uint8Array(),
    })
    .returning(["user_id"]);

  const userId = existingUser?.user_id ?? createdUsers[0].user_id;

  const dummyJoinCode = 111111;
  const existingHousehold = await db("household")
    .select("household_id")
    .where({ join_code: dummyJoinCode })
    .first();

  const createdHouseholds = existingHousehold ? [] : await db("household")
    .insert({
      household_name: "Blake Test Household",
      join_code: dummyJoinCode,
    })
    .returning(["household_id"]);

  const householdId = existingHousehold?.household_id ?? createdHouseholds[0].household_id;

  const existingMembership = await db("household_membership")
    .select("user_id")
    .where({ user_id: userId, household_id: householdId })
    .first();

  if (!existingMembership) {
    await db("household_membership").insert({
      user_id: userId,
      household_id: householdId,
      role: "Manager",
    });
  }

  await setJWTCookie(userId, c as Context);
  
  return c.redirect("/homepage");
});

app.route("/api/account", accountRoutes);
app.route("/api/household", householdRoutes);
app.route("/api/homepage", homepageRoutes);

showRoutes(app, {
  verbose: true,
});

// Serve the app!
const hostname = Deno.env.get("HOST") ?? "127.0.0.1";
const port = Number(Deno.env.get("PORT") ?? "8000");

console.log(`Starting SubSeer on http://${hostname}:${port}`);
Deno.serve({ hostname, port }, app.fetch);
