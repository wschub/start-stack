# hex-mockup

> 🇪🇸 [Versión en español](README.md)

Backend API in Node.js + TypeScript with a **hexagonal architecture**, organised by modules and built with
TDD. It ships what almost every project needs before its first feature: service health, sign-up and
sign-in, sessions with rotating refresh tokens, password recovery, dynamic roles and permissions,
translated errors, rate limits, Docker and CI.

The layers and their rules are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (in Spanish). To
create your first module and its table, follow [docs/ADDING-A-MODULE.md](docs/ADDING-A-MODULE.md) (in
Spanish): the whole path with code, from the business rule to the HTTP route.

## Stack

| Piece    | Choice                                                                    |
| -------- | ------------------------------------------------------------------------- |
| Runtime  | Node.js 24 (LTS), ESM                                                     |
| Language | TypeScript 6 in `strict` mode                                             |
| HTTP     | Express 5, Zod for input validation                                       |
| Database | PostgreSQL 17 with Prisma 7                                               |
| Security | Argon2id, JWT (HS256) with `jose`, `helmet`, `cors`, `express-rate-limit` |
| Logging  | `pino` with request id and redacted sensitive data                        |
| Testing  | Vitest, Supertest and Testcontainers                                      |
| Quality  | ESLint, Prettier, husky                                                   |

## Requirements

- Node.js 24 or later (`nvm use` reads `.nvmrc`).
- Docker, for the local database and the integration tests.

## Getting started

```bash
npm install
cp .env.example .env          # and change JWT_ACCESS_SECRET: openssl rand -base64 48
docker compose up -d          # Postgres on 127.0.0.1:55432
npm run db:generate           # Prisma client
npm run db:migrate            # creates the tables and the SUPER_ADMIN role
npm run admin:create          # creates the first super administrator
npm run dev                   # API on http://localhost:3000
```

Check that it responds:

```bash
curl http://localhost:3000/health/ready
```

## Scripts

| Script                                                   | What it does                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                                            | Server with automatic reload                                    |
| `npm run build` / `npm start`                            | Compiles to `dist/` and runs the compiled server                |
| `npm run verify`                                         | Lint, format, types and **all** tests (needs Docker)            |
| `npm test`                                               | All tests                                                       |
| `npm run test:unit` / `test:acceptance`                  | Fast tests, no external dependencies                            |
| `npm run test:integration`                               | Tests against a real Postgres (needs Docker)                    |
| `npm run lint` / `format` / `format:check` / `typecheck` | Code quality                                                    |
| `npm run db:generate`                                    | Generates the Prisma client                                     |
| `npm run db:migrate`                                     | Applies pending migrations                                      |
| `npm run admin:create`                                   | Creates a super administrator (production: `admin:create:prod`) |

## Environment variables

They are validated at startup (`src/config/env.ts`); if one is missing or invalid, the server refuses to
start and names it. `.env.example` documents all of them and a test checks that it never drifts.

| Variable                         | Values                                                          | Default                                |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------------- |
| `NODE_ENV`                       | `development`, `test`, `production`                             | `development`                          |
| `PORT`                           | 1–65535                                                         | `3000`                                 |
| `DATABASE_URL`                   | PostgreSQL URL                                                  | **required**                           |
| `LOG_LEVEL`                      | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`    | `info`                                 |
| `JWT_ACCESS_SECRET`              | At least 32 characters; the example value is rejected           | **required**                           |
| `JWT_ISSUER` / `JWT_AUDIENCE`    | Text                                                            | the project name and `<name>-api`      |
| `ACCESS_TOKEN_EXPIRATION_TIME`   | Duration: `30s`, `50m`, `1h`, `7d` (24 h at most)               | `60m`                                  |
| `REFRESH_TOKEN_EXPIRATION_TIME`  | Duration (90 d at most; longer than the access token's)         | `7d`                                   |
| `PASSWORD_RESET_EXPIRATION_TIME` | Lifetime of the recovery link (24 h at most)                    | `30m`                                  |
| `PASSWORD_RESET_URL`             | Front-end page that receives the token (`?token=…`)             | `http://localhost:5173/reset-password` |
| `PUBLIC_REGISTRATION`            | `true`, `false`                                                 | `true`                                 |
| `COOKIE_SAME_SITE`               | `strict`, `lax`, `none` (`none` requires `NODE_ENV=production`) | `strict`                               |
| `CORS_ORIGINS`                   | Exact origins separated by commas, no trailing `/` and no `*`   | empty (CORS disabled)                  |
| `TRUST_PROXY`                    | 0–10: trusted proxies in front of the API                       | `0`                                    |

