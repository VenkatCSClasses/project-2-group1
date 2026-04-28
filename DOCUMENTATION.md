# SubSeer Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Prerequisites](#prerequisites)
3. [Installation & Setup](#installation--setup)
4. [Running the Application](#running-the-application)
5. [Using the Application](#using-the-application)
6. [Testing](#testing)
   - [Component Tests](#component-tests)
   - [System/Integration Tests](#systemintegration-tests)
7. [Database Setup](#database-setup)
8. [Troubleshooting](#troubleshooting)

---

## Project Overview

**SubSeer** is a household account manager web application that allows users to securely store and manage shared account credentials within a household group (family, roommates, etc.).

It is recommended to interact with this project at the link below:<br>
<https://subseer.robog.net>

### Key Features:
- User registration and authentication with JWT tokens
- Create or join households using join codes
- Two user roles: **Managers** and **Members**
- Secure credential storage with encryption
- Account information sharing within households
- Password-based key derivation for security

---

## Prerequisites

Before running SubSeer, ensure you have the following installed:

1. **Deno** (v1.40 or higher)
   - [Installation Guide](https://docs.deno.com/runtime/manual/getting_started/installation)
   - Verify installation: `deno --version`

2. **PostgreSQL** (v12 or higher) - Required for production
   - [Installation Guide](https://www.postgresql.org/download/)
   - Or use Docker: `docker-compose up -d` (if docker-compose.yml is available)

3. **Node.js** (optional, for package management)
   - Required if you need to manage npm dependencies

---

## Installation & Setup

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd project-2-group1
```

### Step 2: Set Up Environment Variables
Create a `.env` file in the project root with the following variables:

```bash
# Database connection string (PostgreSQL)
DATABASE_URL=postgresql://subseer:subseer@localhost:5432/subseer

# Optional: Set test mode
IS_TEST=0  # Set to 1 when running tests
```

**For local development:**
```bash
DATABASE_URL=postgresql://subseer:subseer@localhost:5432/subseer
```

### Step 3: Set Up PostgreSQL Database
If using Docker Compose (optional):
```bash
docker-compose up -d
```

Or manually create the PostgreSQL database:
```sql
CREATE USER subseer WITH PASSWORD 'subseer';
CREATE DATABASE subseer OWNER subseer;
```

### Step 4: Install Dependencies
Deno automatically downloads dependencies on first run, but you can pre-fetch them:
```bash
deno cache main.ts
```

---

## Running the Application

### Start the Development Server
```bash
deno task start
```

**What this does:**
- Runs database migrations automatically
- Starts the Hono web server
- Watches for file changes and auto-reloads
- Allows network access and file system access as needed
- Server runs on `http://localhost:8000` (default)

### Access the Application
Open your browser and navigate to:
```
http://localhost:8000
```

### Stop the Server
Press `CTRL+C` in the terminal where the server is running.

---

## Using the Application

### User Registration
1. Navigate to the **Sign Up** page
2. Enter a username and password
3. Click **Sign Up**
4. You will be automatically logged in

### User Login
1. Navigate to the **Log In** page
2. Enter your username and password
3. Click **Log In**
4. You will be redirected to your household dashboard

### Household Management

#### As a Manager:
**Create a Household:**
1. From the dashboard, click **Create Household**
2. Enter a household name
3. A join code will be automatically generated
4. Share this join code with members who want to join

**Add an Account:**
1. Go to the household
2. Click **Add Account**
3. Enter account name, username, password, and account URL
4. Members with access can now view this account

**Remove a Member:**
1. In the household members list, find the member to remove
2. Click **Remove** next to their name

**Delete a Household:**
1. Go to the household settings
2. Click **Delete Household**
3. This action cannot be undone

**View Join Code:**
1. Navigate to household details
2. The join code is displayed and can be shared with others

#### As a Member:
**Join a Household:**
1. From the dashboard, click **Join Household**
2. Enter the household join code (obtained from a manager)
3. Click **Join**
4. You are now a member of that household

**View Account Information:**
1. Navigate to a household you're a member of
2. View all accounts that have been shared with members
3. Click on an account to see credentials (if you have access)

**Add an Account:**
1. In a household you're a member of, click **Add Account**
2. Fill in the account details
3. Managers can modify or remove it if needed

### Account Details
Each account stores:
- **Account Name:** Identifier for the account (e.g., "Netflix")
- **Username:** Login username for the account
- **Password:** Encrypted password (securely stored)
- **Account URL:** Link to the service website

---

## Testing

The SubSeer application includes two types of tests: **Component Tests** and **System/Integration Tests**. Both are written using Deno's testing framework (`@std/testing`).

### Running Tests
```bash
deno task check
```

This command:
- Formats all TypeScript files
- Runs all tests in the `tests/` directory
- Sets the `IS_TEST=1` environment variable (uses in-memory database)
- Generates code coverage reports

---

### Component Tests

Component tests focus on **individual functions and modules** in isolation. They test specific functionality without requiring the full application stack.

#### `cryptography_test.ts` - Encryption & Key Management Tests

**Purpose:** Ensures all cryptographic operations work correctly for secure credential storage.

**Key Test Areas:**

1. **RSA Key Operations**
   - Generate valid RSA key pairs with public and private keys
   - Export key pairs to Uint8Array format for storage
   - Import and use public keys for encryption
   - Import and use private keys for decryption

2. **Password-Based Key Derivation**
   - Generate cryptographically secure random salts (128 bytes)
   - Derive symmetric AES-GCM keys from passwords and salts
   - Verify different passwords produce different keys
   - Ensure consistent key derivation for the same inputs

3. **Account Secrets Generation**
   - Generate complete account security packages (RSA keys, salts, encrypted keys)
   - Ensure all components are properly created and formatted

**Example Test:**
```typescript
it("Should generate a valid RSA key pair", async () => {
  const keyPair = await generateRSAKeyPair();
  assertExists(keyPair.publicKey);
  assertExists(keyPair.privateKey);
  assertEquals(keyPair.publicKey.type, "public");
});
```

**Why These Tests Matter:**
- Cryptographic failures would expose user credentials
- Tests verify encryption/decryption works correctly
- Ensures password security through proper key derivation

---

### System/Integration Tests

System tests verify that **multiple components work together** to create complete user workflows. They test actual HTTP requests, database interactions, and business logic.

#### `homepage_test.ts` - User & Household Interaction Tests

**Purpose:** Tests the complete flow of user registration, login, household management, and account viewing.

**Key Test Areas:**

1. **Test Setup**
   - Create test users (Alice, Bob, Charlie) with unique usernames
   - Create test households with join codes
   - Set up user roles (Manager, Member)
   - Establish relationships in the database

2. **User Authentication**
   - Verify JWT token generation for login sessions
   - Test valid and invalid authentication states

3. **Household Access**
   - Test that managers can view all their households
   - Test that members only see households they've joined
   - Verify non-members cannot access household data

4. **Account Visibility**
   - Test managers can see all accounts in their households
   - Test members can only view accounts they have access to
   - Verify unauthorized users cannot access accounts

**Example Test Flow:**
```typescript
// Create test users
const managerId = await createTestUser("Alice123");
const memberId = await createTestUser("Bob456");

// Create household and establish memberships
const householdId = await createTestHousehold("Test House");
await db("household_membership").insert({
  user_id: managerId,
  household_id: householdId,
  role: "Manager"
});

// Verify manager can access household
const response = await homepageApp.request("/");
assertEquals(response.status, 200);
```

**Why These Tests Matter:**
- Ensures users see only their own data
- Prevents unauthorized access to household information
- Verifies correct role-based access control
- Tests real HTTP request/response cycles

#### `household_test.ts` - Household CRUD Operations Tests

**Purpose:** Tests all household-related HTTP endpoints and data operations.

**Key Test Areas:**

1. **Household Creation**
   - Create a new household with valid data
   - Verify household ID and join code generation
   - Ensure household is stored in database correctly

2. **Household Retrieval**
   - Fetch all households
   - Fetch a specific household by ID
   - Test invalid household ID handling (returns 400 error)

3. **Household Updates**
   - Update household name using PATCH request
   - Verify changes are persisted to database

4. **Member Management**
   - Add members to a household
   - Retrieve list of household members
   - Remove members from a household
   - Test invalid member data (empty name/role returns 400)

5. **Account Management**
   - Add accounts to a household
   - Retrieve accounts in a household
   - Test proper JSON response format

6. **Error Handling**
   - Invalid household IDs return appropriate error codes
   - Missing required fields return 400 errors
   - Malformed requests are rejected

**Example Test:**
```typescript
const createHouseholdResponse = await householdApp.request("/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    household_name: "Test House",
  }),
});
assertEquals(createHouseholdResponse.status, 201);

const createdHousehold = await readJson(createHouseholdResponse);
assertEquals(createdHousehold.household_name, "Test House");
```

**Why These Tests Matter:**
- Verifies all API endpoints work correctly
- Tests HTTP status codes (201 for creation, 200 for success, 400 for errors)
- Ensures database transactions are atomic
- Validates JSON response format

---

### Test Database

All tests run with an **in-memory SQLite database** (LibSQL) when `IS_TEST=1` is set:
- Fast test execution
- No external dependencies
- Automatic cleanup after each test run
- Completely isolated from production data

---

## Database Setup

### Database Migrations

The application automatically runs database migrations on startup using Knex.js. Migration files are located in `database/migrations/`.

**Migration Files:**
- `20260410000000-initial-schema.ts` - Core tables (users, households, memberships)
- `20260410010000-ignore-salt-use-key-for-login.ts` - Updates to authentication fields
- `20260413000000-generate-jwt.ts` - JWT token infrastructure

### Manual Migration

To manually run migrations:
```bash
deno run --allow-net --ignore-env --allow-read --allow-write migrate.ts
```

### Database Schema Overview

**Key Tables:**
- `user_account` - User login information and RSA keys
- `household` - Household groups and join codes
- `household_membership` - User roles in households (Manager/Member)
- `shared_vault_password` - Encrypted account credentials
- `knex_migrations` - Migration history

---

## Troubleshooting

### Port Already in Use
**Error:** `listen EADDRINUSE: address already in use :::8000`

**Solution:**
```bash
# Find process using port 8000
lsof -i :8000

# Kill the process (replace PID with actual process ID)
kill -9 <PID>

# Or use a different port by modifying main.ts
```

### Database Connection Failed
**Error:** `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution:**
1. Verify PostgreSQL is running:
   ```bash
   pg_isready -h localhost -p 5432
   ```

2. Check DATABASE_URL environment variable
3. Ensure PostgreSQL credentials are correct
4. For Docker: `docker-compose up -d`

### Test Failures
**Error:** Tests fail due to environment issues

**Solution:**
```bash
# Clear node_modules and deno cache
rm -rf node_modules
deno cache --reload main.ts

# Re-run tests
deno task check
```

### Missing Dependencies
**Error:** `Module not found` or import errors

**Solution:**
```bash
# Reload Deno cache
deno cache --reload main.ts

# Install dependencies
deno task install
```

### Permission Errors
**Error:** `Permission denied` when accessing files or network

**Solution:**
- Ensure the `deno task start` command in `deno.json` includes necessary permissions:
  - `--allow-net` - Network access
  - `--allow-read=.` - File read access
  - `--allow-write` - File write access

---

## Development Workflow

### Code Formatting
```bash
deno fmt **/*.ts
```

### Type Checking
```bash
deno check main.ts
```

### Linting
```bash
deno lint
```

### Running Individual Test Files
```bash
IS_TEST=1 deno test --allow-sys --allow-ffi --allow-net --allow-env --allow-read=. tests/cryptography_test.ts
```

---

## Security Considerations

1. **Never commit `.env` files** containing secrets to version control
2. **Use strong passwords** when creating user accounts
3. **Keep Deno and dependencies updated** for security patches
4. **PostgreSQL passwords** should be changed in production
5. **JWT secret** is derived from cryptographic functions for security
6. **All credentials** are encrypted before storage using RSA and AES-GCM

---

## Support & Troubleshooting

For additional help:
- Check the README.md for project overview
- Review test files for usage examples
- Consult Deno documentation: https://docs.deno.com
- Hono documentation: https://hono.dev
- PostgreSQL documentation: https://www.postgresql.org/docs/

---

**Last Updated:** April 28, 2026  
**Version:** 1.1
