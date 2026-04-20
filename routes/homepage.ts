import { Hono, Context } from "@hono/hono";
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

  // Parse input as a number
  const householdCode = body["householdCode"];

  // Ensure input is a string, not a file
  if (typeof householdCode !== "string"){
    return c.html(
      html`
        <script>
          alert("Error: Household Join Code must be a valid six digit integer code.")
        </script>
      `,
    )
  } 

  // Ensure input is 6 digit integer
  if (!/^\d{6}$/.test(householdCode.trim())){
    return c.html(
      html`
        <script>
          alert("Error: Household Join Code must be a valid six digit integer code.")
        </script>
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
        <script>
          alert("Error: Household Join Code does not exist.")
        </script>
      `,
    )
  }

  // Avoid duplicate memberships for the same user and household.
  const existingMembership = await db<HouseholdMembership>("household_membership")
    .where({ user_id: userId, household_id: household.household_id })
    .first();

  if (existingMembership) {
    return c.html(
      html`
        <script>
          alert("You are already a member of this household.")
        </script>
      `,
    );
  }

  // Insert new household membership connection
  const userID: number = userId;
  const householdID: number = household.household_id;

  await db<HouseholdMembership>("household_membership")
    .insert({user_id: userID, household_id: householdID, role: "member"});

  // Success alert
  const householdName: string = household.household_name;
  return c.html(
    html`
      <script>
        alert("Successfully joined household: ${householdName}. Refreshing page!")
        window.location.reload();
      </script>
    `,
  )
});

// Route to create a household
app.post("/create-household", async (c: Context) => {
  const body = await c.req.parseBody();

  const householdName = body["householdName"];

  // Ensure input is a string, not a file
  if (typeof householdName !== "string"){
    return c.html(
      html`
        <script>
          alert("Error: Household Name must be alphanumeric with max 32 characters.")
        </script>
      `,
    )
  } 

  // Check alphanumeric and 32 or less characters
  if (!/^[a-zA-Z0-9]{1,32}$/.test(householdName.trim())){
    return c.html(
      html`
        <script>
          alert("Error: Household Name must be alphanumeric with max 32 characters.")
        </script>
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
  // TODO: Implement actual user ID addition (creates and uses a dummy user for now)
  const [newUser] = await db<User>("user_account")
    .insert({user_id: 2, username: `dummy_${Date.now()}`, public_key: new Uint8Array(0), password_salt: new Uint8Array(0), password_hash: new Uint8Array(0)})
    .returning('*');
  const dummyUser2 = newUser;

  const userID: number = dummyUser2.user_id;
  const householdID: number = household.household_id;
  await db<HouseholdMembership>("household_membership")
    .insert({user_id: userID, household_id: householdID, role: "manager"});

  // Success alert
  return c.html(
    html`
      <script>
        alert("UserID: ${userID} successfully created household: '${householdName}'. Refreshing page!")
        window.location.reload();
      </script>
    `,
  )
});

// Route to attempt to leave a household
app.post("/leave-household", (c: Context) => {
  const leaveHTML: string = "";
  return c.html(
    html`
        <p>${leaveHTML}</p>
    `,
  )
});

export default app;