## Endpoints

### Health

| Method and path     | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `GET /health`       | Liveness: the process is alive. Does not check dependencies |
| `GET /health/ready` | Readiness: 200 or 503 depending on the database             |

### Authentication

| Method and path              | Description                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `POST /auth/register`        | Creates an account. Only exists when `PUBLIC_REGISTRATION=true`                                     |
| `POST /auth/login`           | Returns the access token and sets the refresh token in an `HttpOnly` cookie                         |
| `GET /auth/me`               | Profile of the authenticated user, with roles and permissions                                       |
| `POST /auth/refresh`         | Rotates the refresh token. Needs the cookie, an allowed `Origin` and the `X-CSRF-Protection` header |
| `POST /auth/logout`          | Ends the session (204, idempotent). Same protections as `refresh`                                   |
| `POST /auth/password/forgot` | Requests a password reset. Always responds 202                                                      |
| `POST /auth/password/reset`  | Changes the password with the link token or with the code                                           |

Protected routes expect `Authorization: Bearer <accessToken>`.

### Roles and permissions

| Method and path        | Permission     | Description                                            |
| ---------------------- | -------------- | ------------------------------------------------------ |
| `GET /permissions`     | `roles:read`   | Permission catalogue grouped by module                 |
| `GET /roles`           | `roles:read`   | List of roles                                          |
| `POST /roles`          | `roles:manage` | Creates a role: `{ name, description?, permissions? }` |
| `GET /roles/:id`       | `roles:read`   | Role details                                           |
| `PATCH /roles/:id`     | `roles:manage` | Edits name, description or permissions                 |
| `DELETE /roles/:id`    | `roles:manage` | Deletes the role and removes it from its users         |
| `GET /users/:id/roles` | `roles:read`   | Roles and permissions of a user                        |
| `PUT /users/:id/roles` | `roles:assign` | Replaces a user's roles: `{ roleIds: [] }`             |

### Users

| Method and path           | Permission     | Description                                                    |
| ------------------------- | -------------- | -------------------------------------------------------------- |
| `GET /users`              | `users:read`   | Paginated list: `?page=1&pageSize=20&search=text`              |
| `GET /users/:id`          | `users:read`   | User details                                                   |
| `PATCH /users/:id/status` | `users:update` | Activates or deactivates: `{ status: "ACTIVE" \| "INACTIVE" }` |

## Sessions

- The **access token** is a short-lived JWT sent in the `Authorization` header.
- The **refresh token** is opaque, lives in an `HttpOnly` cookie with `Path=/auth`, and only its hash is
  stored. Every use **rotates** it; reusing an already consumed token ends the whole session.
- Because the cookie is sent automatically, `refresh` and `logout` also require an `Origin` listed in
  `CORS_ORIGINS` and the `X-CSRF-Protection` header. The front end must run one refresh at a time.

## Password recovery

`POST /auth/password/forgot` accepts `{ "email": "…", "method": "link" | "code" }` (`link` by default):

- **`link`:** generates a long single-use token, valid for 30 minutes. The front end receives it at
  `PASSWORD_RESET_URL?token=…` and calls `POST /auth/password/reset` with `{ token, password }`.
- **`code`:** generates a 6-digit code, valid for 10 minutes with 5 attempts. The front end calls
  `POST /auth/password/reset` with `{ email, code, password }`.

In both cases the `forgot` response is the same whether or not the account exists, only the hash of the
secret is stored, a new request invalidates the previous one and, once the password changes, all of the
user's sessions are closed.

> **Email delivery is not included.** The default adapter (`LogPasswordResetNotifier`) writes the link or
> the code to the log; in production it only warns that a provider is missing, without revealing the
> secret. Before going live, implement the `PasswordResetNotifier` port with your provider (SMTP, Resend,
> SES…) and wire it in `src/composition.ts`.

## Roles and permissions

- Each module declares its **permissions** in code (`application/permissions.ts`), shaped as
  `resource:action`. `GET /permissions` returns them grouped by module, with a label in es/en.
- **Roles** are created through the API and stored in the database. A user can have several, and their
  permissions are the union of all of them.
- **`SUPER_ADMIN`** is the only fixed role: the migration creates it, it has every permission (including
  those of future modules) and it cannot be edited or deleted.
- Permissions are checked on every request: a role change applies immediately, without waiting for the
  token to expire. A newly registered user has no roles.
