# Arquitectura

API backend en Node.js + TypeScript con **arquitectura hexagonal** (puertos y adaptadores), organizada como
un monolito **por módulos**. Este documento explica las capas, las reglas de dependencia que un test hace
cumplir, cómo se conecta todo y cómo añadir un módulo nuevo.

## Mapa del código

```text
src/
  main.ts            arranque: lee el entorno, levanta el servidor, programa tareas y gestiona el apagado
  composition.ts     raíz de composición: conecta adaptadores con casos de uso
  app.ts             aplicación Express: seguridad, CORS, lectura de JSON, rutas y manejo de errores
  config/env.ts      variables de entorno validadas con Zod
  shared/            piezas sin lógica de negocio que usan todos los módulos
    errors/          AppError (tipo + código estable)
    http/            Problem Details, validación de entrada, límite de intentos, CSRF, logger, servidor
    i18n/            idiomas y catálogo de mensajes (es/en)
    permissions/     definición de permisos y su catálogo (PermissionRegistry)
  modules/
    <módulo>/
      domain/          entidades, servicios de dominio e interfaces de repositorio
      application/     casos de uso y puertos hacia el exterior
      infrastructure/  adaptadores: base de datos, criptografía, servicios externos
      presentation/    HTTP: rutas, controladores, esquemas de entrada, middlewares
  generated/prisma/  cliente de Prisma (no se versiona; se crea con `npm run db:generate`)
```

Módulos actuales:

- `health`: liveness y readiness.
- `auth`: registro, login, sesión con refresh rotativo, recuperación de contraseña, roles y permisos.
- `users`: entidad `User`, su repositorio, el DTO público y la administración de usuarios.

Además, `src/cli/create-admin.ts` es un segundo punto de entrada (línea de comandos) que reutiliza
`composition.ts` para crear el primer superadministrador.

## Las capas

| Capa             | Qué contiene                                                                                                                         | Qué no puede contener                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `domain`         | Entidades con sus invariantes (`User`, `RefreshToken`), servicios de dominio (`password-policy`) e **interfaces** de repositorio     | HTTP, base de datos, librerías externas                     |
| `application`    | Casos de uso (una clase con `execute`) y **puertos**: interfaces de lo que el caso de uso necesita del exterior (`PasswordHasher`)   | Adaptadores concretos, Express, Prisma, Zod                 |
| `infrastructure` | **Adaptadores** que implementan los puertos y repositorios: `PrismaUserRepository`, `Argon2PasswordHasher`, `JoseAccessTokenService` | Rutas, controladores o cualquier cosa de `presentation`     |
| `presentation`   | Rutas, controladores, esquemas Zod de entrada, cookies y middlewares. Traduce HTTP ↔ casos de uso                                    | Adaptadores de `infrastructure` (los recibe ya construidos) |

Las dependencias apuntan siempre hacia el dominio:

```text
presentation ──► application ──► domain ◄── infrastructure (implementa puertos y repositorios)
```

## Reglas de dependencia

`tests/unit/architecture/layers.test.ts` analiza todos los imports de `src/` y falla si alguno incumple
estas reglas. La lógica está en `tests/helpers/architecture.ts` y tiene sus propias pruebas
(`check-imports.test.ts`).

| Regla | Enunciado                                                                                                                                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1    | `domain/**` solo importa de `domain/**`, `shared/**` y módulos nativos de Node (`node:*`).                                                                                                                                         |
| R2    | `application/**` importa de `domain/**`, `application/**`, `shared/**` y `node:*`; nunca de `infrastructure/**` ni de `presentation/**`.                                                                                           |
| R3    | `presentation/**` importa de `application/**`, `domain/**` y `shared/**`; nunca de `infrastructure/**`.                                                                                                                            |
| R4    | `infrastructure/**` importa de `domain/**`, `application/**` (puertos), `shared/**` y librerías externas; nunca de `presentation/**`.                                                                                              |
| R5    | `shared/**` nunca importa de `modules/**`.                                                                                                                                                                                         |
| R6    | `src/generated/**` solo lo importan `infrastructure/**` y `composition.ts`.                                                                                                                                                        |
| R7    | `domain/**` y `application/**` no importan librerías de web, base de datos, log ni criptografía: `express`, `cors`, `helmet`, `cookie-parser`, `express-rate-limit`, `@prisma/*`, `pg`, `pino*`, `jose`, `@node-rs/argon2`, `zod`. |
| —     | **Entre módulos** solo se consume el `domain` y la `application` del otro (entidades, repositorios, puertos, DTO públicos); nunca su `infrastructure` ni su `presentation`.                                                        |

