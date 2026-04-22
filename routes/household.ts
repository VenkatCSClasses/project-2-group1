// Assisted-by: GitHub Copilot:GPT-5.3-Codex [apply_patch] [get_errors]

import { Hono } from "@hono/hono";
import { db } from "../database/knex.ts";

type Household = {
  household_id: number;
  household_name: string;
  join_code: number;
  created_at: string;
  updated_at: string;
};

type CreateHouseholdInput = {
  household_name: string;
  join_code?: number;
};

type UpdateHouseholdInput = Partial<CreateHouseholdInput>;

type StreamingAccount = {
  account_id: number;
  household_id: number;
  service_name: string;
  account_identifier: string;
  password: string;
  created_at: string;
  updated_at: string;
};

type CreateStreamingAccountInput = {
  household_id: number;
  service_name: string;
  account_identifier: string;
  password: string;
};

type HouseholdMember = {
  member_id: number;
  household_id: number;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
};

type CreateHouseholdMemberInput = {
  household_id: number;
  name: string;
  role: string;
};

const app = new Hono();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseOptionalInteger(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function parseOptionalHouseholdId(value: string | null) {
  return parseOptionalInteger(value);
}

function parseOptionalUserId(value: string | null) {
  return parseOptionalInteger(value);
}

function normalizeRole(role: string) {
  return role.trim().toLowerCase();
}

function makeJoinCode() {
  return Math.floor(100000 + Math.random() * 900000);
}

function mapHousehold(row: {
  household_id: number;
  household_name: string;
  join_code: number;
  created_at: string | Date;
  updated_at: string | Date;
}): Household {
  return {
    household_id: row.household_id,
    household_name: row.household_name,
    join_code: row.join_code,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

app.get("/context", async (c) => {
  const householdId = parseOptionalHouseholdId(
    c.req.query("household_id") ?? null,
  );
  const userId = parseOptionalUserId(c.req.query("user_id") ?? null);

  if (householdId === null || userId === null) {
    return c.json({
      error: "household_id and user_id query parameters are required",
    }, 400);
  }

  const householdRow = await db("household")
    .select(
      "household_id",
      "household_name",
      "join_code",
      "created_at",
      "updated_at",
    )
    .where({ household_id: householdId })
    .first();

  if (!householdRow) {
    return c.json({ error: "Household not found" }, 404);
  }

  const membership = await db("household_membership as hm")
    .join("user_account as ua", "ua.user_id", "hm.user_id")
    .select("ua.user_id", "ua.username", "hm.role", "hm.household_id")
    .where({ "hm.household_id": householdId, "hm.user_id": userId })
    .first();

  if (!membership) {
    return c.json({ error: "User is not a member of this household" }, 403);
  }

  const normalizedRole = normalizeRole(String(membership.role));

  return c.json({
    household: mapHousehold(householdRow),
    user: {
      user_id: membership.user_id,
      username: membership.username,
      role: membership.role,
      is_manager: normalizedRole === "manager",
      is_member: normalizedRole === "member",
    },
  });
});

app.get("/members", async (c) => {
  const householdId = parseOptionalHouseholdId(
    c.req.query("household_id") ?? null,
  );
  const query = db("household_membership as hm")
    .join("user_account as ua", "ua.user_id", "hm.user_id")
    .select(
      "ua.user_id as member_id",
      "hm.household_id",
      "ua.username as name",
      "hm.role",
      "hm.created_at",
      "hm.updated_at",
    )
    .orderBy("ua.user_id", "asc");

  if (householdId !== null) {
    query.where("hm.household_id", householdId);
  }

  const rows = await query;
  const data: HouseholdMember[] = rows.map((row) => ({
    member_id: row.member_id,
    household_id: row.household_id,
    name: row.name,
    role: row.role,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));

  return c.json({ resource: "household_members", data });
});

app.post("/members", async (c) => {
  const body = (await c.req.json()) as Partial<CreateHouseholdMemberInput>;

  if (!body.household_id || !body.name || !body.role) {
    return c.json({ error: "household_id, name, and role are required" }, 400);
  }

  const household = await db("household")
    .select("household_id")
    .where({ household_id: body.household_id })
    .first();

  if (!household) {
    return c.json({ error: "Household not found" }, 404);
  }

  const [createdUser] = await db("user_account")
    .insert({
      username: body.name,
      public_key: encoder.encode("subseer-public-key"),
      password_salt: encoder.encode("subseer-salt"),
      encrypted_private_key: encoder.encode("subseer-private-key"),
    })
    .returning(["user_id"]);

  const [createdMembership] = await db("household_membership")
    .insert({
      user_id: createdUser.user_id,
      household_id: body.household_id,
      role: body.role,
    })
    .returning(["created_at", "updated_at", "household_id", "role"]);

  const newMember: HouseholdMember = {
    member_id: createdUser.user_id,
    household_id: createdMembership.household_id,
    name: body.name,
    role: createdMembership.role,
    created_at: String(createdMembership.created_at),
    updated_at: String(createdMembership.updated_at),
  };

  return c.json(newMember, 201);
});

app.delete("/members/:memberId", async (c) => {
  const memberId = Number(c.req.param("memberId"));
  const householdId = parseOptionalHouseholdId(
    c.req.query("household_id") ?? null,
  );

  if (!Number.isInteger(memberId)) {
    return c.json({ error: "memberId must be a valid integer" }, 400);
  }

  if (householdId === null) {
    return c.json({ error: "household_id query parameter is required" }, 400);
  }

  const existingMember = await db("household_membership as hm")
    .join("user_account as ua", "ua.user_id", "hm.user_id")
    .select(
      "ua.user_id as member_id",
      "hm.household_id",
      "ua.username as name",
      "hm.role",
      "hm.created_at",
      "hm.updated_at",
    )
    .where({
      "hm.user_id": memberId,
      "hm.household_id": householdId,
    })
    .first();

  if (!existingMember) {
    return c.json({ error: "Member not found" }, 404);
  }

  await db("household_membership")
    .where({ user_id: memberId, household_id: householdId })
    .del();

  const hasOtherMemberships = await db("household_membership")
    .select("user_id")
    .where({ user_id: memberId })
    .first();

  if (!hasOtherMemberships) {
    await db("user_account").where({ user_id: memberId }).del();
  }

  return c.json({
    deleted: {
      member_id: existingMember.member_id,
      household_id: existingMember.household_id,
      name: existingMember.name,
      role: existingMember.role,
      created_at: String(existingMember.created_at),
      updated_at: String(existingMember.updated_at),
    },
  });
});

app.get("/accounts", async (c) => {
  const householdId = parseOptionalHouseholdId(
    c.req.query("household_id") ?? null,
  );
  const query = db("shared_vault_password")
    .select(
      "shared_vault_password.item_id as account_id",
      "shared_vault_password.group_id as household_id",
      "shared_vault_password.service_name",
      "shared_vault_password.service_username as account_identifier",
      db.raw(`(
        SELECT encrypted_service_password
        FROM user_vault_access
        WHERE user_vault_access.item_id = shared_vault_password.item_id
        ORDER BY user_id ASC
        LIMIT 1
      ) as service_password`),
      "shared_vault_password.created_at",
      "shared_vault_password.updated_at",
    )
    .orderBy("item_id", "asc");

  if (householdId !== null) {
    query.where("group_id", householdId);
  }

  const rows = await query;
  const data: StreamingAccount[] = rows.map((row) => ({
    account_id: row.account_id,
    household_id: row.household_id,
    service_name: row.service_name,
    account_identifier: row.account_identifier ?? "",
    password: row.service_password ? decoder.decode(row.service_password) : "",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));

  return c.json({ resource: "shared_vault_passwords", data });
});

app.post("/accounts", async (c) => {
  const body = (await c.req.json()) as Partial<CreateStreamingAccountInput>;

  if (
    !body.household_id || !body.service_name || !body.account_identifier ||
    !body.password
  ) {
    return c.json(
      {
        error:
          "household_id, service_name, account_identifier, and password are required",
      },
      400,
    );
  }

  if (!emailPattern.test(body.account_identifier)) {
    return c.json(
      { error: "account_identifier must be a valid email address" },
      400,
    );
  }

  const household = await db("household")
    .select("household_id")
    .where({ household_id: body.household_id })
    .first();

  if (!household) {
    return c.json({ error: "Household not found" }, 404);
  }

  const [created] = await db("shared_vault_password")
    .insert({
      group_id: body.household_id,
      service_name: body.service_name,
      service_username: body.account_identifier,
    })
    .returning([
      "item_id as account_id",
      "group_id as household_id",
      "service_name",
      "service_username as account_identifier",
      "created_at",
      "updated_at",
    ]);

  const members = await db("household_membership")
    .select("user_id")
    .where({ household_id: body.household_id });

  if (members.length === 0) {
    await db("shared_vault_password").where({ item_id: created.account_id })
      .del();
    return c.json(
      {
        error: "Household must have at least one member before adding accounts",
      },
      400,
    );
  }

  await db("user_vault_access").insert(
    members.map((member) => ({
      user_id: member.user_id,
      item_id: created.account_id,
      encrypted_service_password: encoder.encode(body.password as string),
    })),
  );

  const newAccount: StreamingAccount = {
    account_id: created.account_id,
    household_id: created.household_id,
    service_name: created.service_name,
    account_identifier: created.account_identifier,
    password: body.password,
    created_at: String(created.created_at),
    updated_at: String(created.updated_at),
  };

  return c.json(newAccount, 201);
});

app.delete("/accounts/:accountId", async (c) => {
  const accountId = Number(c.req.param("accountId"));

  if (!Number.isInteger(accountId)) {
    return c.json({ error: "accountId must be a valid integer" }, 400);
  }

  const [deletedAccount] = await db("shared_vault_password")
    .where({ item_id: accountId })
    .del()
    .returning([
      "item_id as account_id",
      "group_id as household_id",
      "service_name",
      "service_username as account_identifier",
      "created_at",
      "updated_at",
    ]);

  if (!deletedAccount) {
    return c.json({ error: "Account not found" }, 404);
  }

  return c.json({
    deleted: {
      account_id: deletedAccount.account_id,
      household_id: deletedAccount.household_id,
      service_name: deletedAccount.service_name,
      account_identifier: deletedAccount.account_identifier ?? "",
      password: "",
      created_at: String(deletedAccount.created_at),
      updated_at: String(deletedAccount.updated_at),
    },
  });
});

app.get("/", async (c) => {
  const rows = await db("household")
    .select(
      "household_id",
      "household_name",
      "join_code",
      "created_at",
      "updated_at",
    )
    .orderBy("household_id", "asc");

  const data = rows.map(mapHousehold);

  return c.json({
    resource: "household",
    table: "household",
    data,
  });
});

app.get("/:householdId", async (c) => {
  const householdId = Number(c.req.param("householdId"));

  if (!Number.isInteger(householdId)) {
    return c.json({ error: "householdId must be a valid integer" }, 400);
  }

  const row = await db("household")
    .select(
      "household_id",
      "household_name",
      "join_code",
      "created_at",
      "updated_at",
    )
    .where({ household_id: householdId })
    .first();

  if (!row) {
    return c.json({ error: "Household not found" }, 404);
  }

  return c.json(mapHousehold(row));
});

app.post("/", async (c) => {
  const body = (await c.req.json()) as Partial<CreateHouseholdInput>;

  if (!body.household_name) {
    return c.json({ error: "household_name is required" }, 400);
  }

  const joinCode = Number.isInteger(body.join_code)
    ? body.join_code
    : makeJoinCode();

  const [created] = await db("household")
    .insert({ household_name: body.household_name, join_code: joinCode })
    .returning([
      "household_id",
      "household_name",
      "join_code",
      "created_at",
      "updated_at",
    ]);

  const household = mapHousehold(created);

  return c.json(household, 201);
});

app.patch("/:householdId", async (c) => {
  const householdId = Number(c.req.param("householdId"));

  if (!Number.isInteger(householdId)) {
    return c.json({ error: "householdId must be a valid integer" }, 400);
  }

  const existing = await db("household")
    .select("household_id")
    .where({ household_id: householdId })
    .first();

  if (!existing) {
    return c.json({ error: "Household not found" }, 404);
  }

  const body = (await c.req.json()) as UpdateHouseholdInput;
  const updates: { household_name?: string; join_code?: number } = {};

  if (body.household_name !== undefined) {
    updates.household_name = body.household_name;
  }

  if (body.join_code !== undefined) {
    if (!Number.isInteger(body.join_code)) {
      return c.json({ error: "join_code must be a valid integer" }, 400);
    }
    updates.join_code = body.join_code;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No updatable fields provided" }, 400);
  }

  const [updated] = await db("household")
    .update(updates)
    .where({ household_id: householdId })
    .returning([
      "household_id",
      "household_name",
      "join_code",
      "created_at",
      "updated_at",
    ]);

  const household = mapHousehold(updated);

  return c.json(household);
});

app.delete("/:householdId", async (c) => {
  const householdId = Number(c.req.param("householdId"));

  if (!Number.isInteger(householdId)) {
    return c.json({ error: "householdId must be a valid integer" }, 400);
  }

  const [deletedHousehold] = await db("household")
    .where({ household_id: householdId })
    .del()
    .returning([
      "household_id",
      "household_name",
      "join_code",
      "created_at",
      "updated_at",
    ]);

  if (!deletedHousehold) {
    return c.json({ error: "Household not found" }, 404);
  }

  return c.json({ deleted: mapHousehold(deletedHousehold) });
});

export default app;
