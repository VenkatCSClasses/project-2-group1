import { assert, assertEquals } from "@std/assert";
import householdApp from "../routes/household.ts";

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
	assert(initialMembers.data.length >= 4);

	const initialAccountsResponse = await householdApp.request("/accounts");
	assertEquals(initialAccountsResponse.status, 200);

	const initialAccounts = await readJson(initialAccountsResponse);
	assertEquals(initialAccounts.resource, "household_streaming_accounts");
	assert(Array.isArray(initialAccounts.data));
	assert(initialAccounts.data.length >= 4);

	const createHouseholdResponse = await householdApp.request("/", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			group_name: "Test House",
			group_code_salt: "salt-1",
			group_code_hash: "hash-1",
		}),
	});
	assertEquals(createHouseholdResponse.status, 201);

	const createdHousehold = await readJson(createHouseholdResponse);
	assertEquals(createdHousehold.group_id, 1);
	assertEquals(createdHousehold.group_name, "Test House");

	const householdByIdResponse = await householdApp.request("/1");
	assertEquals(householdByIdResponse.status, 200);

	const householdById = await readJson(householdByIdResponse);
	assertEquals(householdById.group_id, 1);
	assertEquals(householdById.group_name, "Test House");

	const patchHouseholdResponse = await householdApp.request("/1", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			group_name: "Updated Test House",
			group_code_salt: "salt-2",
			group_code_hash: "hash-2",
		}),
	});
	assertEquals(patchHouseholdResponse.status, 200);

	const patchedHousehold = await readJson(patchHouseholdResponse);
	assertEquals(patchedHousehold.group_name, "Updated Test House");
	assertEquals(patchedHousehold.group_code_salt, "salt-2");
	assertEquals(patchedHousehold.group_code_hash, "hash-2");

	const deleteHouseholdResponse = await householdApp.request("/1", {
		method: "DELETE",
	});
	assertEquals(deleteHouseholdResponse.status, 200);

	const deletedHousehold = await readJson(deleteHouseholdResponse);
	assertEquals(deletedHousehold.deleted.group_id, 1);

	const missingHouseholdResponse = await householdApp.request("/1");
	assertEquals(missingHouseholdResponse.status, 404);

	const invalidHouseholdResponse = await householdApp.request("/abc");
	assertEquals(invalidHouseholdResponse.status, 400);

	const invalidMemberResponse = await householdApp.request("/members", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name: "", role: "" }),
	});
	assertEquals(invalidMemberResponse.status, 400);

	const createMemberResponse = await householdApp.request("/members", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name: "Taylor", role: "Guest" }),
	});
	assertEquals(createMemberResponse.status, 201);

	const createdMember = await readJson(createMemberResponse);
	assertEquals(createdMember.name, "Taylor");
	assertEquals(createdMember.role, "Guest");

	const updatedMembersResponse = await householdApp.request("/members");
	assertEquals(updatedMembersResponse.status, 200);

	const updatedMembers = await readJson(updatedMembersResponse);
	assertEquals(updatedMembers.data.length, initialMembers.data.length + 1);
	assert(updatedMembers.data.some((member: { name: string }) => member.name === "Taylor"));

	const invalidAccountResponse = await householdApp.request("/accounts", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
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
			service_name: "Netflix",
			account_identifier: "house@test.com",
			password: "password123",
		}),
	});
	assertEquals(createAccountResponse.status, 201);

	const createdAccount = await readJson(createAccountResponse);
	assertEquals(createdAccount.service_name, "Netflix");
	assertEquals(createdAccount.account_identifier, "house@test.com");

	const updatedAccountsResponse = await householdApp.request("/accounts");
	assertEquals(updatedAccountsResponse.status, 200);

	const updatedAccounts = await readJson(updatedAccountsResponse);
	assertEquals(updatedAccounts.data.length, initialAccounts.data.length + 1);
	assert(updatedAccounts.data.some((account: { account_identifier: string }) => account.account_identifier === "house@test.com"));

	const missingRouteResponse = await householdApp.request("/999");
	assertEquals(missingRouteResponse.status, 404);
});