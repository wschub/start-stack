# hex-mockup

> 🇬🇧 [English version](README.en.md)

API backend en Node.js + TypeScript con **arquitectura hexagonal**, organizada por módulos y construida con
TDD. Trae resuelto lo que casi todo proyecto necesita antes de escribir su primera funcionalidad: salud del
servicio, registro e inicio de sesión, sesiones con refresh rotativo, recuperación de contraseña, roles y
permisos dinámicos, errores traducidos, límites de intentos, Docker y CI.

Las capas y sus reglas están en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Para crear tu primer módulo
con su tabla, sigue [docs/ADDING-A-MODULE.md](docs/ADDING-A-MODULE.md): el recorrido completo con código, de
la regla de negocio a la ruta HTTP.

## Stack

| Pieza         | Elección                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| Runtime       | Node.js 24 (LTS), ESM                                                    |
| Lenguaje      | TypeScript 6 en modo `strict`                                            |
| HTTP          | Express 5, Zod para validar la entrada                                   |
| Base de datos | PostgreSQL 17 con Prisma 7                                               |
| Seguridad     | Argon2id, JWT (HS256) con `jose`, `helmet`, `cors`, `express-rate-limit` |
| Logs          | `pino` con id de petición y datos sensibles ocultos                      |
| Pruebas       | Vitest, Supertest y Testcontainers                                       |
| Calidad       | ESLint, Prettier, husky                                                  |

## Requisitos

- Node.js 24 o superior (`nvm use` lee `.nvmrc`).
- Docker, para la base de datos local y para las pruebas de integración.

## Puesta en marcha

```bash
npm install
cp .env.example .env          # y cambia JWT_ACCESS_SECRET: openssl rand -base64 48
docker compose up -d          # Postgres en 127.0.0.1:55432
npm run db:generate           # cliente de Prisma
npm run db:migrate            # crea las tablas y el rol SUPER_ADMIN
npm run admin:create          # crea el primer superadministrador
npm run dev                   # API en http://localhost:3000
```

Comprueba que responde:

```bash
curl http://localhost:3000/health/ready
```

## Scripts

| Script                                                   | Qué hace                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                                            | Servidor con recarga automática                                 |
| `npm run build` / `npm start`                            | Compila a `dist/` y ejecuta el servidor compilado               |
| `npm run verify`                                         | Lint, formato, tipos y **todas** las pruebas (necesita Docker)  |
| `npm test`                                               | Todas las pruebas                                               |
| `npm run test:unit` / `test:acceptance`                  | Pruebas rápidas, sin dependencias externas                      |
| `npm run test:integration`                               | Pruebas contra Postgres real (necesita Docker)                  |
| `npm run lint` / `format` / `format:check` / `typecheck` | Calidad de código                                               |
| `npm run db:generate`                                    | Genera el cliente de Prisma                                     |
| `npm run db:migrate`                                     | Aplica las migraciones pendientes                               |
| `npm run admin:create`                                   | Crea un superadministrador (en producción: `admin:create:prod`) |

## Variables de entorno

Se validan al arrancar (`src/config/env.ts`); si falta alguna o no es válida, el servidor no arranca y dice
cuál. `.env.example` las documenta todas y una prueba comprueba que no se desincronice.

| Variable                         | Valores                                                      | Por defecto                             |
| -------------------------------- | ------------------------------------------------------------ | --------------------------------------- |
| `NODE_ENV`                       | `development`, `test`, `production`                          | `development`                           |
| `PORT`                           | 1–65535                                                      | `3000`                                  |
| `DATABASE_URL`                   | URL de PostgreSQL                                            | **obligatoria**                         |
| `LOG_LEVEL`                      | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` | `info`                                  |
| `JWT_ACCESS_SECRET`              | Al menos 32 caracteres; se rechaza el valor de ejemplo       | **obligatoria**                         |
| `JWT_ISSUER` / `JWT_AUDIENCE`    | Texto                                                        | el nombre del proyecto y `<nombre>-api` |
| `ACCESS_TOKEN_EXPIRATION_TIME`   | Duración: `30s`, `50m`, `1h`, `7d` (máximo 24 h)             | `60m`                                   |
| `REFRESH_TOKEN_EXPIRATION_TIME`  | Duración (máximo 90 d; mayor que la del access token)        | `7d`                                    |
| `PASSWORD_RESET_EXPIRATION_TIME` | Vigencia del enlace de recuperación (máximo 24 h)            | `30m`                                   |
| `PASSWORD_RESET_URL`             | Página del front que recibe el token (`?token=…`)            | `http://localhost:5173/reset-password`  |
| `PUBLIC_REGISTRATION`            | `true`, `false`                                              | `true`                                  |
| `COOKIE_SAME_SITE`               | `strict`, `lax`, `none` (`none` exige `NODE_ENV=production`) | `strict`                                |
| `CORS_ORIGINS`                   | Orígenes exactos separados por comas, sin `/` final ni `*`   | vacío (CORS desactivado)                |
| `TRUST_PROXY`                    | 0–10: proxies de confianza delante de la API                 | `0`                                     |

