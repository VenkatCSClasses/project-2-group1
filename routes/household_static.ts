// Assisted-by: GitHub Copilot:GPT-5.3-Codex [apply_patch] [get_errors]
// and claude opus 4.7 to fix the mess :)

import { Context, Hono } from "@hono/hono";
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { db } from "../database/knex.ts";
import { isLoggedIn } from "../cryptography.ts";

const app = new Hono();

type HouseholdRow = {
  household_id: number;
  household_name: string;
  join_code: number;
  created_at: string | Date;
  updated_at: string | Date;
};

type MemberRow = {
  member_id: number;
  name: string;
  role: string;
};

type AccountRow = {
  account_id: number;
  service_name: string;
  account_identifier: string | null;
};

function parsePositiveInteger(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function readQueryParam(c: Context, keys: string[]): string | null {
  for (const key of keys) {
    const value = c.req.query(key);
    if (value !== undefined && value !== "") return value;
  }
  return null;
}

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function isoString(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

app.get("/", async (c: Context) => {
  const householdIdRaw = readQueryParam(c, [
    "householdId",
    "householdID",
    "household_id",
    "household_Id",
    "househildId",
    "househild_id",
  ]);
  const householdId = parsePositiveInteger(householdIdRaw);

  const loginResult = await isLoggedIn(c);
  const userId = loginResult.userId;

  if (householdId === null) {
    return c.html(
      renderErrorPage("Missing required query param: householdId."),
    );
  }

  if (!loginResult.loggedIn) {
    return c.html(
      renderErrorPage(
        "You must be logged in to view a household.",
      ),
    );
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
    .first() as HouseholdRow | undefined;

  if (!householdRow) {
    return c.html(renderErrorPage("Household not found."));
  }

  const membership = await db("household_membership as hm")
    .join("user_account as ua", "ua.user_id", "hm.user_id")
    .select("ua.user_id", "ua.username", "hm.role")
    .where({ "hm.household_id": householdId, "hm.user_id": userId })
    .first() as { user_id: number; username: string; role: string } | undefined;

  if (!membership) {
    return c.html(renderErrorPage("User is not a member of this household."));
  }

  const isManager = String(membership.role).trim().toLowerCase() === "manager";

  const memberRows = await db("household_membership as hm")
    .join("user_account as ua", "ua.user_id", "hm.user_id")
    .select(
      "ua.user_id as member_id",
      "ua.username as name",
      "hm.role",
    )
    .where({ "hm.household_id": householdId })
    .orderBy("ua.user_id", "asc") as MemberRow[];

  const accountRows = await db("shared_vault_password")
    .select(
      "item_id as account_id",
      "service_name",
      "service_username as account_identifier",
    )
    .where({ group_id: householdId })
    .orderBy("item_id", "asc") as AccountRow[];

  return c.html(
    renderPage({
      household: householdRow,
      viewer: { username: membership.username, isManager },
      members: memberRows,
      accounts: accountRows,
    }),
  );
});

function renderMembers(
  members: MemberRow[],
): HtmlEscapedString | Promise<HtmlEscapedString> {
  if (members.length === 0) {
    return html`
      <li>No members have been added yet.</li>
    `;
  }

  return html`
    ${members.map((member) =>
      html`
        <li>
          <div class="member-row">
            <span><strong>${member.name}</strong> - ${member.role}</span>
          </div>
        </li>
      `
    )}
  `;
}

function renderAccountsTable(
  accounts: AccountRow[],
  isManager: boolean,
  householdId: number,
): HtmlEscapedString | Promise<HtmlEscapedString> {
  if (accounts.length === 0) {
    return html`
      <p>No streaming accounts have been added yet.</p>
    `;
  }

  return html`
    <table class="account-table" aria-label="Stored streaming accounts">
      <thead>
        <tr>
          <th>Service</th>
          <th>Email Address</th>
          <th>Password</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${accounts.map((account) =>
          html`
            <tr>
              <td>${account.service_name}</td>
              <td>${account.account_identifier ?? ""}</td>
              <td class="password-cell">
                <button
                  class="copy-password-btn"
                  type="button"
                  hx-get="/api/keychain/unlock?credentialId=${String(
                    account.account_id,
                  )}&householdId=${String(householdId)}"
                  hx-target="#unlock-container"
                  hx-swap="beforeend"
                  data-account-id="${String(account.account_id)}"
                  aria-label="Copy password"
                >
                  Copy
                </button>
              </td>
              <td>
                <button
                  type="button"
                  class="account-delete-btn manager-view"
                  hx-delete="/api/keychain/delete?accountId=${String(
                    account.account_id,
                  )}"
                  hx-swap="outerHTML swap:1s"
                  hx-target="#account-status"
                  hx-confirm="Are you sure you want to delete this account?"
                  data-account-id="${String(account.account_id)}"
                  ${raw(isManager ? "" : "hidden")}
                >
                  Delete
                </button>
              </td>
            </tr>
          `
        )}
      </tbody>
    </table>
  `;
}

