// Assisted-by: GitHub Copilot:GPT-5.3-Codex [apply_patch] [get_errors]

import { assert, assertEquals } from "@std/assert";
import { sign } from "hono/jwt";
import { getJWTSecret } from "../cryptography.ts";
import householdApp from "../routes/household.ts";
import { db, runMigrations } from "../database/knex.ts";

async function readJson(response: Response) {
  return await response.json();
}

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

Deno.test("household route methods", async () => {
  await runMigrations();
  const uniqueSuffix = Date.now().toString();
  const managerUsername = `Taylor-${uniqueSuffix}`;
  const memberUsername = `Jordan-${uniqueSuffix}`;

  const initialHouseholdsResponse = await householdApp.request("/");
  assertEquals(initialHouseholdsResponse.status, 200);

  const initialHouseholds = await readJson(initialHouseholdsResponse);
  assertEquals(initialHouseholds.resource, "household");
  assert(Array.isArray(initialHouseholds.data));

  const initialMembersResponse = await householdApp.request("/members");
  assertEquals(initialMembersResponse.status, 200);

  const initialMembers = await readJson(initialMembersResponse);
  assertEquals(initialMembers.resource, "household_members");
  assert(Array.isArray(initialMembers.data));

  const initialAccountsResponse = await householdApp.request("/accounts");
  assertEquals(initialAccountsResponse.status, 200);

  const initialAccounts = await readJson(initialAccountsResponse);
  assertEquals(initialAccounts.resource, "shared_vault_passwords");
  assert(Array.isArray(initialAccounts.data));

  const createHouseholdResponse = await householdApp.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      household_name: "Test House",
    }),
  });
  assertEquals(createHouseholdResponse.status, 201);

  const createdHousehold = await readJson(createHouseholdResponse);
  assert(Number.isInteger(createdHousehold.household_id));
  assert(createdHousehold.household_id > 0);
  assertEquals(createdHousehold.household_name, "Test House");
  assert(Number.isInteger(createdHousehold.join_code));

  const householdId = createdHousehold.household_id;

  const householdByIdResponse = await householdApp.request(`/${householdId}`);
  assertEquals(householdByIdResponse.status, 200);

  const householdById = await readJson(householdByIdResponse);
  assertEquals(householdById.household_id, householdId);
  assertEquals(householdById.household_name, "Test House");

  const patchHouseholdResponse = await householdApp.request(`/${householdId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      household_name: "Updated Test House",
    }),
  });
  assertEquals(patchHouseholdResponse.status, 200);

  const patchedHousehold = await readJson(patchHouseholdResponse);
  assertEquals(patchedHousehold.household_name, "Updated Test House");

  const invalidHouseholdResponse = await householdApp.request("/abc");
  assertEquals(invalidHouseholdResponse.status, 400);

  const invalidMemberResponse = await householdApp.request("/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ household_id: householdId, name: "", role: "" }),
  });
  assertEquals(invalidMemberResponse.status, 400);

  const createMemberResponse = await householdApp.request("/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      household_id: householdId,
      name: managerUsername,
      role: "Manager",
    }),
  });
  assertEquals(createMemberResponse.status, 201);

  const createdMember = await readJson(createMemberResponse);
  assertEquals(createdMember.name, managerUsername);
  assertEquals(createdMember.role, "Manager");
  assertEquals(createdMember.household_id, householdId);

  const createRegularMemberResponse = await householdApp.request("/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      household_id: householdId,
      name: memberUsername,
      role: "Member",
    }),
  });
  assertEquals(createRegularMemberResponse.status, 201);

  const regularMember = await readJson(createRegularMemberResponse);
  assertEquals(regularMember.role, "Member");

  const updatedMembersResponse = await householdApp.request(
    `/members?household_id=${householdId}`,
  );
  assertEquals(updatedMembersResponse.status, 200);

  const updatedMembers = await readJson(updatedMembersResponse);
  assertEquals(updatedMembers.data.length, 2);
  assert(
    updatedMembers.data.some((member: { name: string }) =>
      member.name === managerUsername
    ),
  );

  const invalidAccountResponse = await householdApp.request("/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      household_id: householdId,
      service_name: "Netflix",
      account_identifier: "not-an-email",
      password: "password123",
    }),
  });
  assertEquals(invalidAccountResponse.status, 400);

  const createAccountResponse = await householdApp.request("/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      household_id: householdId,
      service_name: "Netflix",
      account_identifier: "house@test.com",
      password: "password123",
    }),
  });
  assertEquals(createAccountResponse.status, 201);

  const createdAccount = await readJson(createAccountResponse);
  assertEquals(createdAccount.service_name, "Netflix");
  assertEquals(createdAccount.account_identifier, "house@test.com");
  assertEquals(createdAccount.password, "password123");
  assertEquals(createdAccount.household_id, householdId);

  const updatedAccountsResponse = await householdApp.request(
    `/accounts?household_id=${householdId}`,
  );
  assertEquals(updatedAccountsResponse.status, 200);

  const updatedAccounts = await readJson(updatedAccountsResponse);
  assertEquals(updatedAccounts.data.length, 1);
  assert(
    updatedAccounts.data.some((account: { account_identifier: string }) =>
      account.account_identifier === "house@test.com"
    ),
  );
  assert(
    updatedAccounts.data.some((account: { password: string }) =>
      account.password === "password123"
    ),
  );

  const invalidDeleteAccountResponse = await householdApp.request(
    "/accounts/not-a-number",
    {
      method: "DELETE",
    },
  );
  assertEquals(invalidDeleteAccountResponse.status, 400);

  const memberDeleteAccountResponse = await householdApp.request(
    `/accounts/${createdAccount.account_id}`,
    {
      method: "DELETE",
      headers: {
        Cookie: await makeJwtCookie(regularMember.member_id),
      },
    },
  );
  assertEquals(memberDeleteAccountResponse.status, 403);

  const deleteAccountResponse = await householdApp.request(
    `/accounts/${createdAccount.account_id}`,
    {
      method: "DELETE",
      headers: {
        Cookie: await makeJwtCookie(createdMember.member_id),
      },
    },
  );
  assertEquals(deleteAccountResponse.status, 200);

  const deletedAccount = await readJson(deleteAccountResponse);
  assertEquals(deletedAccount.deleted.account_id, createdAccount.account_id);

  const missingDeletedAccountResponse = await householdApp.request(
    `/accounts/${createdAccount.account_id}`,
    {
      method: "DELETE",
      headers: {
        Cookie: await makeJwtCookie(createdMember.member_id),
      },
    },
  );
  assertEquals(missingDeletedAccountResponse.status, 404);

  const accountsAfterDeleteResponse = await householdApp.request(
    `/accounts?household_id=${householdId}`,
  );
  assertEquals(accountsAfterDeleteResponse.status, 200);

  const accountsAfterDelete = await readJson(accountsAfterDeleteResponse);
  assertEquals(accountsAfterDelete.data.length, 0);

  const invalidDeleteMemberResponse = await householdApp.request(
    `/members/not-a-number?household_id=${householdId}`,
    {
      method: "DELETE",
    },
  );
  assertEquals(invalidDeleteMemberResponse.status, 400);

  const deleteMemberResponse = await householdApp.request(
    `/members/${createdMember.member_id}?household_id=${householdId}`,
    {
      method: "DELETE",
    },
  );
  assertEquals(deleteMemberResponse.status, 200);

  const deletedMember = await readJson(deleteMemberResponse);
  assertEquals(deletedMember.deleted.member_id, createdMember.member_id);

  const missingDeletedMemberResponse = await householdApp.request(
    `/members/${createdMember.member_id}?household_id=${householdId}`,
    {
      method: "DELETE",
    },
  );
  assertEquals(missingDeletedMemberResponse.status, 404);

  const membersAfterDeleteResponse = await householdApp.request(
    `/members?household_id=${householdId}`,
  );
  assertEquals(membersAfterDeleteResponse.status, 200);

  const membersAfterDelete = await readJson(membersAfterDeleteResponse);
  assertEquals(membersAfterDelete.data.length, 1);

  const deleteHouseholdResponse = await householdApp.request(`/${householdId}`, {
    method: "DELETE",
  });
  assertEquals(deleteHouseholdResponse.status, 200);

  const deletedHousehold = await readJson(deleteHouseholdResponse);
  assertEquals(deletedHousehold.deleted.household_id, householdId);

  const missingHouseholdResponse = await householdApp.request(`/${householdId}`);
  assertEquals(missingHouseholdResponse.status, 404);

  const missingRouteResponse = await householdApp.request("/999");
  assertEquals(missingRouteResponse.status, 404);

  await db.destroy();
});