## Endpoints

### Salud

| Método y ruta       | Descripción                                              |
| ------------------- | -------------------------------------------------------- |
| `GET /health`       | Liveness: el proceso está vivo. No consulta dependencias |
| `GET /health/ready` | Readiness: 200 o 503 según el estado de la base de datos |

### Autenticación

| Método y ruta                | Descripción                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `POST /auth/register`        | Crea una cuenta. Solo existe si `PUBLIC_REGISTRATION=true`                                      |
| `POST /auth/login`           | Devuelve el access token y deja el refresh token en una cookie `HttpOnly`                       |
| `GET /auth/me`               | Perfil del usuario autenticado, con sus roles y permisos                                        |
| `POST /auth/refresh`         | Rota el refresh token. Requiere la cookie, `Origin` permitido y la cabecera `X-CSRF-Protection` |
| `POST /auth/logout`          | Cierra la sesión (204, idempotente). Mismas protecciones que `refresh`                          |
| `POST /auth/password/forgot` | Pide recuperar la contraseña. Siempre responde 202                                              |
| `POST /auth/password/reset`  | Cambia la contraseña con el token del enlace o con el código                                    |

Las rutas protegidas esperan `Authorization: Bearer <accessToken>`.

### Roles y permisos

| Método y ruta          | Permiso        | Descripción                                          |
| ---------------------- | -------------- | ---------------------------------------------------- |
| `GET /permissions`     | `roles:read`   | Catálogo de permisos agrupado por módulo             |
| `GET /roles`           | `roles:read`   | Lista de roles                                       |
| `POST /roles`          | `roles:manage` | Crea un rol: `{ name, description?, permissions? }`  |
| `GET /roles/:id`       | `roles:read`   | Detalle de un rol                                    |
| `PATCH /roles/:id`     | `roles:manage` | Edita nombre, descripción o permisos                 |
| `DELETE /roles/:id`    | `roles:manage` | Borra el rol y lo retira de quienes lo tenían        |
| `GET /users/:id/roles` | `roles:read`   | Roles y permisos de un usuario                       |
| `PUT /users/:id/roles` | `roles:assign` | Sustituye los roles de un usuario: `{ roleIds: [] }` |

### Usuarios

| Método y ruta             | Permiso        | Descripción                                              |
| ------------------------- | -------------- | -------------------------------------------------------- |
| `GET /users`              | `users:read`   | Lista paginada: `?page=1&pageSize=20&search=texto`       |
| `GET /users/:id`          | `users:read`   | Detalle de un usuario                                    |
| `PATCH /users/:id/status` | `users:update` | Activa o desactiva: `{ status: "ACTIVE" \| "INACTIVE" }` |

## Sesiones

- El **access token** es un JWT de vida corta que viaja en la cabecera `Authorization`.
- El **refresh token** es opaco, vive en una cookie `HttpOnly` con `Path=/auth` y en la base solo se guarda
  su hash. Cada uso lo **rota**; si alguien reutiliza uno ya consumido, se cierra toda la sesión.
- Como la cookie se envía sola, `refresh` y `logout` exigen además un `Origin` de la lista `CORS_ORIGINS` y
  la cabecera `X-CSRF-Protection`. El front debe hacer una sola renovación a la vez.

## Recuperación de contraseña

`POST /auth/password/forgot` acepta `{ "email": "…", "method": "link" | "code" }` (por defecto `link`):

- **`link`:** genera un token largo de un solo uso, válido 30 minutos. El front lo recibe en
  `PASSWORD_RESET_URL?token=…` y llama a `POST /auth/password/reset` con `{ token, password }`.
- **`code`:** genera un código de 6 dígitos, válido 10 minutos y con 5 intentos. El front llama a
  `POST /auth/password/reset` con `{ email, code, password }`.

En los dos casos la respuesta de `forgot` es la misma exista o no la cuenta, solo se guarda el hash del
secreto, una solicitud nueva invalida la anterior y, al cambiar la contraseña, se cierran todas las
sesiones del usuario.

> **El envío de correo no está incluido.** El adaptador por defecto
> (`LogPasswordResetNotifier`) escribe el enlace o el código en el log; en producción solo avisa de que falta un proveedor, sin
> revelar el secreto.
> Antes de publicar, implementa el puerto `PasswordResetNotifier` con tu proveedor (SMTP, Resend, SES…) y
> conéctalo en `src/composition.ts`.

## Roles y permisos

- Cada módulo declara sus **permisos** en el código (`application/permissions.ts`), con la forma
  `recurso:acción`. `GET /permissions` los devuelve agrupados por módulo y con nombre en es/en.
- Los **roles** se crean por la API y se guardan en la base de datos. Un usuario puede tener varios y sus
  permisos son la unión de todos.
- **`SUPER_ADMIN`** es el único rol fijo: lo crea la migración, tiene todos los permisos (también los de
  módulos futuros) y no se puede editar ni borrar.
- Los permisos se comprueban en cada petición: un cambio de rol se aplica al instante, sin esperar a que
  caduque el token. Un usuario recién registrado no tiene ningún rol.
