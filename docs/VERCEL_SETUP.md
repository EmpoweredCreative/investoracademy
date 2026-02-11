# Step-by-Step: Setting Up WheelTracker on Vercel

This guide walks you through deploying the project on Vercel and obtaining every variable needed for your environment. **Local development:** copy `.env.example` to `.env` in the project root and fill in the values below (you won’t see `.env` in the file manager if it’s gitignored; create it from the example). **Vercel:** use Project → Settings → Environment Variables.

---

## Prerequisites

- A [Vercel account](https://vercel.com/signup) (GitHub/GitLab/Bitbucket or email)
- Your WheelTracker code in a Git repository (GitHub recommended)
- (Optional) A [SendGrid account](https://sendgrid.com) for email

---

## Step 1: Create a Vercel Project

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Click **Add New…** → **Project**.
3. **Import** your Git repository (e.g. `your-username/investoracademy-com` or wherever WheelTracker lives).
4. Configure the project:
   - **Framework Preset**: Next.js (should be auto-detected)
   - **Root Directory**: leave as `.` unless the app lives in a subfolder
   - **Build Command**: leave default (`npm run build` or `next build`)
   - **Output Directory**: leave default
5. **Do not** add environment variables yet. Click **Deploy**.
6. Wait for the first deployment. It will fail without a database and auth—that’s expected. Note your project URL, e.g. `wheeltracker-xxx.vercel.app`.

**Note:** This project uses Prisma 7 with the Postgres driver adapter (`@prisma/adapter-pg`). The build will fail with a PrismaClient constructor error until `DATABASE_URL` is set. Add at least `DATABASE_URL` (and other required vars) before or right after the first deploy, then redeploy.

---

## Step 2: Get `DATABASE_URL` (Vercel Postgres)

1. In the Vercel dashboard, open your **project**.
2. Go to the **Storage** tab.
3. Click **Create Database**.
4. Choose **Postgres** (Vercel Postgres).
5. Name it (e.g. `wheeltracker-db`) and pick a region close to you. Click **Create**.
6. When the database is ready, open it and go to the **Connect** / **Quickstart** tab (Vercel sometimes labels this as “.env.local” in the database view—it’s the tab that shows your Postgres connection env vars, not a file in your project).
7. You’ll see something like:
   ```bash
   POSTGRES_URL="postgres://default:xxxxx@ep-xxx.us-east-1.postgres.vercel-storage.com:5432/verceldb?sslmode=require"
   POSTGRES_PRISMA_URL="postgres://default:xxxxx@ep-xxx.us-east-1.postgres.vercel-storage.com:5432/verceldb?sslmode=require&pgbouncer=true"
   ```
8. **Link the database to your project** (if not already):
   - In the database view, use **Connect Project** and select your WheelTracker project.
   - This will add the Postgres env vars to that project.
9. For Prisma you need the **non-pgbouncer** URL for migrations and for the app if you’re not using Prisma Data Proxy. Use:
   - **`POSTGRES_URL`** as your app’s database URL.
10. In your project, go to **Settings → Environment Variables**.
11. Add a variable:
    - **Name**: `DATABASE_URL`
    - **Value**: paste the full `POSTGRES_URL` value (the one without `pgbouncer` in the query string).  
      If Vercel already added `POSTGRES_URL`, you can either:
    - Set `DATABASE_URL` to the same value as `POSTGRES_URL`, or  
    - In your app, use `process.env.POSTGRES_URL` where you currently use `DATABASE_URL` (and set that in Prisma config if needed).
12. For Prisma to use it, ensure `prisma.config.ts` (or your schema) is configured to use `DATABASE_URL` (or the env key you chose). Your `prisma.config.ts` already uses `process.env.DATABASE_URL`, so mapping `DATABASE_URL` to the stored `POSTGRES_URL` value is correct.

**Copy this value into your local `.env` as:**
```bash
DATABASE_URL="postgresql://default:xxxxx@ep-xxx.vercel-storage.com:5432/verceldb?sslmode=require"
```

---

## Step 3: Generate and Set `NEXTAUTH_SECRET`

1. On your **local machine**, open a terminal and run:
   ```bash
   openssl rand -base64 32
   ```
2. Copy the output (a long base64 string).
3. In Vercel: **Project → Settings → Environment Variables**.
4. Add:
   - **Name**: `NEXTAUTH_SECRET`
   - **Value**: paste the generated string
   - **Environments**: Production, Preview, Development (recommended for all)
5. Save.

**For local `.env`:**
```bash
NEXTAUTH_SECRET="paste-the-same-generated-string-here"
```

Use the **same** secret in Vercel and locally so sessions stay consistent if you use the same app URL.

---

## Step 4: Set `NEXTAUTH_URL`

- **On Vercel**: You can set this per environment.
  - **Production**: Your production URL, e.g. `https://wheeltracker-xxx.vercel.app`
  - **Preview**: Use Vercel’s automatic preview URL. Either set:
    - `NEXTAUTH_URL` to `https://$VERCEL_URL` and in code use `process.env.VERCEL_URL` to build the full URL, or
    - Omit and in NextAuth config use:
      ```ts
      NEXTAUTH_URL: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXTAUTH_URL
      ```
  - Easiest: set **one** variable in Vercel:
    - **Name**: `NEXTAUTH_URL`
    - **Value**: `https://your-production-domain.vercel.app` (your real production URL)
    - **Environments**: Production only (or all if you’re okay with previews using production auth URL)
- **Local**: In `.env` use:
  ```bash
  NEXTAUTH_URL="http://localhost:3000"
  ```

So:
- **Vercel Production**: `NEXTAUTH_URL=https://your-app.vercel.app`
- **Local**: `NEXTAUTH_URL=http://localhost:3000`

---

## Step 5: (Optional) SendGrid – `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`

1. Sign up at [sendgrid.com](https://sendgrid.com).
2. **Verify a sender (from address)**:
   - **Settings → Sender Authentication** → verify a single sender or domain.
   - Note the **from email** you verify (e.g. `noreply@yourdomain.com`). This is `SENDGRID_FROM_EMAIL`.
3. **Create an API key**:
   - **Settings → API Keys → Create API Key**.
   - Name it (e.g. `WheelTracker production`).
   - Choose **Restricted Access**; enable **Mail Send → Full Access** (or minimal needed).
   - Create and **copy the key** (shown only once).
4. In Vercel **Environment Variables** add:
   - **Name**: `SENDGRID_API_KEY`  
     **Value**: `SG.xxxx...` (the key you copied)
   - **Name**: `SENDGRID_FROM_EMAIL`  
     **Value**: the verified sender email, e.g. `noreply@yourdomain.com`
5. Add the same two to your local `.env` if you want to test emails locally.

Without these, the app still runs; daily digest and instant emails will be skipped (your code already handles missing SendGrid).

---

## Step 6: (Optional) `CRON_SECRET` for Daily Digest

Vercel Cron calls your app’s cron endpoint. To avoid unauthorized calls:

1. Generate another secret, e.g.:
   ```bash
   openssl rand -base64 24
   ```
2. In Vercel **Environment Variables** add:
   - **Name**: `CRON_SECRET`
   - **Value**: the generated string
3. In **Vercel Dashboard → Project → Settings → Cron Jobs** (or the **Crons** tab), you may need to add a cron that calls your endpoint with this secret in the `Authorization` header:
   - **Path**: `/api/cron/daily-digest`
   - **Schedule**: e.g. `0 20 * * *` (20:30 UTC = 4:30 PM ET, depending on your cron syntax; adjust to match `vercel.json`).

Your `vercel.json` already defines the schedule; Vercel will inject the request. Your route checks `Authorization: Bearer <CRON_SECRET>`. So you only need to set `CRON_SECRET` in Vercel (and optionally in local `.env` if you hit the cron route locally).

**Local `.env` (optional):**
```bash
CRON_SECRET="your-cron-secret"
```

---

## Step 7: Apply Database Schema on Vercel (First Deploy)

After `DATABASE_URL` (and optionally other vars) are set:

1. **Option A – Migrate from your machine (recommended once)**  
   In your local repo, ensure `.env` has the **same** `DATABASE_URL` as Vercel (paste from Step 2). Then run:
   ```bash
   npx prisma migrate deploy
   ```
   Or, if you’re not using migrations yet:
   ```bash
   npx prisma db push
   ```
2. **Option B – Migrate in Vercel build**  
   Your `package.json` already has:
   ```json
   "build": "npx prisma generate && next build"
   ```
   So Prisma client is generated. To run migrations in the build, you could change to:
   ```json
   "build": "npx prisma generate && npx prisma migrate deploy && next build"
   ```
   Only do this if you’re using `prisma migrate` and want migrations to run on every deploy.

3. **Seed (one-time)**  
   To seed production (demo user, etc.), run locally with production `DATABASE_URL` in `.env`:
   ```bash
   npm run db:seed
   ```
   Or use Vercel’s run script / one-off job if you have that set up.

---

## Step 8: Redeploy and Verify

1. In Vercel, go to **Deployments**.
2. Click the **⋯** on the latest deployment → **Redeploy** (or push a new commit).
3. After deploy, open your app URL and test:
   - Register / login
   - Create an account, add a trade, open Wealth Wheel, etc.
4. Check **Functions** and **Logs** for any runtime errors.

---

## Quick Checklist: Variables for `.env` / Vercel

| Variable            | Where to get it                          | Required |
|---------------------|------------------------------------------|----------|
| `DATABASE_URL`      | Vercel Storage → Postgres → Connect/Quickstart tab (use `POSTGRES_URL` value) | Yes      |
| `NEXTAUTH_SECRET`   | `openssl rand -base64 32`                | Yes      |
| `NEXTAUTH_URL`      | Production: `https://your-app.vercel.app`; local: `http://localhost:3000` | Yes      |
| `SENDGRID_API_KEY`  | SendGrid → Settings → API Keys          | No       |
| `SENDGRID_FROM_EMAIL` | SendGrid verified sender                | No       |
| `CRON_SECRET`       | `openssl rand -base64 24`                | No (recommended for cron) |

---

## Example Local `.env` (after setup)

```bash
# From Vercel Postgres (Step 2)
DATABASE_URL="postgresql://default:xxxxx@ep-xxx.us-east-1.postgres.vercel-storage.com:5432/verceldb?sslmode=require"

# From Step 3
NEXTAUTH_SECRET="your-32-byte-base64-secret"
NEXTAUTH_URL="http://localhost:3000"

# Optional – from Step 5
SENDGRID_API_KEY="SG.xxxx"
SENDGRID_FROM_EMAIL="noreply@yourdomain.com"

# Optional – from Step 6
CRON_SECRET="your-cron-secret"
```

Use the **same** `DATABASE_URL` and `NEXTAUTH_SECRET` in Vercel (with `NEXTAUTH_URL` set to your production URL) so behavior is consistent between local and production.
