import { Hono } from "hono";
import { db } from "../database/knex.ts";

const app = new Hono();

app.put("/store", async (c) => {
  const parsedBody = await c.req.parseBody();

  const vaultItemName = parsedBody.vaultItemName as string;
  const vaultItemValue = parsedBody.vaultItemValue as string;
  const householdId = parseInt(parsedBody.householdId as string);

  let transaction = db.transaction();

  const usersInGroup: Array<{ user_id: number }> = await db.select()
    .where("household_id", householdId)
    .from("household_membership");

  for (const user of usersInGroup) {
    const userId = user.user_id;
    transaction.ins;
  }

  transaction.app;
});

export default app;
