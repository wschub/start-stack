# start-stack

Scaffold a production-ready backend: pick an architecture, answer a few questions and get a tested
project, with the database running and your super administrator created.

```bash
npx start-stack create my-api
# or
npm create start-stack my-api
```

No global install is needed. If you prefer a short command: `npm i -g start-stack`, then
`start-stack create my-api`.

## What you get

A Node.js + TypeScript API (Express, Prisma, PostgreSQL) with health checks, e-mail and password sign-in,
rotating refresh tokens, password recovery, dynamic roles and permissions, translated errors (es/en), rate
limits, Docker, CI, Dependabot and a test suite (unit, acceptance and integration) that passes out of the
box. Each project includes a step-by-step guide to add your first entity.

| Architecture | Organisation                                                                             |
| ------------ | ---------------------------------------------------------------------------------------- |
| `hexagonal`  | ports and adapters, organised by modules                                                 |
| `ddd`        | bounded contexts, aggregates, value objects, domain events                               |
| `clean`      | entities, use cases, interface adapters, frameworks (dependency rule enforced by a test) |

## Usage

```text
start-stack create <name> [options]

  --architecture <hexagonal|ddd|clean>   (default: hexagonal)
  --no-docker       leave out the Dockerfile and the API container
  --no-git          do not initialise a git repository
  --no-install      do not install dependencies
  --no-database     do not start Postgres or create the super administrator
  -y, --yes         no questions: use the defaults for what is not given
  --dry-run         list what would be created and write nothing
```

Without options it asks for everything. Choices that do not exist yet (microservices, other languages,
patterns, frontends…) are shown as "coming soon" and cannot be selected.

After generating, the CLI can: initialise git (first commit before installing, so no hooks run), install
the dependencies, start Postgres with Docker, apply the migrations and create the super administrator
(the password is passed to the project through the environment, never as an argument).

## Adding a module

From the root of a generated project:

```text
start-stack add module <name> [options]

  --entity <name>        singular name of the entity (default: the module name)
  --path <name>          HTTP path of the module (default: the module name); permissions keep the module name
  --field <name:type>    a field, repeatable; types: string, int, boolean, datetime
                         (default: name:string)
  --migrate              also create the Prisma migration (needs the database up)
  --dry-run              list what would change and write nothing
```

It generates a complete, tested slice (entity or aggregate, create and list, permissions
`<name>:read` and `<name>:manage`, schema, controller, routes, Prisma model and repository, error
messages, and unit and acceptance tests) in the layout of the project's architecture: a module in
`hexagonal`, a new bounded context in `ddd`, and one piece per layer in `clean`.

It wires the result in by inserting code above the `// start-stack:<name>` comments in
`src/composition.ts`, the messages catalogue and `prisma/schema.prisma`. If a marker is missing, or any
file would be overwritten, it stops before writing anything. It then formats the new code and the Prisma
schema and regenerates the client; without `--migrate` it prints the migration command instead of
running it. The module name is added to `modules` (`contexts` in DDD) in `.scaffold.json`.

## Patterns

`start-stack create --pattern outbox` (or the "Patterns" step of the wizard) and `start-stack add pattern outbox
[--migrate] [--dry-run]` apply a pattern: new files, its migration (already written, so no `prisma migrate dev`),
and insertions above the `// start-stack:*` markers, including `src/main.ts`, `src/config/env.ts` and
`.env.example`. The same code serves both paths. `outbox` stores messages in the same transaction as the change
and a worker delivers them later (at-least-once, with backoff; exhausted messages stay in the table). It is a
`messaging` module in hexagonal, `platform/messaging` in DDD and `use-cases/messaging` plus `frameworks/` in
Clean. See `INSTRUCCIONES.md` for how to enqueue and subscribe.

## Checking a project

`start-stack doctor` writes nothing. It reports (exit code 1 on errors) missing or repeated markers, modules
listed in `.scaffold.json` without a folder, added modules that are not in the Prisma schema or not wired in
`src/composition.ts`, and, as warnings, folders missing from the manifest and tables without a migration. It also checks that every
pattern listed in the manifest is still wired.

## Where the templates come from

Each architecture is a reference project in this repository (`hex-mockup`, `ddd-mockup`, `clean-mockup`)
with its own test suite. The CLI copies the files that git tracks in that project and changes only what has
to change: the name, the database name, user and port (the first free port from 55432), the git hooks and
the manifest. A test checks that generating with a mockup's own values gives back exactly that mockup,
except for those known differences.

## Development

```bash
npm install
npm run verify        # lint, format, types and unit tests
npm run test:e2e      # generates the three architectures and runs their own `verify` (needs Docker)
npm run sync-templates && npm run build   # what `npm pack` does (prepack)
```

In the repository the templates are read straight from the mockups; the published package carries a copy
in `templates/`.

## Not yet

`add` only supports `module` (create and list; no read-by-id, update or delete, and in DDD no `--context` to extend an existing context). Publishing to npm is pending.
