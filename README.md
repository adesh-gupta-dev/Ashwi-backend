# Ashwi backend

The Ashwi API is an Express service backed by PostgreSQL. It handles account authentication, email verification, Google/GitHub OAuth, profession-aware AI chat, conversation history, subscriptions, and administrative operations.

## Architecture

```mermaid
flowchart LR
  Client[Web and mobile clients] -->|/api| Middleware[Express middleware]
  Middleware --> Routes[Auth, chat, admin, and subscription routes]
  Routes --> Controllers[Validation and controllers]
  Controllers --> Services[Email, OAuth, Gemini, and domain services]
  Controllers --> Models[PostgreSQL models]
  Services --> Models
  Models --> DB[(PostgreSQL)]
  Services --> Gemini[Google Gemini API]
  Services --> Mail[SMTP provider]
  Services --> OAuth[Google and GitHub]
```

```mermaid
sequenceDiagram
  participant App as Web or mobile app
  participant API as Ashwi API
  participant Auth as Auth and OAuth services
  participant DB as PostgreSQL
  App->>API: Sign in or exchange OAuth code
  API->>Auth: Validate credentials/provider response
  Auth->>DB: Find or create account
  DB-->>Auth: Account record
  Auth-->>API: Session token and account
  API-->>App: Authenticated response
```

## Run locally

Requirements: Node.js, pnpm, and a running PostgreSQL instance.

```powershell
pnpm install
Copy-Item .env.example .env
# Set DATABASE_URL and AI, mail, and OAuth credentials in .env.
pnpm dev
```

The default local API origin is `http://localhost:5000`; routes are mounted under `/api`. On startup, the service checks the database connection and initializes the schema. Never commit `.env`; use `.env.example` as the safe configuration template.

## Environment configuration

- `DATABASE_URL` configures PostgreSQL. Individual `DB_*` settings are also supported.
- `JWT_SECRET` must be replaced with a long random secret. `JWT_EXPIRATION` sets the token lifetime.
- `GEMINI_API_KEY` configures AI chat; `GEMINI_MODEL` selects the Gemini model.
- `SMTP_*` settings configure verification and password-reset email.
- `CLIENT_URL`, `CORS_ORIGIN`, and `FRONTEND_PUBLIC_URL` identify the local or deployed frontend.
- Google and GitHub OAuth require provider client IDs/secrets and registered callback URLs from `.env.example`.

Keep credentials in local or deployment environment variables. Do not put secrets in source, logs, example files, or screenshots.

## Routes and checks

Main endpoint groups are `/api/auth`, `/api/chat`, `/api/admin`, and `/api/subscriptions`. Health and diagnostic endpoints are exposed by the Express app for local operations.

```powershell
pnpm build
pnpm db:check
pnpm test:database
pnpm test:oauth
```
