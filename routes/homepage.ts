import { Hono, Context, HonoRequest } from "@hono/hono";
import { html } from "@hono/hono/html";
import { db } from "../database/knex.ts";
import { isLoggedIn } from "../cryptography.ts";

const app = new Hono();

// Database objects
type Household = {
  household_id: number;
  household_name: string;
  created_at: Date;
  updated_at: Date;
  join_code: number;
};

type HouseholdMembership = {
  user_id: number;
  household_id: number;
  role: string;
  created_at: Date;
  updated_at: Date;
}

type User = {
  user_id: number;
  username: string;
  public_key: Uint8Array;
  created_at: Date;
  updated_at: Date;
  password_salt: Uint8Array;
  password_hash: Uint8Array;
}


// Route to return manager household information
app.get("/manager-households", async (c: Context) => {
  // deno-lint-ignore no-explicit-any
  const { loggedIn, userId } = await isLoggedIn(c as any);
  
  if (!loggedIn || userId === undefined) {
    return c.html(
      html`<p>Not logged in</p>`
    );
  }

  // Query households where user is a manager
  const households = await db<Household>("household")
    .join("household_membership", "household.household_id", "=", "household_membership.household_id")
    .where("household_membership.user_id", userId)
    .where("household_membership.role", "manager")
    .select("household.household_id", "household.household_name", "household.join_code");
  
  if (households.length === 0) {
    return c.html(
      html`<p>No manager households</p>`
    );
  }

  let managerHTML = `<ul>`;
  for (const household of households) {
    managerHTML += `<li>
      <a href="/household?household_id=${household.household_id}&user_id=${userId}">
        ${household.household_name} (Code: ${household.join_code})
      </a>
    </li>`;
  }
  managerHTML += `</ul>`;
  
  return c.html(managerHTML);
});

// Route to return member household information
app.get("/member-households", async (c: Context) => {
  // deno-lint-ignore no-explicit-any
  const { loggedIn, userId } = await isLoggedIn(c as any);
  
  if (!loggedIn || userId === undefined) {
    return c.html(
      html`<p>Not logged in</p>`
    );
  }

  try {
    // Query households where user is a member
    const households = await db<Household>("household")
      .join("household_membership", "household.household_id", "=", "household_membership.household_id")
      .where("household_membership.user_id", userId)
      .where("household_membership.role", "member")
      .select("household.household_id", "household.household_name", "household.join_code");
    
    if (households.length === 0) {
      return c.html(
        html`<p>No member households</p>`
      );
    }

    let memberHTML = `<ul>`;
    for (const household of households) {
      memberHTML += `<li>
        <a href="/household?household_id=${household.household_id}&user_id=${userId}">
          ${household.household_name} (Code: ${household.join_code})
        </a>
      </li>`;
    }
    memberHTML += `</ul>`;
    
    return c.html(memberHTML);
  } catch (error) {
    console.error("Error in member-households:", error);
    return c.html(`<p>Error: ${error}</p>`);
  }
});

// Route to join a household
app.post("/join-household", async (c: Context) => {
  // deno-lint-ignore no-explicit-any
  const { loggedIn, userId } = await isLoggedIn(c as any);
  if (!loggedIn || userId === undefined) {
    return c.html(
      html`
        <script>
          alert("Error: You must be logged in to join a household.")
        </script>
      `,
    );
  }

  const body = await c.req.parseBody();

  // deno-lint-ignore no-explicit-any
  const {loggedIn, userId} = await isLoggedIn(c as any);

  // Ensure user is logged in
  if (!loggedIn || !userId){
    return c.html(
      html`
        "Error: You are not logged in. Return to login page."
      `,
    )
  }
  const userID: number = userId;

  // Parse input as a number
  const householdCode = body["householdCode"];

  // Ensure input is a string, not a file
  if (typeof householdCode !== "string"){
    return c.html(
      html`
        "Error: Household Join Code must be a valid six digit integer code."
      `,
    )
  } 

  // Ensure input is 6 digit integer
  if (!/^\d{6}$/.test(householdCode.trim())){
    return c.html(
      html`
        "Error: Household Join Code must be a valid six digit integer code."
      `,
    )
  }

  const parsedJoinCode = Number.parseInt(householdCode.trim(), 10);

  // Check to see if code exists in database
  const household = await db<Household>("household")
    .where({ join_code: parsedJoinCode })
    .first();
  if (!household){
    return c.html(
      html`
        "Error: Household Join Code does not exist."
      `,
    )
  }

  const householdID: number = household.household_id;

  const checkConnection = await db<HouseholdMembership>("household_membership")
    .where({user_id: userID, household_id: householdID})
    .first();
  if (checkConnection){
    return c.html(
      html`
        "Error: You are already enrolled in this household."
      `,
    )
  }

  // Insert new household membership connection
  await db<HouseholdMembership>("household_membership")
    .insert({user_id: userID, household_id: householdID, role: "Member"});

  // Success alert
  const householdName: string = household.household_name;
  return c.html(
    html`
      "UserID: ${userID} successfully joined household: ${householdName}. Refreshing page!"
    `,
  )
});

