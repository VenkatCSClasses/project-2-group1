// Assisted-by: Google Gemini:Gemini-3.1-Pro

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { sign } from "hono/jwt";
import { getJWTSecret } from "../cryptography.ts";
import homepageApp from "../routes/homepage.ts";
import { db, runMigrations } from "../database/knex.ts";

async function makeJwtCookie(userId: number) {
  const token = await sign(
    {
      id: userId,
      exp: Math.floor(Date.now() / 1000) + (60 * 60),
      iss: "subseer",
    },
    await getJWTSecret(),
    "HS512",
  );

  return `jwt=${token}`;
}

async function createTestUser(username: string) {
  const [user] = await db("user_account")
    .insert({
      username: username,
      public_key: new Uint8Array([1]),
      password_salt: new Uint8Array([1]),
      encrypted_private_key: new Uint8Array([1]),
    })
    .returning("user_id");
  return user.user_id;
}

async function createTestHousehold(name: string, code: number) {
  let attempts = 0;
  while (attempts < 10) {
    try {
      const [household] = await db("household")
        .insert({
          household_name: name,
          join_code: code,
        })
        .returning("household_id");
      return household.household_id;
    } catch (e: any) {
        // Handle join_code collision by randomizing the code on failure
        if (e.message && e.message.includes("unique constrain")) {
            code = Math.floor(Math.random() * 900000) + 100000;
            attempts++;
        } else {
            throw e;
        }
    }
  }
  return -1;
}

