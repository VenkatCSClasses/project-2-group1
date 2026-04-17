import { Hono } from "@hono/hono";
import { html } from "@hono/hono/html";
import { db } from "../database/knex.ts";

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
app.get("/household-view", async (c) => {
  const households = await db("household").select("*");

  const memberships = await db("household_membership")
    .join("user_account", "household_membership.user_id", "user_account.user_id")
    .select(
      "household_membership.household_id",
      "household_membership.role",
      "user_account.user_id",
      "user_account.username",
    );

  return c.html(
    html`
      <html>
        <body>
          <h1>Household View</h1>

          ${
      households.length > 0
        ? html`
              ${households.map((household: {
          household_id: number;
          household_name: string;
          join_code: number;
        }) => {
          const householdMembers = memberships.filter((m: {
            household_id: number;
            role: string;
            user_id: number;
            username: string;
          }) => m.household_id === household.household_id);

          const managers = householdMembers.filter((m: { role: string }) =>
            m.role === "manager"
          );
          const members = householdMembers.filter((m: { role: string }) =>
            m.role === "member"
          );

          return html`
                    <section style="margin-bottom: 2rem;">
                      <h2>${household.household_name}</h2>
                      <p>Join Code: ${household.join_code}</p>

                      <h3>Managers</h3>
                      ${
            managers.length > 0
              ? html`
                              <ul>
                                ${
                managers.map((manager: { username: string }) =>
                  html`<li>${manager.username}</li>`
                )
              }
                              </ul>
                            `
              : html`<p>No managers found.</p>`
          }

                      <h3>Members</h3>
                      ${
            members.length > 0
              ? html`
                              <ul>
                                ${
                members.map((member: { username: string }) =>
                  html`<li>${member.username}</li>`
                )
              }
                              </ul>
                            `
              : html`<p>No members found.</p>`
          }
                    </section>
                  `;
        })}
            `
        : html`<p>No households found.</p>`
    }

          <a href="/">Back to homepage</a>
        </body>
      </html>
    `,
  );
});

export default app;
