# Al Fahad Group — Integrated Financial System

A bilingual (Arabic/English) multi-company financial management system built for
Al Fahad Group's seven operating companies (Al Fahad Construction, Kenzan Cleaning,
Speed Fleet, 90 Valet Parking, Kenzan Consumer Delivery, Fahad Kuwaiti Delivery,
Al Oula Transactions).

## Stack

- **Backend:** Node.js, Express, Sequelize ORM, PostgreSQL, JWT auth
- **Frontend:** React 19, Vite, Tailwind CSS, Framer Motion, react-i18next (AR/EN + RTL), Zustand, Recharts

## Architecture

Single PostgreSQL database shared across all seven companies. Every business table
carries a `company_id` column, and every API request is scoped to the active
company via the `X-Company-Id` header (validated against the logged-in user's
company access list). This keeps day-to-day data isolated per company while still
allowing group-wide reporting later if needed.

## Modules

| Module | Description |
|---|---|
| Companies | Manage the group's operating companies and which users can access each one |
| Chart of Accounts | Unlimited nested sub-accounts (parent/child tree), per company |
| Cost Centers | Nested cost center tree for departmental/project cost allocation |
| Vouchers | Receipt / Payment / Journal vouchers with multi-line debit/credit entry, draft → posted workflow |
| General Ledger | Full transaction history per account with running balance, trial balance |
| Clients / Suppliers | Contact & balance records, each linkable to a control GL account |
| Employees | Staff records, including a "is driver" flag with license details |
| Vehicles | Full vehicle data sheet (VIN, registration, insurance, ownership, odometer), document attachments, maintenance history, and driver assignment to an employee |
| Cash Control | Cash, petty cash and bank accounts, each linked to a GL account |
| Reports | Profit & Loss (date range) and Balance Sheet (as-of date), both per company |

## Local Development

### 1. Database

Requires PostgreSQL 13+.

```bash
createdb alfahad_financial
```

### 2. Backend

```bash
cd backend
cp .env.example .env      # edit DB credentials + JWT_SECRET
npm install
npm run db:sync           # creates all tables from the models
npm run db:seed           # seeds the 7 companies, a super admin, and a starter chart of accounts
npm run dev                # starts on http://localhost:5000
```

Default seeded login: `admin@alfahadgroup.com` / `ChangeMe123!` — **change this password immediately after first login.**

### 3. Frontend

```bash
cd frontend
cp .env.example .env      # VITE_API_URL, defaults to /api (proxied to the backend in dev)
npm install
npm run dev                # starts on http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:5000` (see `vite.config.js`).

## Deployment

See [DEPLOYMENT_CPANEL.md](./DEPLOYMENT_CPANEL.md) for step-by-step cPanel deployment
instructions (Node.js App Manager for the backend, static hosting for the frontend
build, PostgreSQL setup notes).

## Security notes before going live

- Change `JWT_SECRET` to a long random value in production.
- Change or delete the seeded `admin@alfahadgroup.com` account.
- Put the API behind HTTPS (cPanel AutoSSL / Let's Encrypt).
- Review CORS (`CLIENT_URL` in backend `.env`) to restrict it to your real frontend domain.