// Test all homepage routes
Deno.test("homepage routes test suite", async (t) => {
  await runMigrations();

  const uniqueSuffix = Date.now().toString();
  const aliceName = `Alice${uniqueSuffix}`;
  const bobName = `Bob${uniqueSuffix}`;
  const charlieName = `Charlie${uniqueSuffix}`;
  const houseA = `AliceHouse${uniqueSuffix}`;
  const houseB = `SharedHouse${uniqueSuffix}`;

  let managerId: number;
  let memberId: number;
  let outsiderId: number;
  let singleHouseId: number;
  let sharedHouseId: number;
  
  let aliceCode = 111111 + Math.floor(Math.random() * 1000);
  let sharedCode = 222222 + Math.floor(Math.random() * 1000);

  // Add dummy data to the database
  await t.step("setup data", async () => {
    managerId = await createTestUser(aliceName);
    memberId = await createTestUser(bobName);
    outsiderId = await createTestUser(charlieName);

    singleHouseId = await createTestHousehold(houseA, aliceCode);
    sharedHouseId = await createTestHousehold(houseB, sharedCode);

    // Alice is manager of singleHouseId and sharedHouseId
    await db("household_membership").insert([
      { user_id: managerId, household_id: singleHouseId, role: "Manager" },
      { user_id: managerId, household_id: sharedHouseId, role: "Manager" },
    ]);

    // Bob is member of sharedHouseId
    await db("household_membership").insert([
      { user_id: memberId, household_id: sharedHouseId, role: "Member" },
    ]);
  });

  // Unit test for get-username route
  await t.step("get-username test", async () => {
    // Success Case
    const res = await homepageApp.request("/get-username", {
      headers: { Cookie: await makeJwtCookie(managerId) }
    });
    assertEquals(res.status, 200);
    const html = await res.text();
    assertStringIncludes(html, aliceName);

    // Failure Case: not logged in
    const noAuthRes = await homepageApp.request("/get-username");
    assertEquals(noAuthRes.status, 200);
    const noAuthHtml = await noAuthRes.text();
    assertStringIncludes(noAuthHtml, "Error: You are not logged in.");
  });

  // Unit test for manager-households route
  await t.step("manager-households test", async () => {
    // Success Case: Alice has 2 manager households
    const res = await homepageApp.request("/manager-households", {
      headers: { Cookie: await makeJwtCookie(managerId) }
    });
    assertEquals(res.status, 200);
    const html = await res.text();
    assertStringIncludes(html, houseA);
    assertStringIncludes(html, houseB);

    // Failure Case: Bob has NO manager households
    const resBob = await homepageApp.request("/manager-households", {
      headers: { Cookie: await makeJwtCookie(memberId) }
    });
    assertEquals(resBob.status, 200);
    assertStringIncludes(await resBob.text(), "You are not a manager in any household.");

    // Failure Case: No auth
    const noAuthRes = await homepageApp.request("/manager-households");
    assertStringIncludes(await noAuthRes.text(), "Error: You are not logged in.");
  });

  // Unit test for member-households route
  await t.step("member-households test", async () => {
    // Success Case: Bob is Member in 1 household
    const resBob = await homepageApp.request("/member-households", {
      headers: { Cookie: await makeJwtCookie(memberId) }
    });
    assertEquals(resBob.status, 200);
    const html = await resBob.text();
    assertStringIncludes(html, houseB);

    // Failure Case: Alice has NO "Member" connections (she's a "Manager")
    const resAlice = await homepageApp.request("/member-households", {
      headers: { Cookie: await makeJwtCookie(managerId) }
    });
    assertStringIncludes(await resAlice.text(), "You are not a member in any household.");

    // Failure Case: No auth
    const noAuthRes = await homepageApp.request("/member-households");
    assertStringIncludes(await noAuthRes.text(), "Error: You are not logged in.");
  });

  // Unit test for leave-dropdown route
  await t.step("leave-dropdown test", async () => {
    // Success Case: Bob is in sharedHouseId
    const resBob = await homepageApp.request("/leave-dropdown", {
      headers: { Cookie: await makeJwtCookie(memberId) }
    });
    assertEquals(resBob.status, 200);
    const htmlBob = await resBob.text();
    assertStringIncludes(htmlBob, `<option value="${sharedHouseId}">`);

    // Failure Case: Charlie is in no households
    const resCharlie = await homepageApp.request("/leave-dropdown", {
      headers: { Cookie: await makeJwtCookie(outsiderId) }
    });
    assertStringIncludes(await resCharlie.text(), "Not part of any households");
    
    // Failure Case: No auth
    const noAuthRes = await homepageApp.request("/leave-dropdown");
    assertStringIncludes(await noAuthRes.text(), "Error: You are not logged in.");
  });

  // Unit test for join-household route
  await t.step("join-household test", async () => {
    // We need the ACTUAL code AliceHouse got
    const aliceHouseData = await db("household").where({ household_id: singleHouseId }).first();
    const actualAliceCode = aliceHouseData.join_code;

    const formData = new FormData();
    formData.append("householdCode", actualAliceCode.toString());

    // Success Case: Charlie joins Alice House
    const resCharlie = await homepageApp.request("/join-household", {
      method: "POST",
      headers: { Cookie: await makeJwtCookie(outsiderId) },
      body: formData
    });
    assertEquals(resCharlie.status, 200);
    assertStringIncludes(await resCharlie.text(), `successfully joined household: ${houseA}`);

    // Failure: Cannot join again (Duplicate connection)
    const formDataDupe = new FormData();
    formDataDupe.append("householdCode", actualAliceCode.toString());
    const resCharlieDupe = await homepageApp.request("/join-household", {
      method: "POST",
      headers: { Cookie: await makeJwtCookie(outsiderId) },
      body: formDataDupe
    });
    assertStringIncludes(await resCharlieDupe.text(), "already enrolled in this household");

    // Failure: Form Data format invalid code
    const invalidForm = new FormData();
    invalidForm.append("householdCode", "111A");
    const resInvalidCode = await homepageApp.request("/join-household", {
      method: "POST",
      headers: { Cookie: await makeJwtCookie(memberId) },
      body: invalidForm
    });
    assertStringIncludes(await resInvalidCode.text(), "must be a valid six digit integer code");
  });

  // Unit test for create-household route
  await t.step("create-household test", async () => {
    const formData = new FormData();
    formData.append("householdName", `BrandNew${uniqueSuffix}`);

    // Success Case: Charlie creates "BrandNewHouse"
    const res = await homepageApp.request("/create-household", {
        method: "POST",
        headers: { Cookie: await makeJwtCookie(outsiderId) },
        body: formData
    });
    assertEquals(res.status, 200);
    assertStringIncludes(await res.text(), `successfully created household: 'BrandNew${uniqueSuffix}'`);

    // Failure: Invalid Name
    const invalidForm = new FormData();
    invalidForm.append("householdName", "A Very Bad Name!!!");
    const resInvalid = await homepageApp.request("/create-household", {
        method: "POST",
        headers: { Cookie: await makeJwtCookie(outsiderId) },
        body: invalidForm
    });
    assertStringIncludes(await resInvalid.text(), "must be alphanumeric with max 32 characters");
  });

  // Unit test for leave-household route
  await t.step("leave-household test", async () => {
    // Member leaving (Bob from sharedHouseId)
    const formDataBob = new FormData();
    formDataBob.append("householdID", sharedHouseId.toString());
    const resBob = await homepageApp.request("/leave-household", {
        method: "POST",
        headers: { Cookie: await makeJwtCookie(memberId) },
        body: formDataBob
    });
    assertEquals(resBob.status, 200);
    assertStringIncludes(await resBob.text(), "Household successfully left.");
    
    // Manager leaving a house alone -> should delete house
    const brandNewHouse = await db("household").where({ household_name: `BrandNew${uniqueSuffix}` }).first();
    const cleanId = brandNewHouse.household_id;

    const formDataManager = new FormData();
    formDataManager.append("householdID", cleanId.toString());
    const resManager = await homepageApp.request("/leave-household", {
        method: "POST",
        headers: { Cookie: await makeJwtCookie(outsiderId) },
        body: formDataManager
    });
    assertStringIncludes(await resManager.text(), "Household successfully left with no users, deleting household.");
    
    // Manager trying to leave a house with remaining members
    await db("household_membership").insert({ user_id: outsiderId, household_id: sharedHouseId, role: "Member" });

    const formDataFail = new FormData();
    formDataFail.append("householdID", sharedHouseId.toString());
    const resAliceFail = await homepageApp.request("/leave-household", {
        method: "POST",
        headers: { Cookie: await makeJwtCookie(managerId) },
        body: formDataFail
    });
    assertStringIncludes(await resAliceFail.text(), "Error: Cannot leave a household with existing members and no manager.");
  });

  // Integration test for create-household, leave-dropdown, leave-household route
  await t.step("Integration: create -> verify drop-down -> leave", async () => {
    // We create a fresh user so they have 0 households
    const isolatedUserId = await createTestUser(`CharlieIsolated${Date.now()}`);

    // 1. User creates a new household
    const createName = `CharlieHouse${uniqueSuffix}`;
    const createForm = new FormData();
    createForm.append("householdName", createName);
    const createRes = await homepageApp.request("/create-household", {
      method: "POST",
      headers: { Cookie: await makeJwtCookie(isolatedUserId) },
      body: createForm
    });
    assertEquals(createRes.status, 200);

    // Get the newly created household from the database to grab the ID
    const newHouse = await db("household").where({ household_name: createName }).first();

    // 2. User checks the dropdown to ensure the new household is there
    const dropdownRes = await homepageApp.request("/leave-dropdown", {
      headers: { Cookie: await makeJwtCookie(isolatedUserId) }
    });
    const dropdownHtml = await dropdownRes.text();
    assertStringIncludes(dropdownHtml, `value="${newHouse.household_id}"`);

    // 3. User leaves the new household (it gets deleted as he is the only manager)
    const leaveForm = new FormData();
    leaveForm.append("householdID", newHouse.household_id.toString());
    const leaveRes = await homepageApp.request("/leave-household", {
      method: "POST",
      headers: { Cookie: await makeJwtCookie(isolatedUserId) },
      body: leaveForm
    });
    assertStringIncludes(await leaveRes.text(), "Household successfully left with no users, deleting household.");

    // 4. Verify no longer in dropdown
    const finalDropdownRes = await homepageApp.request("/leave-dropdown", {
      headers: { Cookie: await makeJwtCookie(isolatedUserId) }
    });
    assertStringIncludes(await finalDropdownRes.text(), "Not part of any households");
  });

  // Integration test for join-household, leave-dropdown, leave-household route
  await t.step("Integration: join -> verify drop-down -> leave", async () => {
    // We create a fresh user so they have 0 households
    const isolatedUserId = await createTestUser(`CharlieIsolated2${Date.now()}`);
    
    // We create a temp house for this test so we don't assume state across tests too much
    const tempId = await createTestUser(`Temp${uniqueSuffix}`);
    let code = 333333 + Math.floor(Math.random() * 1000);
    const tempHouseId = await createTestHousehold(`TempHouse${uniqueSuffix}`, code);
    await db("household_membership").insert({ user_id: tempId, household_id: tempHouseId, role: "Manager" });

    // Ensure we fetch the true join_code inserted
    const houseData = await db("household").where({ household_id: tempHouseId }).first();
    code = houseData.join_code;

    // 1. User joins Temp House
    const joinForm = new FormData();
    joinForm.append("householdCode", code.toString());
    const joinRes = await homepageApp.request("/join-household", {
      method: "POST",
      headers: { Cookie: await makeJwtCookie(isolatedUserId) },
      body: joinForm
    });
    assertStringIncludes(await joinRes.text(), `successfully joined household: TempHouse${uniqueSuffix}`);

    // 2. User checks the dropdown to see TempHouse there
    const dropdownRes = await homepageApp.request("/leave-dropdown", {
      headers: { Cookie: await makeJwtCookie(isolatedUserId) }
    });
    assertStringIncludes(await dropdownRes.text(), `value="${tempHouseId}"`);

    // 3. User leaves TempHouse
    const leaveForm = new FormData();
    leaveForm.append("householdID", tempHouseId.toString());
    const leaveRes = await homepageApp.request("/leave-household", {
      method: "POST",
      headers: { Cookie: await makeJwtCookie(isolatedUserId) },
      body: leaveForm
    });
    assertStringIncludes(await leaveRes.text(), "Household successfully left.");

    // 4. Verify TempHouse dropped from dropdown
    const finalDropdownRes = await homepageApp.request("/leave-dropdown", {
      headers: { Cookie: await makeJwtCookie(isolatedUserId) }
    });
    assertStringIncludes(await finalDropdownRes.text(), "Not part of any households");
  });
  
  // Integration test for create-household, manager-households route
  await t.step("Integration: create -> verify manager list", async () => {
    // Charlie creates a household
    const createName = `AnotherCharlieHouse${uniqueSuffix}`;
    const createForm = new FormData();
    createForm.append("householdName", createName);
    await homepageApp.request("/create-household", {
      method: "POST",
      headers: { Cookie: await makeJwtCookie(outsiderId) },
      body: createForm
    });

    // Verify it appears in manager households
    const managerRes = await homepageApp.request("/manager-households", {
      headers: { Cookie: await makeJwtCookie(outsiderId) }
    });
    const managerHtml = await managerRes.text();
    assertStringIncludes(managerHtml, createName);
  });
  
  // Integration test for join-household, member-households route
  await t.step("Integration: join -> verify member list", async () => {
    // Bob joins Alice House (which he isn't in yet)
    
    // We need the ACTUAL code AliceHouse got
    const aliceHouseData = await db("household").where({ household_id: singleHouseId }).first();
    const actualAliceCode = aliceHouseData.join_code;

    const joinForm = new FormData();
    joinForm.append("householdCode", actualAliceCode.toString());
    await homepageApp.request("/join-household", {
      method: "POST",
      headers: { Cookie: await makeJwtCookie(memberId) },
      body: joinForm
    });

    // Check Bob's member households
    const memberRes = await homepageApp.request("/member-households", {
      headers: { Cookie: await makeJwtCookie(memberId) }
    });
    const memberHtml = await memberRes.text();
    assertStringIncludes(memberHtml, houseA);
  });
  

  await t.step("cleanup", async () => {
    await db.destroy();
  });
});