// Route to create a household
app.post("/create-household", async (c: Context) => {
  const body = await c.req.parseBody();

  // deno-lint-ignore no-explicit-any
  const {loggedIn, userId} = await isLoggedIn(c as any);

  // Ensure user is logged in
  if (!loggedIn || !userId){
    return c.html(
      html`
        "Error: You are not logged in. Return to login page."
      `,
    )
  }
  const userID: number = userId;

  const householdName = body["householdName"];

  // Ensure input is a string, not a file
  if (typeof householdName !== "string"){
    return c.html(
      html`
        "Error: Household Name must be alphanumeric with max 32 characters."
      `,
    )
  } 

  // Check alphanumeric and 32 or less characters
  if (!/^[a-zA-Z0-9]{1,32}$/.test(householdName.trim())){
    return c.html(
      html`
        "Error: Household Name must be alphanumeric with max 32 characters."
      `,
    )
  }

  // Generate new join code (stretch goal, make more secure??)
  let joinCode: number;
  let tempHousehold: Household | undefined;

  do {
    joinCode = Math.floor(Math.random() * 1000000);

    // Check and see if join code exists
    tempHousehold = await db<Household>("household")
      .where({join_code: joinCode})
      .first();
  } 
  while (tempHousehold);

  // Insert new household
  const [household] = await db<Household>("household")
    .insert({household_name: householdName, join_code: joinCode})
    .returning('*')

  // Insert new member connection
  const householdID: number = household.household_id;
  await db<HouseholdMembership>("household_membership")
    .insert({user_id: userID, household_id: householdID, role: "Manager"});

  // Success alert
  return c.html(
    html`
      "UserID: ${userID} successfully created household: '${householdName}' with join code ${joinCode}."
    `,
  )
});

// Route to attempt to leave a household
app.post("/leave-household", async (c: Context) => {
  const body = await c.req.parseBody();

  const {loggedIn, userId} = await isLoggedIn(c as any);

  // Ensure user is logged in
  if (!loggedIn || !userId){
    return c.html(
      html`
        "Error: You are not logged in. Return to login page."
      `,
    )
  }
  const userID: number = userId;

  const householdID = body["householdID"];

  // Ensure householdID is not a file
  if (typeof householdID !== "string"){
    return c.html(
      html`
        "Error: Household ID must reference a valid, existing household that you are in."
      `,
    )
  } 

  // Ensure householdID is numeric
  if (!/^d+$/.test(householdID.trim())){
    return c.html(
      html`
        "Error: Household ID must reference a valid, existing household that you are in."
      `,
    )
  } 

  // Ensure householdID references a household that exists
  const household = await db<Household>("household")
    .where({household_id: householdID}).first();
  if (!household){
    return c.html(
      html`
        "Error: Household ID must reference a valid, existing household that you are in."
      `,
    )
  }

  // Check to see if user actually is a part of the household
  const connection = await db<HouseholdMembership>("household_membership")
    .where({household_id: householdID, user_id: userID})
    .first()
  if (!connection){
    return c.html(
      html`
        "Error: Household ID must reference a valid, existing household that you are in."
      `,
    )
  }

  let otherManager: boolean = false;
  // Check to see if there are others in the household, see if there are other managers (if user is manager)
  const users = await db<HouseholdMembership>("household_membership")
    .where({household_id: householdID});

  if (connection.role === "Manager"){
    for (const user of users){
      if (user.role === "Manager"){
        otherManager = true;
        break;
      }
    }

    if (!otherManager){
      return c.html(
        html`
         "Error: Cannot leave a household with existing members and no manager. Inform members to leave."
        `,
      )
    }
  }

  // Remove user connection
  await db<HouseholdMembership>("household_membership")
    .where({household_id: householdID, user_id: userID})
    .del();
  
  // Delete household if no one in household
  if (users.length === 1){
    await db<Household>("household")
      .where({household_id: householdID})
      .del();
    
    return c.html(
      html`
        "Household successfully left with no users, deleting household."
      `,
    )
  }

  return c.html(
      html`
        "Household successfully left."
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
            background: linear-gradient(to bottom right, #ecfdf5, #d1fae5, #bbf7d0);
            color: #064e3b;
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
            color: #065f46;
          }

          .subtitle {
            text-align: center;
            font-size: 1.1rem;
            margin-bottom: 35px;
            color: #047857;
          }

          .card {
            background: white;
            border-radius: 20px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
            border: 1px solid #bbf7d0;
          }

          h2 {
            margin-top: 0;
            color: #047857;
          }

          h3 {
            margin-bottom: 8px;
            color: #059669;
          }

          .join-code {
            display: inline-block;
            background: #d1fae5;
            color: #065f46;
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
            border: 1px solid #bbf7d0;
          }

          .back-link {
            display: inline-block;
            margin-top: 20px;
            text-decoration: none;
            background: #34d399;
            color: #064e3b;
            padding: 12px 18px;
            border-radius: 12px;
            font-weight: bold;
          }

          .back-link:hover {
            background: #10b981;
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

// test for household view route
app.get("/seed-test", async (c: Context) => {
  // create a user
  const [user] = await db("user_account")
    .insert({
      username: "test_user",
      public_key: new Uint8Array([1]),
      password_salt: new Uint8Array([1]),
      encrypted_private_key: new Uint8Array([1]),
    })
    .returning("user_id");

  const userId = user.user_id;

  // create a household
  const [household] = await db("household")
    .insert({
      household_name: "Test Household",
      join_code: 123456,
    })
    .returning("household_id");

  const householdId = household.household_id;

  // create membership
  await db("household_membership").insert({
    user_id: userId,
    household_id: householdId,
    role: "Manager",
  });

  return c.html(html`
    <p>Test data created!</p>
    <a href="/api/homepage/household-view">Go to Household View</a>
  `);
});

export default app;
