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
  let managerHTML: string = "test manager";
  return c.html(
    html`
        <p>${managerHTML}</p>
    `,
  )
});

// Route to return member household information
app.get("/member-households", async (c) => {
  let memberHTML: string = "test member";
  return c.html(
    html`
        <p>${memberHTML}</p>
    `,
  )
});

// Route to join a household
app.post("/join-household", async (c) => {
  let joinHTML: string = "";
  const body = await c.req.parseBody();

  const householdCode = body["householdCode"];

  joinHTML += householdCode;
  
  return c.html(
    html`
        <p>${joinHTML}</p>
    `,
  )
});

// Route to create a household
app.post("/create-household", async (c) => {
  let createHTML: string = "";
  const body = await c.req.parseBody();

  const householdName = body["householdName"];

  createHTML += householdName;

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
// Route to view household information (members, managers, etc.)
app.get("/household-view", (c) => {
  return c.html(
    html`
      <html>
        <body>
          <h1>Household View</h1>

          <h2>Households</h2>
          <p>Household list will go here</p>

          <h2>Members</h2>
          <p>Member list will go here</p>

          <h2>Managers</h2>
          <p>Manager list will go here</p>

          <a href="/main-page">Back to homepage</a>
        </body>
      </html>
    `,
  );
});

export default app;
