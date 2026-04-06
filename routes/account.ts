import { Hono } from "@hono/hono";
import { html } from "@hono/hono/html";

const app = new Hono();

app.get("/", (c) => {
  return c.html(
    // It's important to add html before your `template strings` so that
    // the data is properly escaped and doesn't introduce XSS vulnerabilities.
    html`
      <p>You sent a request to the account route at time=${Date.now()}</p>
    `,
  );
});

export default app;
