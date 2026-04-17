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
  const householdCode = body["householdCode"]

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

  // Check to see if code exists in database
  const household = await db<Household>("household")
    .where({join_code: householdCode})
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

export default app;