function renderErrorPage(
  message: string,
): HtmlEscapedString | Promise<HtmlEscapedString> {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <!-- INSERT_HEAD_HTML -->
        <title>Household Not Found</title>
      </head>
      <body>
        <div class="window" style="max-width:560px;margin:48px auto;">
          <div class="title-bar">
            <div class="title-bar-text">SubSeer Household View</div>
            <div class="title-bar-controls">
              <button type="button">
                <a href="/homepage">Back</a>
              </button>
            </div>
          </div>
          <div class="window-body">
            <p role="alert">${message}</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

type RenderPageArgs = {
  household: HouseholdRow;
  viewer: { username: string; isManager: boolean };
  members: MemberRow[];
  accounts: AccountRow[];
};

function renderPage(
  args: RenderPageArgs,
): HtmlEscapedString | Promise<HtmlEscapedString> {
  const { household, viewer, members, accounts } = args;
  const isManager = viewer.isManager;
  const managerHiddenAttr = raw(isManager ? "" : "hidden");
  const viewerContextClass = `viewer-context ${
    isManager ? "manager" : "member"
  }`;
  const viewerContextText = `Viewing as ${viewer.username} - ${
    isManager ? "Manager" : "Member"
  }`;
  const managerOnlyNote = isManager
    ? "Manager tools are enabled."
    : "Member view: you can add accounts, but only managers can delete them.";

  return html`
    <!-- Assisted-by: GitHub Copilot:GPT-5.3-Codex [apply_patch] [get_errors] -->

    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Household: ${household.household_name}</title>
        <!-- INSERT_HEAD_HTML -->
      </head>
      <body
        class="wide-window"
        data-household-id="${String(household.household_id)}"
        data-is-manager="${isManager ? "1" : "0"}"
      >
        <div class="window">
          <div class="title-bar">
            <div class="title-bar-text">SubSeer Household View</div>
            <div class="title-bar-controls title-actions">
              <button type="button">
                <a href="/homepage">Back</a>
              </button>
            </div>
          </div>
          <div class="window-body">
            <article class="household-card" aria-label="Household placeholder">
              <h2 id="household-name" class="section-title">${household
                .household_name}</h2>
              <p
                id="viewer-context"
                class="${viewerContextClass}"
                role="status"
                aria-live="polite"
              >
                ${viewerContextText}
              </p>
              <div class="top-grid">
                <section
                  aria-label="Household overview"
                  class="section-panel overview"
                >
                  <h3 class="section-title">Household Overview</h3>
                  <dl class="meta-row">
                    <dt>Household ID:</dt>
                    <dd id="household-id">${String(household.household_id)}</dd>

                    <dt class="manager-view" ${managerHiddenAttr}>Join Code:</dt>
                    <dd class="manager-view" ${managerHiddenAttr}>
                      <span class="join-code-wrap">
                        <span id="household-join-code">${String(
                          household.join_code,
                        )}</span>
                      </span>
                    </dd>

                    <dt>Created:</dt>
                    <dd>
                      <time id="household-created" datetime="${isoString(
                        household.created_at,
                      )}"
                      >${formatDate(household.created_at)}</time>
                    </dd>

                    <dt>Updated:</dt>
                    <dd>
                      <time id="household-updated" datetime="${isoString(
                        household.updated_at,
                      )}"
                      >${formatDate(household.updated_at)}</time>
                    </dd>

                    <dt>Member Count:</dt>
                    <dd id="household-member-count">${String(
                      members.length,
                    )}</dd>
                  </dl>
                  <p
                    id="join-code-status"
                    class="status"
                    role="status"
                    aria-live="polite"
                  >
                  </p>
                </section>

                <section
                  class="members section-panel"
                  aria-label="Household members"
                >
                  <h3 class="section-title">Household Members</h3>
                  <p>Current residents with role assignments.</p>
                  <ul id="members-output">
                    ${renderMembers(members)}
                  </ul>
                  <p
                    id="member-status"
                    class="status"
                    role="status"
                    aria-live="polite"
                  >
                  </p>
                </section>
              </div>

              <section
                class="accounts section-panel"
                aria-label="Account placeholders"
              >
                <h3 class="section-title">Shared Vault Passwords</h3>
                <form
                  id="accounts-form"
                  class="accounts-form"
                  aria-label="Add streaming account"
                  hx-put="/api/keychain/store"
                  hx-swap="outerHTML swap:1s"
                  hx-target="#account-status"
                >
                  <label for="service-name">Service</label>
                  <input
                    id="service-name"
                    name="serviceName"
                    type="text"
                    placeholder="Netflix"
                    required
                    autocomplete="organization"
                  >

                  <label for="account-identifier">Email Address</label>
                  <input
                    id="account-identifier"
                    name="serviceUsername"
                    type="email"
                    placeholder="account@domain.com"
                    required
                    autocomplete="email"
                  >

                  <label for="account-password">Service Password</label>
                  <input
                    id="account-password"
                    name="servicePassword"
                    type="text"
                    placeholder="Password"
                    required
                    autocomplete="current-password"
                  >

                  <input type="hidden" name="householdId" value="${String(
                    household.household_id,
                  )}">
                  <button type="submit">Add account</button>
                </form>
                <p id="manager-only-note" class="manager-only-note">${managerOnlyNote}</p>

                <p
                  id="account-status"
                  class="status"
                  role="status"
                  aria-live="polite"
                >
                </p>

                <div id="accounts-output">
                  ${renderAccountsTable(
                    accounts,
                    isManager,
                    household.household_id,
                  )}
                </div>
              </section>
            </article>
          </div>
        </div>

        <div id="unlock-container"></div>
      </body>
    </html>
  `;
}

export default app;
