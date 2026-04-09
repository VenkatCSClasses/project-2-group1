import { Hono } from "@hono/hono";

type Household = {
	group_id: number;
	group_name: string;
	created_at: string;
	updated_at: string;
	group_code_salt: string;
	group_code_hash: string;
};

type CreateHouseholdInput = {
	group_name: string;
	group_code_salt: string;
	group_code_hash: string;
};

type UpdateHouseholdInput = Partial<CreateHouseholdInput>;

type StreamingAccount = {
	account_id: number;
	service_name: string;
	account_identifier: string;
	password: string;
	created_at: string;
	updated_at: string;
};

type CreateStreamingAccountInput = {
	service_name: string;
	account_identifier: string;
	password: string;
};

type HouseholdMember = {
	member_id: number;
	name: string;
	role: string;
	created_at: string;
	updated_at: string;
};

type CreateHouseholdMemberInput = {
	name: string;
	role: string;
};

const app = new Hono();

const households: Household[] = [];
const householdMembers: HouseholdMember[] = [
	{
		member_id: 1,
		name: "Avery",
		role: "Manager",
		created_at: "2026-04-08T12:00:00.000Z",
		updated_at: "2026-04-08T12:00:00.000Z",
	},
	{
		member_id: 2,
		name: "Jordan",
		role: "Manager",
		created_at: "2026-04-08T12:00:00.000Z",
		updated_at: "2026-04-08T12:00:00.000Z",
	},
	{
		member_id: 3,
		name: "Kai",
		role: "Member",
		created_at: "2026-04-08T12:00:00.000Z",
		updated_at: "2026-04-08T12:00:00.000Z",
	},
	{
		member_id: 4,
		name: "Riley",
		role: "Member",
		created_at: "2026-04-08T12:00:00.000Z",
		updated_at: "2026-04-08T12:00:00.000Z",
	},
];
const streamingAccounts: StreamingAccount[] = [
	{
		account_id: 1,
		service_name: "Netflix",
		account_identifier: "netflix@testhouse.com",
		password: "TestHouseNetflix!26",
		created_at: "2026-04-08T12:00:00.000Z",
		updated_at: "2026-04-08T12:00:00.000Z",
	},
	{
		account_id: 2,
		service_name: "Spotify",
		account_identifier: "spotify@testhouse.com",
		password: "TestHouseSpotify!14",
		created_at: "2026-04-08T12:00:00.000Z",
		updated_at: "2026-04-08T12:00:00.000Z",
	},
	{
		account_id: 3,
		service_name: "Disney+",
		account_identifier: "disney@testhouse.com",
		password: "TestHouseDisney$88",
		created_at: "2026-04-08T12:00:00.000Z",
		updated_at: "2026-04-08T12:00:00.000Z",
	},
	{
		account_id: 4,
		service_name: "Hulu",
		account_identifier: "hulu@testhouse.com",
		password: "TestHouseHulu!7",
		created_at: "2026-04-08T12:00:00.000Z",
		updated_at: "2026-04-08T12:00:00.000Z",
	},
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function now() {
	return new Date().toISOString();
}

function nextGroupId() {
	return households.reduce((maxId, household) => {
		return Math.max(maxId, household.group_id);
	}, 0) + 1;
}

function findHousehold(groupId: number) {
	return households.find((household) => household.group_id === groupId);
}

function nextAccountId() {
	return streamingAccounts.reduce((maxId, account) => {
		return Math.max(maxId, account.account_id);
	}, 0) + 1;
}

function nextMemberId() {
	return householdMembers.reduce((maxId, member) => {
		return Math.max(maxId, member.member_id);
	}, 0) + 1;
}

app.get("/members", (c) => {
	return c.json({
		resource: "household_members",
		fields: {
			member_id: "integer primary key",
			name: "string",
			role: "string",
			created_at: "timestamp",
			updated_at: "timestamp",
		},
		data: householdMembers,
	});
});

app.post("/members", async (c) => {
	const body = (await c.req.json()) as Partial<CreateHouseholdMemberInput>;

	if (!body.name || !body.role) {
		return c.json({ error: "name and role are required" }, 400);
	}

	const createdAt = now();
	const newMember: HouseholdMember = {
		member_id: nextMemberId(),
		name: body.name,
		role: body.role,
		created_at: createdAt,
		updated_at: createdAt,
	};

	householdMembers.push(newMember);

	return c.json(newMember, 201);
});

app.get("/accounts", (c) => {
	return c.json({
		resource: "household_streaming_accounts",
		fields: {
			account_id: "integer primary key",
			service_name: "string",
			account_identifier: "string",
			password: "string",
			created_at: "timestamp",
			updated_at: "timestamp",
		},
		data: streamingAccounts,
	});
});

app.post("/accounts", async (c) => {
	const body = (await c.req.json()) as Partial<CreateStreamingAccountInput>;

	if (!body.service_name || !body.account_identifier || !body.password) {
		return c.json(
			{
				error:
					"service_name, account_identifier, and password are required",
			},
			400,
		);
	}

	if (!emailPattern.test(body.account_identifier)) {
		return c.json({ error: "account_identifier must be a valid email address" }, 400);
	}

	const createdAt = now();
	const newAccount: StreamingAccount = {
		account_id: nextAccountId(),
		service_name: body.service_name,
		account_identifier: body.account_identifier,
		password: body.password,
		created_at: createdAt,
		updated_at: createdAt,
	};

	streamingAccounts.push(newAccount);

	return c.json(newAccount, 201);
});

app.get("/", (c) => {
	return c.json({
		resource: "household",
		table: "household",
		fields: {
			group_id: "integer primary key",
			group_name: "string",
			created_at: "timestamp",
			updated_at: "timestamp",
			group_code_salt: "binary",
			group_code_hash: "binary",
		},
		data: households,
	});
});

app.get("/:groupId", (c) => {
	const groupId = Number(c.req.param("groupId"));

	if (!Number.isInteger(groupId)) {
		return c.json({ error: "groupId must be a valid integer" }, 400);
	}

	const household = findHousehold(groupId);

	if (!household) {
		return c.json({ error: "Household not found" }, 404);
	}

	return c.json(household);
});

app.post("/", async (c) => {
	const body = (await c.req.json()) as Partial<CreateHouseholdInput>;

	if (!body.group_name || !body.group_code_salt || !body.group_code_hash) {
		return c.json(
			{
				error:
					"group_name, group_code_salt, and group_code_hash are required",
			},
			400,
		);
	}

	const createdAt = now();
	const household: Household = {
		group_id: nextGroupId(),
		group_name: body.group_name,
		created_at: createdAt,
		updated_at: createdAt,
		group_code_salt: body.group_code_salt,
		group_code_hash: body.group_code_hash,
	};

	households.push(household);

	return c.json(household, 201);
});

app.patch("/:groupId", async (c) => {
	const groupId = Number(c.req.param("groupId"));

	if (!Number.isInteger(groupId)) {
		return c.json({ error: "groupId must be a valid integer" }, 400);
	}

	const household = findHousehold(groupId);

	if (!household) {
		return c.json({ error: "Household not found" }, 404);
	}

	const body = (await c.req.json()) as UpdateHouseholdInput;

	if (body.group_name !== undefined) {
		household.group_name = body.group_name;
	}

	if (body.group_code_salt !== undefined) {
		household.group_code_salt = body.group_code_salt;
	}

	if (body.group_code_hash !== undefined) {
		household.group_code_hash = body.group_code_hash;
	}

	household.updated_at = now();

	return c.json(household);
});

app.delete("/:groupId", (c) => {
	const groupId = Number(c.req.param("groupId"));

	if (!Number.isInteger(groupId)) {
		return c.json({ error: "groupId must be a valid integer" }, 400);
	}

	const householdIndex = households.findIndex((household) => {
		return household.group_id === groupId;
	});

	if (householdIndex < 0) {
		return c.json({ error: "Household not found" }, 404);
	}

	const [deletedHousehold] = households.splice(householdIndex, 1);

	return c.json({ deleted: deletedHousehold });
});

export default app;