Si el test falla, el mensaje indica la regla, el archivo y el import, por ejemplo:

```text
R2: src/modules/auth/application/use-cases/revoke-session.use-case.ts → ../../infrastructure/security/argon2-password-hasher.ts
```

La solución casi nunca es mover el import: es definir un puerto en `application/ports` (o una interfaz en
`domain/repositories`), implementarlo en `infrastructure` e inyectarlo desde `composition.ts`.

## Composición

`src/composition.ts` es el **único** lugar donde se crean los adaptadores y se entregan a los casos de uso y a
los routers. Nada más en el código hace `new PrismaUserRepository(...)`.

```ts
const users = new PrismaUserRepository(prisma); // adaptador (infrastructure)
const hasher = new Argon2PasswordHasher(); // adaptador (infrastructure)

const authRouter = createAuthRouter({
  registerUser: new RegisterUser({ users, hasher }), // caso de uso (application)
  // …
});
```

- Los casos de uso reciben sus dependencias por el constructor, tipadas con la **interfaz** (puerto o
  repositorio), nunca con la clase concreta.
- Los módulos no leen `process.env` ni importan `config/env.ts`: `composition.ts` les pasa los valores que
  necesitan (duraciones, secreto, orígenes permitidos).
- `app.ts` recibe los routers y las sondas ya construidos; por eso las pruebas de aceptación pueden montar la
  aplicación con dobles en memoria, sin base de datos.

## Permisos y roles

La autorización es **dinámica**: los roles viven en la base de datos y los crea el superadministrador; los
permisos los declara el código.

- **Permiso:** una clave estable `recurso:acción` (`users:read`). Cada módulo declara los suyos en
  `application/permissions.ts` con `definePermissions`, con un nombre en cada idioma.
- **Catálogo:** `composition.ts` reúne las listas de todos los módulos en un `PermissionRegistry`. Falla al
  arrancar si hay claves repetidas o mal formadas.
- **Rol:** un nombre y una lista de claves de permiso (`roles`, `role_permissions`). Un usuario puede tener
  varios roles (`user_roles`); sus permisos son la unión.
- **`SUPER_ADMIN`:** rol de sistema creado en la migración. Tiene todos los permisos del catálogo, incluidos
  los de módulos que se añadan después, y no se puede editar ni borrar.
- **Protección de rutas:** `authorize("users:read")` después de `authenticate`. Los permisos se consultan en
  cada petición (no viajan en el token), así un cambio de rol se aplica al instante. Pedir un permiso que
  no está en el catálogo falla al montar las rutas.

```ts
const read = [deps.authenticate, deps.authorize(USERS_PERMISSION.read)];
router.get("/users", read, controller.list);
```

Los middlewares `authenticate` y `authorize` pertenecen a `auth`. Los demás módulos **no los importan** (sería
usar la `presentation` de otro módulo): los reciben ya construidos desde `composition.ts`, igual que
cualquier otra dependencia. Del mismo modo, `users` no sabe de roles: expone el puerto `UserStatusGuard` y
`auth` lo implementa para proteger a los superadministradores.

## Flujo de una petición: `POST /auth/login`

1. **`app.ts`** aplica lo transversal: id de petición y log, cabeceras de seguridad, CORS y lectura del JSON
   con límite de tamaño.
2. **Ruta** (`presentation/routes/auth.routes.ts`): aplica los límites de intentos (por IP y por cuenta) y
   delega en el controlador.
3. **Controlador** (`presentation/controllers/auth.controller.ts`): valida el cuerpo con el esquema Zod
   (`parseBody(loginSchema, req.body)`) y llama a los casos de uso.
4. **Caso de uso** (`application/use-cases/authenticate-user.use-case.ts`): busca al usuario a través de
   `UserRepository` y comprueba la contraseña a través del puerto `PasswordHasher`. No sabe que existen
   Prisma ni Argon2.
5. **Adaptadores** (`infrastructure`): `PrismaUserRepository` consulta Postgres y `Argon2PasswordHasher`
   verifica el hash.
6. **Caso de uso** `IssueSession`: crea el access token (puerto `AccessTokenService`) y guarda el hash del
   refresh token (repositorio `RefreshTokenRepository`).
7. **Controlador**: pone el refresh token en una cookie `HttpOnly` y responde con el access token y el
   usuario convertido con `toPublicUser` (nunca la entidad, nunca `passwordHash`).

Si algo falla, el código lanza un `AppError` con un tipo (`unauthenticated`, `conflict`…) y un código estable
(`INVALID_CREDENTIALS`). Express 5 lleva el error al manejador de `shared/http/error-handler.ts`, que
responde `application/problem+json` con el `detail` traducido según `Accept-Language`. Cualquier error
desconocido se convierte en un 500 genérico, sin detalles internos.

