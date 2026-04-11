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

// Route to return manager household information
app.get("/manager-households", async (c) => {
  let managerHTML: string = "";
  return c.html(
    html`
        <p>${managerHTML}</p>
    `,
  )
});

// Route to return member household information
app.get("/member-households", async (c) => {
  let memberHTML: string = "";
  return c.html(
    html`
        <p>${memberHTML}</p>
    `,
  )
});

// Route to join a household
app.post("/join-household", async (c) => {
  let joinHTML: string = "";
  return c.html(
    html`
        <p>${joinHTML}</p>
    `,
  )
});

// Route to create a household
app.post("/create-household", async (c) => {
  let createHTML: string = "";
  return c.html(
    html`
        <p>${createHTML}</p>
    `,
  )
});

// Route to attempt to leave a household
app.post("/leave-household", async (c) => {
  let leaveHTML: string = "";
  return c.html(
    html`
        <p>${leaveHTML}</p>
    `,
  )
});

export default app;