- Salvaguardas: solo un superadministrador concede o retira `SUPER_ADMIN` o cambia el estado de otro
  superadministrador; nadie puede desactivarse a sí mismo; siempre queda al menos uno activo.

El primer superadministrador se crea desde la terminal, porque sin él nadie podría asignar roles:

```bash
npm run admin:create                      # pregunta correo, nombre y contraseña
npm run admin:create -- --email ana@example.com --first-name Ana --last-name Gómez
```

Si la cuenta ya existe, solo se le concede el rol y su contraseña no cambia. Sin terminal interactiva (CI,
contenedores) la contraseña se pasa en la variable `ADMIN_PASSWORD`.

## Errores

Todos los errores son `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Forbidden",
  "status": 403,
  "code": "PERMISSION_DENIED",
  "detail": "No tienes el permiso necesario para esta acción."
}
```

- `code` es **estable**: es lo que el front debe usar para decidir qué hacer.
- `detail` se traduce a español o inglés según `Accept-Language`.
- Los errores de validación añaden `errors: [{ field, code }]`.
- Estados: 400 validación, 401 sin autenticar, 403 sin permiso, 404, 409 conflicto, 413 cuerpo demasiado
  grande, 429 demasiados intentos (con `Retry-After`), 503 base de datos no disponible. Cualquier otro
  fallo es un 500 genérico que nunca revela detalles internos.

## Seguridad

- Contraseñas con Argon2id; mínimo 12 caracteres.
- Cuerpos de petición estrictos: un campo desconocido es un 400.
- Límites de intentos en memoria: login 20/15 min por IP y 5/15 min por cuenta (solo fallos), registro
  10/h, renovación 60/15 min, recuperación 10/h por IP y 3/h por cuenta. Con varias instancias hace falta
  un almacén compartido.
- Cabeceras de API JSON: CSP `default-src 'none'`, `X-Frame-Options: DENY`, `Cache-Control: no-store`.
- CORS desactivado salvo para los orígenes de `CORS_ORIGINS`.
- Detrás de un proxy o balanceador, define `TRUST_PROXY` para que los límites usen la IP real del cliente.
- El `id` interno de la base nunca se expone: hacia fuera se usa `publicId` (UUID).

## Pruebas

| Nivel       | Comando                    | Qué cubre                                                              |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| Unitarias   | `npm run test:unit`        | Dominio, casos de uso, configuración y las reglas de arquitectura      |
| Aceptación  | `npm run test:acceptance`  | El contrato HTTP completo con dobles en memoria                        |
| Integración | `npm run test:integration` | Adaptadores reales contra Postgres (Testcontainers) y flujos completos |

Dos pruebas vigilan cosas que suelen romperse en silencio: `tests/unit/architecture/layers.test.ts` falla
si un import incumple las reglas de capas, y `tests/unit/config/env-example.test.ts` falla si
`.env.example` deja de coincidir con las variables que valida el código.

## Docker

```bash
docker compose up -d                                   # solo Postgres (desarrollo)
API_PORT=3100 docker compose --profile app up -d --build   # Postgres + migraciones + API
docker compose --profile app rm -sf api migrate        # detiene y borra la API y la migración
```

- El `Dockerfile` es multi-stage; la imagen final lleva solo las dependencias de producción y corre con el
  usuario `node`, con `HEALTHCHECK`.
- Las migraciones son un paso aparte (servicio `migrate`): la API nunca migra al arrancar.
- Crear el superadministrador en el contenedor:

```bash
docker compose --profile app run --rm -e ADMIN_PASSWORD api \
  node dist/cli/create-admin.js --email ana@example.com --first-name Ana --last-name Gómez
```

## Despliegue sin Docker

Para plataformas que construyen desde el repositorio (Railway, Render y similares):

| Paso                | Valor                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Instalación         | `npm ci`                                                                                         |
| Compilación         | `npm run db:generate && npm run build`                                                           |
| Antes de desplegar  | `npm run db:migrate`                                                                             |
| Arranque            | `npm start`                                                                                      |
| Variables a definir | `NODE_ENV=production`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `CORS_ORIGINS`, `PASSWORD_RESET_URL` |
| Detrás de un proxy  | `TRUST_PROXY=1`                                                                                  |

> La CLI de Prisma (`prisma`) es una dependencia de desarrollo. Si tu plataforma elimina las
> `devDependencies` antes de ejecutar `npm run db:migrate`, muévela a `dependencies` o configura la
> plataforma para conservarlas en ese paso.

Con `NODE_ENV=production` la cookie del refresh token es `Secure`: la API debe servirse por HTTPS.

## Hooks y CI

- **pre-commit:** lint, formato, tipos, pruebas unitarias y de aceptación.
- **pre-push:** pruebas de aceptación e integración (necesita Docker).
- **GitHub Actions** (`.github/workflows/ci.yml`): calidad y pruebas rápidas, integración, y compilación con
  auditoría de dependencias y una prueba de humo de la imagen Docker.
- **Dependabot** (`.github/dependabot.yml`): actualizaciones semanales de npm, GitHub Actions y Docker.

---

Generado con start-stack.
