# start-stack

[Español](README.es.md)

Scaffold a production-ready Node.js + TypeScript backend: pick an architecture, answer a few questions and
get a tested project (Express, Prisma, PostgreSQL) with authentication, roles and permissions, Docker, CI and
a passing test suite.

```bash
npx start-stack create my-api
# or
npm create start-stack my-api
```

> **Status:** v0.1, work in progress. Not published to npm yet: see [INSTRUCCIONES.md](INSTRUCCIONES.md) to
> run it from this repository.

## Architectures

| Architecture | Organisation                                                                   |
| ------------ | ------------------------------------------------------------------------------ |
| `hexagonal`  | ports and adapters, organised by modules                                       |
| `ddd`        | bounded contexts, aggregates, value objects, domain events                     |
| `clean`      | entities, use cases, interface adapters, frameworks (dependency rule enforced) |

Every architecture exposes the same HTTP contract, so you can compare them side by side.

## Commands

- `start-stack create <name>`: generate a project (interactive wizard or flags).
- `start-stack add module <name>`: add a complete, tested slice (entity, use cases, routes, permissions,
  Prisma model, tests) in the layout of your architecture.
- `start-stack add pattern outbox`: add the transactional outbox pattern.
- `start-stack doctor`: read-only check that the manifest and the code agree.

The full reference is in [`cli/README.md`](cli/README.md).

## Repository layout

| Folder                | What it is                                                |
| --------------------- | --------------------------------------------------------- |
| `cli/`                | the `start-stack` command                                 |
| `create-start-stack/` | thin wrapper so `npm create start-stack` works            |
| `hex-mockup/`         | reference project, hexagonal: the template the CLI copies |
| `ddd-mockup/`         | reference project, DDD                                    |
| `clean-mockup/`       | reference project, Clean Architecture                     |

The reference projects are complete, tested applications. The CLI generates from them, and a "golden"
test checks that what it generates matches them.

## Contributing

Each folder is its own npm project; run `npm run verify` inside it (Docker is needed for the integration
tests). Commits are in Spanish with the style `feat(scope): ...`. Git hooks live in `.githooks/`.

## License

[MIT](LICENSE)