- Safeguards: only a super administrator grants or removes `SUPER_ADMIN` or changes the status of another
  super administrator; nobody can deactivate themselves; at least one always remains active.

The first super administrator is created from the terminal, because without one nobody could assign roles:

```bash
npm run admin:create                      # asks for email, name and password
npm run admin:create -- --email ana@example.com --first-name Ana --last-name Gómez
```

If the account already exists it is only granted the role and its password is left untouched. Without an
interactive terminal (CI, containers) the password is read from the `ADMIN_PASSWORD` variable.

## Errors

Every error is `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Forbidden",
  "status": 403,
  "code": "PERMISSION_DENIED",
  "detail": "You do not have the permission required for this action."
}
```

- `code` is **stable**: it is what the front end should branch on.
- `detail` is translated to Spanish or English according to `Accept-Language`.
- Validation errors add `errors: [{ field, code }]`.
- Statuses: 400 validation, 401 unauthenticated, 403 forbidden, 404, 409 conflict, 413 payload too large,
  429 too many attempts (with `Retry-After`), 503 database unavailable. Any other failure is a generic 500
  that never leaks internal details.

## Security

- Passwords hashed with Argon2id; 12 characters minimum.
- Strict request bodies: an unknown field is a 400.
- In-memory rate limits: login 20/15 min per IP and 5/15 min per account (failures only), sign-up 10/h,
  refresh 60/15 min, recovery 10/h per IP and 3/h per account. Several instances need a shared store.
- JSON API headers: CSP `default-src 'none'`, `X-Frame-Options: DENY`, `Cache-Control: no-store`.
- CORS disabled except for the origins in `CORS_ORIGINS`.
- Behind a proxy or load balancer, set `TRUST_PROXY` so the limits use the real client IP.
- The internal database `id` is never exposed: `publicId` (UUID) is used externally.

## Testing

| Level       | Command                    | What it covers                                                       |
| ----------- | -------------------------- | -------------------------------------------------------------------- |
| Unit        | `npm run test:unit`        | Domain, use cases, configuration and the architecture rules          |
| Acceptance  | `npm run test:acceptance`  | The whole HTTP contract with in-memory doubles                       |
| Integration | `npm run test:integration` | Real adapters against Postgres (Testcontainers) and end-to-end flows |

Two tests watch things that tend to break silently: `tests/unit/architecture/layers.test.ts` fails when an
import breaks the layer rules, and `tests/unit/config/env-example.test.ts` fails when `.env.example` stops
matching the variables the code validates.

## Docker

```bash
docker compose up -d                                       # Postgres only (development)
API_PORT=3100 docker compose --profile app up -d --build   # Postgres + migrations + API
docker compose --profile app rm -sf api migrate            # stops and removes the API and the migration
```

- The `Dockerfile` is multi-stage; the final image holds production dependencies only and runs as the
  `node` user, with a `HEALTHCHECK`.
- Migrations are a separate step (the `migrate` service): the API never migrates at startup.
- Creating the super administrator inside the container:

```bash
docker compose --profile app run --rm -e ADMIN_PASSWORD api \
  node dist/cli/create-admin.js --email ana@example.com --first-name Ana --last-name Gómez
```

## Deploying without Docker

For platforms that build from the repository (Railway, Render and the like):

| Step             | Value                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Install          | `npm ci`                                                                                         |
| Build            | `npm run db:generate && npm run build`                                                           |
| Before deploying | `npm run db:migrate`                                                                             |
| Start            | `npm start`                                                                                      |
| Variables to set | `NODE_ENV=production`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `CORS_ORIGINS`, `PASSWORD_RESET_URL` |
| Behind a proxy   | `TRUST_PROXY=1`                                                                                  |

> The Prisma CLI (`prisma`) is a development dependency. If your platform prunes `devDependencies` before
> running `npm run db:migrate`, move it to `dependencies` or configure the platform to keep them for that
> step.

With `NODE_ENV=production` the refresh token cookie is `Secure`: the API must be served over HTTPS.

## Hooks and CI

- **pre-commit:** lint, format, types, unit and acceptance tests.
- **pre-push:** acceptance and integration tests (needs Docker).
- **GitHub Actions** (`.github/workflows/ci.yml`): quality and fast tests, integration, and a build with a
  dependency audit and a smoke test of the Docker image.
- **Dependabot** (`.github/dependabot.yml`): weekly updates for npm, GitHub Actions and Docker.

---

Generated with start-stack.
