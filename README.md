# Trovarcis Reach

The deliverability layer for cold outreach. Six tools share one credit ledger at [trovarci.sh](https://trovarci.sh): Email Scorer, Email Verifier, Number Verifier, Domain Checker, SMTP Tester, DNS Generator.

This repository is the source for the web platform. Desktop and mobile clients are tracked separately.

## Stack

- Remix (React Router v7), SSR, file-based routing
- JavaScript (JSX), no TypeScript
- CSS Modules with tokens prefixed `--trov-*`
- PostgreSQL via [porsager/postgres](https://github.com/porsager/postgres)
- Node.js worker for bulk verification jobs
- Hetzner VPS via Coolify

No Tailwind, no icon libraries, no chart libraries, no UI component frameworks. Everything is hand-built.

## Quick start

```bash
git clone https://github.com/<your-handle>/trovarci-sh.git
cd trovarci-sh
npm install
cp .env.example .env
# Fill in .env values
npm run migrate
npm run dev
```

App runs at `http://localhost:3000`.

## Project layout

```
app/
  components/        React components (JSX only)
  routes/            File-based routes (web + API)
  styles/
    variables.css    Design tokens (--trov-*)
    global.css       Global resets and base styles
    modules/         CSS Modules mirroring components/
  lib/               Server-side integrations (Resend, Twilio, Cryptomus, ...)
  utils/             Shared helpers and server utilities
  actions/           Route action handlers
content/blog/        Markdown blog posts
migrations/          node-pg-migrate database migrations
scripts/             Ops scripts and batch verifiers
worker/              Background job processor (separate Node process)
tests/               Unit tests (signature verification, etc.)
```

## Database

Schema is managed with [node-pg-migrate](https://github.com/salsita/node-pg-migrate). Migration files use the `.cjs` extension because the project is ESM (`"type": "module"`).

```bash
npm run migrate         # apply pending migrations
npm run migrate:down    # roll back last migration
```

Production starts with an empty database. Run migrations on first deploy, then seed admin users:

```bash
node --env-file=.env scripts/promoteAdmin.mjs <email>
node --env-file=.env scripts/grantCredits.mjs <userId> <credits>
```

Local dev data does not move to production.

## Worker process

`worker/` runs as a separate Node process and handles bulk verification jobs (email and phone). Start it alongside the web app:

```bash
npm run worker
```

## Scripts

```
npm run dev          # dev server
npm run build        # production build
npm run start        # production server
npm run worker       # background job processor
npm run migrate      # apply DB migrations
```

Verify scripts live in `scripts/verifications/` and run via `node --env-file=.env scripts/verifications/verifyBatchNN.mjs`.

## Deployment

Production runs on a Hetzner VPS managed by Coolify.

1. Add a PostgreSQL resource in Coolify and copy the connection string.
2. Create a new application pointing at this repository.
3. Set environment variables from `.env.example`.
4. First deploy runs `npm install && npm run build && npm run migrate && npm run start`.
5. Add a second service for the worker (`npm run worker`).
6. Point `trovarci.sh` at the application via Coolify or a Cloudflare proxy.

## Local dev notes

Avast Web Shield intercepts TLS and breaks Node fetch with `SELF_SIGNED_CERT_IN_CHAIN`. Two fixes:

- Set `NODE_OPTIONS=--use-system-ca` in `.env` (Node 22+).
- Or pause Avast Web Shield while developing.

Production on Hetzner is not affected.

## License

All Rights Reserved. Source provided for reference and trust. Not licensed for commercial use, redistribution, or derivative works. For licensing inquiries: hello@trovarcis.com.