## Convenciones

**Nombres de archivo** (kebab-case, con sufijo de rol):

| Pieza                   | Ejemplo                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Entidad                 | `domain/entities/user.entity.ts`                                                    |
| Interfaz de repositorio | `domain/repositories/user.repository.ts`                                            |
| Servicio de dominio     | `domain/services/password-policy.ts`                                                |
| Puerto                  | `application/ports/password-hasher.ts`                                              |
| Caso de uso             | `application/use-cases/register-user.use-case.ts`                                   |
| Adaptador               | `infrastructure/database/prisma-user.repository.ts` (prefijo = tecnología)          |
| Rutas y controlador     | `presentation/routes/auth.routes.ts`, `presentation/controllers/auth.controller.ts` |
| Esquemas de entrada     | `presentation/schemas/auth.schemas.ts`                                              |

**Código:**

- ESM con imports relativos que incluyen la extensión `.ts`.
- Sin `enum` ni _parameter properties_: campos explícitos asignados en el constructor (compatible con el
  _type stripping_ de Node).
- Los cuerpos de las peticiones se validan con esquemas Zod **estrictos**: un campo desconocido es un 400.
- Todo código de error nuevo debe tener mensaje en español y en inglés en `shared/i18n/messages.ts`; hay una
  prueba que lo comprueba.
- El `id` numérico de la base de datos nunca sale de la persistencia: hacia fuera se usa `publicId` (UUID).

## Dónde van las pruebas

| Nivel       | Carpeta              | Qué prueba                                                                                   | Dependencias      |
| ----------- | -------------------- | -------------------------------------------------------------------------------------------- | ----------------- |
| Unitarias   | `tests/unit/`        | Dominio, casos de uso (con dobles de `tests/helpers`), `shared`, configuración, arquitectura | Ninguna           |
| Aceptación  | `tests/acceptance/`  | El contrato HTTP completo con Supertest: rutas, cabeceras, errores, límites de intentos      | Dobles en memoria |
| Integración | `tests/integration/` | Los adaptadores reales contra Postgres (Testcontainers) y el flujo de punta a punta          | Docker            |

`npm run test:unit` y `npm run test:acceptance` corren en cada commit; `npm run test:integration`, en cada
push. `npm run verify` lo ejecuta todo junto con lint, formato y tipos.

## Cómo añadir un módulo a mano

Ejemplo: un módulo `products`. Trabaja de dentro hacia fuera, escribiendo primero la prueba de cada paso.

1. **Carpetas:** `src/modules/products/{domain,application,infrastructure,presentation}`.
2. **Dominio:** la entidad en `domain/entities/product.entity.ts` (con sus validaciones, lanzando `AppError`)
   y la interfaz `domain/repositories/product.repository.ts`. Pruebas en `tests/unit/modules/products/`.
3. **Aplicación:** un caso de uso por operación en `application/use-cases/`, que recibe el repositorio por el
   constructor. Si necesita algo del exterior que no sea un repositorio, define un puerto en
   `application/ports/`. Pruebas unitarias con un repositorio en memoria (`tests/helpers`).
4. **Persistencia:** añade el modelo a `prisma/schema.prisma` y ejecuta `npx prisma format`,
   `npx prisma migrate dev --name create_products` y `npm run db:generate`. Implementa
   `infrastructure/database/prisma-product.repository.ts`. Pruebas en `tests/integration/products/`.
5. **Permisos:** declara los del módulo en `application/permissions.ts`
   (`definePermissions("products", { "products:read": { es: "Ver productos", en: "View products" } })`).
6. **Presentación:** esquemas Zod estrictos en `presentation/schemas/`, el controlador y un
   `createProductsRouter(deps)` en `presentation/routes/`, que recibe `authenticate` y `authorize` y protege
   cada ruta con su permiso. Pruebas en `tests/acceptance/`.
7. **Mensajes:** añade a `shared/i18n/messages.ts` (es y en) los códigos de error nuevos.
8. **Composición:** en `composition.ts`, crea el repositorio y los casos de uso, añade el router a
   `routers` y suma `PRODUCTS_PERMISSIONS` al `PermissionRegistry`: con eso los permisos nuevos aparecen en
   `GET /permissions` y se pueden asignar a cualquier rol. Es el único archivo fuera del módulo que hay que tocar, además del esquema de Prisma y los mensajes.
9. **Verifica:** `npm run verify`. El test de arquitectura confirmará que el módulo nuevo respeta las capas.
