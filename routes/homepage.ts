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
app.get("/household-view", async (c: Context) => {
  const households = await db<Household>("household").select("*");

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
        <head>
          <title>Household View</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: linear-gradient(to bottom right, #fdf2f8, #f3e8ff, #ede9fe);
              color: #3b0764;
              margin: 0;
              padding: 40px 20px;
            }

            .container {
              max-width: 900px;
              margin: 0 auto;
            }

            h1 {
              text-align: center;
              font-size: 3rem;
              margin-bottom: 10px;
            }

            .subtitle {
              text-align: center;
              font-size: 1.1rem;
              margin-bottom: 35px;
              color: #6b21a8;
            }

            .card {
              background: white;
              border-radius: 20px;
              padding: 24px;
              margin-bottom: 24px;
              box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
              border: 1px solid #f5d0fe;
            }

            h2 {
              margin-top: 0;
              color: #7e22ce;
            }

            h3 {
              margin-bottom: 8px;
              color: #9333ea;
            }

            .join-code {
              display: inline-block;
              background: #fce7f3;
              color: #9d174d;
              padding: 8px 14px;
              border-radius: 999px;
              font-size: 0.95rem;
              margin-bottom: 16px;
            }

            ul {
              padding-left: 20px;
            }

            li {
              margin-bottom: 6px;
            }

            .empty {
              background: white;
              border-radius: 18px;
              padding: 30px;
              text-align: center;
              box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
              border: 1px solid #f5d0fe;
            }

            .back-link {
              display: inline-block;
              margin-top: 20px;
              text-decoration: none;
              background: #c084fc;
              color: white;
              padding: 12px 18px;
              border-radius: 12px;
              font-weight: bold;
            }

            .back-link:hover {
              background: #a855f7;
            }

            .section-label {
              margin-top: 18px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Household View</h1>
            <p class="subtitle">View your households, members, and managers in one place</p>

            ${
      households.length > 0
        ? html`
              ${households.map((household) => {
          const householdMembers = memberships.filter((m: {
            household_id: number;
            role: string;
            user_id: number;
            username: string;
          }) => m.household_id === household.household_id);

          const managers = householdMembers.filter((m: { role: string }) =>
            m.role.toLowerCase() === "manager"
          );

          const members = householdMembers.filter((m: { role: string }) =>
            m.role.toLowerCase() === "member"
          );

          return html`
                <div class="card">
                  <h2>${household.household_name}</h2>
                  <div class="join-code">Join Code: ${household.join_code}</div>

                  <div class="section-label">
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
                  </div>

                  <div class="section-label">
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
                  </div>
                </div>
              `;
        })}
            `
        : html`
              <div class="empty">
                <h2>No households found</h2>
                <p>Create a household to see it appear here.</p>
              </div>
            `
    }

            <a class="back-link" href="/">Back to homepage</a>
          </div>
        </body>
      </html>
    `,
  );
});

export default app;
