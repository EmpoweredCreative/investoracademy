# WheelTracker

Professional investment tracking platform for options trading, Wealth Wheel allocation, journaling, and reinvest alerts.

## Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: Vercel Postgres via Prisma ORM v7
- **Auth**: NextAuth v5 (Auth.js) with Credentials provider
- **Email**: SendGrid for daily digest & instant notifications
- **Scheduling**: Vercel Cron for daily digest job
- **Validation**: Zod v4

## Quick Start

### 1. Clone & Install

```bash
npm install
```

### 2. Configure Environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` for local dev |
| `SENDGRID_API_KEY` | *(Optional)* SendGrid API key for emails |
| `SENDGRID_FROM_EMAIL` | *(Optional)* Sender email address |

### 3. Set Up Database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Seed demo data
npm run db:seed
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo Credentials

```
Email: demo@wheeltracker.app
Password: demo1234
```

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login & Register pages
│   ├── (app)/           # Authenticated app pages
│   │   ├── dashboard/   # Main dashboard
│   │   ├── accounts/    # Account management
│   │   │   └── [id]/
│   │   │       ├── add/stock/   # Manual stock entry
│   │   │       ├── add/option/  # Manual option entry
│   │   │       ├── wheel/       # Wealth Wheel
│   │   │       ├── journal/     # Trade journal
│   │   │       ├── research/    # Theta research
│   │   │       ├── reinvest/    # Reinvest signals
│   │   │       └── portfolio/   # Phase II placeholder
│   │   ├── import/      # CSV import with dedupe
│   │   ├── notifications/
│   │   └── settings/
│   └── api/
│       ├── auth/        # NextAuth routes
│       ├── accounts/    # Account CRUD + sub-resources
│       ├── import/      # CSV template/upload/commit
│       ├── notifications/
│       └── cron/        # Daily digest cron job
├── components/
│   ├── Sidebar.tsx      # App navigation
│   └── ui/              # Reusable UI components
├── lib/
│   ├── auth.ts          # NextAuth configuration
│   ├── db.ts            # Prisma client singleton
│   ├── validations.ts   # Zod schemas
│   ├── api-helpers.ts   # API route helpers
│   ├── services/        # Business logic
│   │   ├── policyResolver.ts
│   │   ├── instanceFinalizer.ts
│   │   ├── reinvestSignals.ts
│   │   ├── fifoLots.ts
│   │   ├── wheelCalculator.ts
│   │   ├── csvParser.ts
│   │   ├── dedupeEngine.ts
│   │   ├── importCommitter.ts
│   │   ├── manualEntry.ts
│   │   └── sendgridMailer.ts
│   └── marketdata/
│       └── provider.ts  # Phase II placeholder interfaces
└── middleware.ts         # Auth middleware
```

## Core Features (Phase I)

### Options Lifecycle
- Each contract = its own StrategyInstance
- Track STO/BTC/BTO/STC/EXPIRE/ASSIGN/EXERCISE
- Automatic NROP (Net Realized Option Profit) calculation
- Instance finalization with reinvest signal creation

### Premium Policy System
Cascading resolution: Instance Override → Underlying → Account Default → CASHFLOW

- **CASHFLOW**: Premium treated as income
- **BASIS_REDUCTION**: Premium reduces cost basis
- **REINVEST_ON_CLOSE**: Creates reinvest signal on profitable close

### FIFO Stock Lots
- Deterministic first-in-first-out lot tracking
- Automatic lot creation on BUY, consumption on SELL
- Cost basis tracking per lot

### Wealth Wheel
- 4 categories: CORE, MAD_MONEY, FREE_CAPITAL, RISK_MGMT
- Per-account wheel targets and classification
- Cost basis allocation (MVP - no live pricing)
- Strategy-aware category suggestions

### CSV Import with 3-Layer Dedupe
1. **File SHA-256**: Block identical committed files
2. **External Reference**: Unique trade IDs per account
3. **Fingerprint**: Normalized field hash (time rounded to 60s)

### Reinvest Signal System
- Auto-created from REINVEST_ON_CLOSE + profitable finalization
- Due 48 hours after finalization
- Actions: Confirm Full, Confirm Partial, Snooze, Skip
- Dashboard aggregation per account

### Trade Journal
- Link to strategy instances
- Filter by Wheel Category
- Win rate and performance metrics
- Thesis notes and outcome rating

### Research Module
- Strategy types: Covered Call, Short Put, Bull Put Spread, Bear Call Spread, Iron Condor, Short Strangle, Time Spread
- DTE, strikes, deltas, net credit, BPE, ROI/ROID tracking
- Convert research ideas to journal trades

### Email Notifications
- Daily digest via SendGrid at 16:30 local time
- Vercel Cron scheduled job
- In-app notifications always enabled

## Phase II (Planned)
- Schwab API integration for live pricing
- Portfolio Greeks (Delta, Gamma, Theta, Vega)
- Real-time position tracking
- Option chain data
- Portfolio risk snapshots

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:reset` | Reset database |

## Deployment (Vercel)

For **step-by-step instructions** to set up the project on Vercel and obtain every variable for `.env` (DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, SendGrid, CRON_SECRET), see:

**[docs/VERCEL_SETUP.md](docs/VERCEL_SETUP.md)**

Summary:
1. Connect your repo to Vercel and create a project
2. Create a Vercel Postgres database (Storage tab) and use its URL as `DATABASE_URL`
3. Generate `NEXTAUTH_SECRET` with `openssl rand -base64 32` and set `NEXTAUTH_URL` to your production URL
4. (Optional) Add SendGrid API key and from-email; (optional) set `CRON_SECRET` for the daily digest cron
5. Run migrations (e.g. `npx prisma db push` or `migrate deploy`) and redeploy
