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

`add` (modules, contexts, features) and `doctor` are not implemented. Publishing to npm is pending.
