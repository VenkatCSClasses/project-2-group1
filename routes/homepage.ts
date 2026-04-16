import { Hono, Context } from "@hono/hono";
import { html } from "@hono/hono/html";
import { db } from "../database/knex.ts";

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
  encrypted_private_key: Uint8Array;
}


// Route to return manager household information
app.get("/manager-households", async (c: Context) => {
  let managerHTML: string = "test manager";
  return c.html(
    html`
        <p>${managerHTML}</p>
    `,
  )
});

// Route to return member household information
app.get("/member-households", async (c: Context) => {
  let memberHTML: string = "test member";
  return c.html(
    html`
        <p>${memberHTML}</p>
    `,
  )
});

// Route to join a household
app.post("/join-household", async (c: Context) => {
  const body = await c.req.parseBody();

  // Parse input as a number
  const householdCode = body["householdCode"]

  // Ensure input is a string, not a file
  if (typeof householdCode !== "string"){
    return c.html(
      html`
        <script>
          alert("Error: Join Code must be a valid six digit integer code.")
        </script>
      `,
    )
  } 

  // Ensure input is 6 digit integer
  if (!/^\d{6}$/.test(householdCode.trim())){
    return c.html(
      html`
        <script>
          alert("Error: Join Code must be a valid six digit integer code.")
        </script>
      `,
    )
  }

  // Check to see if code exists in database
  const household = await db<Household>("household")
    .where({join_code: householdCode})
    .first();
  if (!household){
    return c.html(
      html`
        <script>
          alert("Error: Join Code does not exist.")
        </script>
      `,
    )
  }

  // Import 
  // TODO: Implement actual user ID addition (for now it adds a user with id -1)
  const userID: number = -1;
  const householdID: number = household.household_id;

  await db<HouseholdMembership>("household_membership")
    .insert({user_id: userID, household_id: householdID, role: "member"});

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
app.post("/leave-household", async (c: Context) => {
  let leaveHTML: string = "";
  return c.html(
    html`
        <p>${leaveHTML}</p>
    `,
  )
});

export default app;
