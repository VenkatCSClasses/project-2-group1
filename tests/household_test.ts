// Assisted-by: GitHub Copilot:GPT-5.3-Codex [apply_patch] [get_errors]

import { assert, assertEquals } from "@std/assert";
import householdApp from "../routes/household.ts";
import { db, runMigrations } from "../database/knex.ts";

async function readJson(response: Response) {
  return await response.json();
}

Deno.test("household route methods", async () => {
  const initialHouseholdsResponse = await householdApp.request("/");
  assertEquals(initialHouseholdsResponse.status, 200);

  const initialHouseholds = await readJson(initialHouseholdsResponse);
  assertEquals(initialHouseholds.resource, "household");
  assert(Array.isArray(initialHouseholds.data));
  assertEquals(initialHouseholds.data.length, 0);

  const initialMembersResponse = await householdApp.request("/members");
  assertEquals(initialMembersResponse.status, 200);

  const initialMembers = await readJson(initialMembersResponse);
  assertEquals(initialMembers.resource, "household_members");
  assert(Array.isArray(initialMembers.data));
  assertEquals(initialMembers.data.length, 0);

  const initialAccountsResponse = await householdApp.request("/accounts");
  assertEquals(initialAccountsResponse.status, 200);

  const initialAccounts = await readJson(initialAccountsResponse);
  assertEquals(initialAccounts.resource, "shared_vault_passwords");
  assert(Array.isArray(initialAccounts.data));
  assertEquals(initialAccounts.data.length, 0);

  const createHouseholdResponse = await householdApp.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      household_name: "Test House",
      join_code: 123456,
    }),
  });
  assertEquals(createHouseholdResponse.status, 201);

  const createdHousehold = await readJson(createHouseholdResponse);
  assertEquals(createdHousehold.household_id, 1);
  assertEquals(createdHousehold.household_name, "Test House");
  assertEquals(createdHousehold.join_code, 123456);

  const householdByIdResponse = await householdApp.request("/1");
  assertEquals(householdByIdResponse.status, 200);

  const householdById = await readJson(householdByIdResponse);
  assertEquals(householdById.household_id, 1);
  assertEquals(householdById.household_name, "Test House");

  const patchHouseholdResponse = await householdApp.request("/1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      household_name: "Updated Test House",
      join_code: 234567,
    }),
  });
  assertEquals(patchHouseholdResponse.status, 200);

  const patchedHousehold = await readJson(patchHouseholdResponse);
  assertEquals(patchedHousehold.household_name, "Updated Test House");
  assertEquals(patchedHousehold.join_code, 234567);

  const invalidHouseholdResponse = await householdApp.request("/abc");
  assertEquals(invalidHouseholdResponse.status, 400);

  const invalidMemberResponse = await householdApp.request("/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ household_id: 1, name: "", role: "" }),
  });
  assertEquals(invalidMemberResponse.status, 400);

  const createMemberResponse = await householdApp.request("/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ household_id: 1, name: "Taylor", role: "guest" }),
  });
  assertEquals(createMemberResponse.status, 201);

  const createdMember = await readJson(createMemberResponse);
  assertEquals(createdMember.name, "Taylor");
  assertEquals(createdMember.role, "guest");
  assertEquals(createdMember.household_id, 1);

  const updatedMembersResponse = await householdApp.request(
    "/members?household_id=1",
  );
  assertEquals(updatedMembersResponse.status, 200);

  const updatedMembers = await readJson(updatedMembersResponse);
  assertEquals(updatedMembers.data.length, initialMembers.data.length + 1);
  assert(
    updatedMembers.data.some((member: { name: string }) =>
      member.name === "Taylor"
    ),
  );

  const invalidAccountResponse = await householdApp.request("/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      household_id: 1,
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
      household_id: 1,
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
  assertEquals(createdAccount.household_id, 1);

  const updatedAccountsResponse = await householdApp.request(
    "/accounts?household_id=1",
  );
  assertEquals(updatedAccountsResponse.status, 200);

  const updatedAccounts = await readJson(updatedAccountsResponse);
  assertEquals(updatedAccounts.data.length, initialAccounts.data.length + 1);
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

  const deleteAccountResponse = await householdApp.request(
    `/accounts/${createdAccount.account_id}`,
    {
      method: "DELETE",
    },
  );
  assertEquals(deleteAccountResponse.status, 200);

  const deletedAccount = await readJson(deleteAccountResponse);
  assertEquals(deletedAccount.deleted.account_id, createdAccount.account_id);

  const missingDeletedAccountResponse = await householdApp.request(
    `/accounts/${createdAccount.account_id}`,
    {
      method: "DELETE",
    },
  );
  assertEquals(missingDeletedAccountResponse.status, 404);

  const accountsAfterDeleteResponse = await householdApp.request(
    "/accounts?household_id=1",
  );
  assertEquals(accountsAfterDeleteResponse.status, 200);

  const accountsAfterDelete = await readJson(accountsAfterDeleteResponse);
  assertEquals(accountsAfterDelete.data.length, initialAccounts.data.length);

  const invalidDeleteMemberResponse = await householdApp.request(
    "/members/not-a-number?household_id=1",
    {
      method: "DELETE",
    },
  );
  assertEquals(invalidDeleteMemberResponse.status, 400);

  const deleteMemberResponse = await householdApp.request(
    `/members/${createdMember.member_id}?household_id=1`,
    {
      method: "DELETE",
    },
  );
  assertEquals(deleteMemberResponse.status, 200);

  const deletedMember = await readJson(deleteMemberResponse);
  assertEquals(deletedMember.deleted.member_id, createdMember.member_id);

  const missingDeletedMemberResponse = await householdApp.request(
    `/members/${createdMember.member_id}?household_id=1`,
    {
      method: "DELETE",
    },
  );
  assertEquals(missingDeletedMemberResponse.status, 404);

  const membersAfterDeleteResponse = await householdApp.request(
    "/members?household_id=1",
  );
  assertEquals(membersAfterDeleteResponse.status, 200);

  const membersAfterDelete = await readJson(membersAfterDeleteResponse);
  assertEquals(membersAfterDelete.data.length, initialMembers.data.length);

  const deleteHouseholdResponse = await householdApp.request("/1", {
    method: "DELETE",
  });
  assertEquals(deleteHouseholdResponse.status, 200);

  const deletedHousehold = await readJson(deleteHouseholdResponse);
  assertEquals(deletedHousehold.deleted.household_id, 1);

  const missingHouseholdResponse = await householdApp.request("/1");
  assertEquals(missingHouseholdResponse.status, 404);

  const missingRouteResponse = await householdApp.request("/999");
  assertEquals(missingRouteResponse.status, 404);

  await db.destroy();
});
