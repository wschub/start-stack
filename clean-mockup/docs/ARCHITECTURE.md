# Arquitectura

API backend en Node.js + TypeScript con **Clean Architecture**: el código se organiza en capas concéntricas
y la **regla de dependencia** dice que el código solo puede depender de lo que tiene más adentro. Este
documento explica las capas, las reglas que un test hace cumplir, cómo se conecta todo y cómo añadir una
funcionalidad nueva.

## Mapa del código

```text
src/
  entities/              reglas de negocio que valdrían en cualquier aplicación de la empresa
    user.ts  role.ts  password-reset.ts  refresh-token.ts  locale.ts
    rules/               reglas que no pertenecen a una sola entidad (política de contraseñas, hashes)
    errors/              AppError (tipo + código estable)
  use-cases/             reglas de esta aplicación: qué se puede hacer con las entidades
    use-case.ts          puerto de entrada común: UseCase<Request, Response>
    permissions/         definición de permisos y su catálogo (PermissionRegistry)
    <funcionalidad>/     auth, users, health
      *.use-case.ts      un caso de uso por operación, con su modelo de petición y de respuesta
      ports/             puertos de salida: lo que el caso de uso necesita del exterior
  interface-adapters/    traducen entre el exterior y los casos de uso
    http/                petición y respuesta HTTP como datos planos, validación, cookies, idioma
    controllers/         leen la petición, llaman al caso de uso y devuelven la respuesta
    presenters/          dan forma a la salida: JSON de sesión, de permisos, Problem Details, mensajes
    schemas/             esquemas Zod de la entrada
  frameworks/            detalles: lo que se puede cambiar sin tocar una regla de negocio
    express/             aplicación, rutas, middlewares, límites de intentos y el adaptador `adapt`
    database/            repositorios con Prisma
    security/            Argon2 y JWT
    notifications/       envío del enlace o el código de recuperación (hoy, al log)
    scheduler.ts         tareas periódicas
  main.ts                arranque: lee el entorno, levanta el servidor y gestiona el apagado
  composition.ts         raíz de composición: crea los detalles y los conecta con los casos de uso
  config/                variables de entorno validadas con Zod
  cli/                   segundo punto de entrada: crear el primer superadministrador
  generated/prisma/      cliente de Prisma (no se versiona; se crea con `npm run db:generate`)
```

`main.ts`, `composition.ts`, `config/` y `cli/` forman la capa **main**: lo único que conoce todas las
demás. No es una carpeta porque no hace falta: están donde se esperan en cualquier proyecto de Node, y así
los scripts de `package.json` y el `Dockerfile` son los de siempre.

La primera división es **por capa** y, dentro de los casos de uso, **por funcionalidad**. Al abrir `src/`
se ve la arquitectura; al abrir `src/use-cases/` se ve lo que la aplicación hace.

## La regla de dependencia

```text
main ──► frameworks ──► interface-adapters ──► use-cases ──► entities
```

Las flechas son los `import` permitidos. Nada de dentro nombra a algo de fuera: una entidad no sabe que
existe un caso de uso, y un caso de uso no sabe que existen HTTP, Express, Prisma ni Zod.

| Capa                 | Qué contiene                                                                                        | Qué no puede contener                               |
| -------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `entities`           | Entidades con sus invariantes (`User`, `Role`), reglas compartidas (`password-policy`) y `AppError` | Cualquier librería; cualquier otra capa             |
| `use-cases`          | Casos de uso, sus modelos de petición y respuesta, y los **puertos** que necesitan                  | HTTP, base de datos, cualquier librería             |
| `interface-adapters` | Controladores, presentadores, esquemas de entrada y los tipos `HttpRequest` / `HttpResponse`        | Express, Prisma, clases concretas de casos de uso   |
| `frameworks`         | Express, Prisma, Argon2, JWT, pino: las implementaciones de los puertos y el servidor web           | Configuración (`main`); un detalle no conoce a otro |
| main                 | Arranque, composición y configuración                                                               | Reglas de negocio                                   |

### Cómo cruza el control una frontera

El flujo de una petición va de fuera hacia dentro y vuelve, pero los `import` siempre apuntan hacia dentro.
Eso se consigue con **puertos**: interfaces que declara la capa de dentro y que implementa la de fuera.

```text
            controlador ──usa──► UseCase<Request, Response>   (puerto de entrada, en use-cases/)
                                        ▲ implementa
                                 RegisterUser (caso de uso)
                                        │ usa
                                        ▼
                         UserRepository, PasswordHasher        (puertos de salida, en use-cases/*/ports)
                                        ▲ implementan
                 PrismaUserRepository, Argon2PasswordHasher    (frameworks/)
```

- **Puerto de entrada.** Todo caso de uso implementa `UseCase<Request, Response>`. Los controladores
  dependen de esa interfaz y de los modelos de petición y respuesta, nunca de la clase: por eso solo
  importan **tipos** de `use-cases/` (regla R9).
- **Puertos de salida.** Repositorios, `PasswordHasher`, `AccessTokenService`, `PasswordResetNotifier`…
  Los declara el caso de uso que los necesita y los implementa `frameworks/`.
- **Modelos de petición y respuesta.** Tipos primitivos y objetos planos (`RegisterUserInput`,
  `PublicUser`, `SessionTokens`, `RoleView`). Una entidad nunca sale de los casos de uso: `AuthenticateUser`
  devuelve `PublicUser`, no `User`.

## Controladores y presentadores

Los controladores **no conocen Express**. Reciben un `HttpRequest` (cuerpo, parámetros, cabeceras, cookies
y el usuario identificado, todo como datos planos) y devuelven un `HttpResponse` (estado, cuerpo, cabeceras
y cookies):

```ts
const login: Controller = async (request) => {
  const credentials = parseBody(loginSchema, request.body);
  const user = await deps.authenticateUser.execute(credentials);
  const session = await deps.issueSession.execute(user.publicId);

  return {
    status: 200,
    body: { ...presentSession(session), user },
    cookies: [
      refreshCookie(deps.refreshCookie, session.refreshToken, session.refreshTokenExpiresAt),
    ],
  };
};
```

- `frameworks/express/adapt.ts` es el único puente: convierte la petición de Express en `HttpRequest`,
  llama al controlador y escribe la respuesta. Cambiar de framework web es escribir otro `adapt` y otras
  rutas; controladores, presentadores y casos de uso no cambian.
- Por lo mismo, los controladores se prueban **sin servidor**: se les pasa un objeto y se compara lo que
  devuelven (`tests/unit/interface-adapters/controllers/`).
- Los **presentadores** son funciones puras que dan forma a la salida (`presentSession`,
  `presentPermissionCatalog`, `toProblem`). El caso de uso devuelve su respuesta y el controlador elige el
  presentador; no hay un "puerto de salida" de presentación, que en una API JSON solo duplicaría archivos.
- Un error que además debe cambiar la respuesta se devuelve como `HttpFailure`: así `refresh` pide
  descartar la cookie cuando la sesión se rechaza, y el error sigue su camino normal.
- La autenticación y los permisos son middlewares de Express (`frameworks/express/middlewares`), pero no
  deciden nada: llaman a los casos de uso `IdentifyUser` y `CheckPermission`.

## Reglas que comprueba un test

`tests/unit/architecture/layers.test.ts` analiza todos los imports de `src/` y falla si alguno incumple
estas reglas. La lógica está en `tests/helpers/architecture.ts` y tiene sus propias pruebas
(`check-imports.test.ts`).

| Regla | Enunciado                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| R1    | `entities/**` solo importa de `entities/**`.                                                                                                  |
| R2    | `use-cases/**` solo importa de `entities/**` y `use-cases/**`.                                                                                |
| R3    | `interface-adapters/**` importa de las capas interiores y de sí misma; nunca de `frameworks/**` ni de main.                                   |
| R4    | `frameworks/**` importa de las capas interiores y de sí misma; nunca de main. La configuración le llega por parámetros.                       |
| R5    | `entities/**` y `use-cases/**` no importan **ninguna** librería externa; solo módulos nativos de Node (`node:*`).                             |
| R6    | `interface-adapters/**` solo usa una librería externa: `zod`, para validar la entrada.                                                        |
| R7    | `src/generated/**` (cliente de Prisma) solo lo importan `frameworks/database/**` y main.                                                      |
| R8    | Los detalles no se conocen entre sí: cada carpeta de `frameworks/` (`express`, `database`, `security`…) solo importa de sí misma hacia fuera. |
| R9    | `interface-adapters/**` solo importa **tipos** de `use-cases/**` (`import type`): depende de los puertos, no de las clases.                   |

El mismo test comprueba además la **forma** del proyecto: todo el código vive en una de las cinco capas;
los archivos `.use-case.ts` están en `use-cases/<funcionalidad>/`; cada clase de caso de uso declara su
puerto de entrada; y nada en `interface-adapters/` usa `req`, `res` ni `RequestHandler`.

Si el test falla, el mensaje indica la regla, el archivo y el import, por ejemplo:

```text
R2: src/use-cases/auth/revoke-session.use-case.ts → ../../frameworks/security/argon2-password-hasher.ts
```

La solución casi nunca es mover el import: es declarar un puerto en `use-cases/<funcionalidad>/ports`,
implementarlo en `frameworks/` e inyectarlo desde `composition.ts`.

## Composición

`src/composition.ts` es el **único** lugar donde se crean los detalles y se entregan a los casos de
uso, y estos a los controladores. Nada más en el código hace `new PrismaUserRepository(...)`.

```ts
const users = new PrismaUserRepository(prisma); // detalle (frameworks)
const hasher = new Argon2PasswordHasher(); // detalle (frameworks)

const authRouter = createAuthRouter({
  registerUser: new RegisterUser({ users, hasher }), // caso de uso, visto como UseCase<…>
  authenticate, // middleware ya construido
  // …
});
```

- Los casos de uso reciben sus dependencias por el constructor, tipadas con el **puerto**, nunca con la
  clase concreta.
- Solo main lee la configuración. El resto recibe los valores que necesita (duraciones, secreto,
  orígenes permitidos) por parámetros.
- `createApp` recibe los routers y las sondas ya construidos; por eso las pruebas de aceptación montan la
  aplicación con dobles en memoria, sin base de datos.

## Permisos y roles

La autorización es **dinámica**: los roles viven en la base de datos y los crea el superadministrador; los
permisos los declara el código.

- **Permiso:** una clave estable `recurso:acción` (`users:read`). Cada funcionalidad declara los suyos en
  `use-cases/<funcionalidad>/permissions.ts` con `definePermissions`, con un nombre en cada idioma.
- **Catálogo:** `composition.ts` reúne todas las listas en un `PermissionRegistry`. Falla al arrancar si hay
  claves repetidas o mal formadas.
- **Rol:** un nombre y una lista de claves de permiso. Un usuario puede tener varios roles; sus permisos son
  la unión.
- **`SUPER_ADMIN`:** rol de sistema creado en la migración. Tiene todos los permisos del catálogo, incluidos
  los que se añadan después, y no se puede editar ni borrar.
- **Protección de rutas:** `authorize("users:read")` después de `authenticate`. Los permisos se consultan en
  cada petición (no viajan en el token), así un cambio de rol se aplica al instante. Pedir un permiso que
  no está en el catálogo falla al montar las rutas.

```ts
const read = [deps.authenticate, deps.authorize(USERS_PERMISSION.read)];
router.get("/users", read, adapt(controller.list));
```

La gestión de usuarios no sabe de roles: `ChangeUserStatus` declara el puerto `UserStatusGuard`, y `auth`
lo implementa (`ProtectSuperAdmins`) para proteger a los superadministradores.

## Flujo de una petición: `POST /auth/login`

1. **`frameworks/express/app.ts`** aplica lo transversal: id de petición y log, cabeceras de seguridad, CORS
   y lectura del JSON con límite de tamaño.
2. **Ruta** (`frameworks/express/routes/auth.routes.ts`): aplica los límites de intentos (por IP y por
   cuenta) y entrega la petición al controlador a través de `adapt`.
3. **Controlador** (`interface-adapters/controllers/auth.controller.ts`): valida el cuerpo con el esquema
   Zod y llama a los casos de uso por su puerto de entrada.
4. **Caso de uso** `AuthenticateUser`: busca al usuario a través del puerto `UserRepository` y comprueba la
   contraseña a través del puerto `PasswordHasher`. Devuelve un `PublicUser`.
5. **Detalles** (`frameworks/`): `PrismaUserRepository` consulta Postgres y `Argon2PasswordHasher` verifica
   el hash.
6. **Caso de uso** `IssueSession`: crea el access token (puerto `AccessTokenService`) y guarda el hash del
   refresh token (puerto `RefreshTokenRepository`).
7. **Controlador**: devuelve un `HttpResponse` con el JSON que arma `presentSession` y la cookie del refresh
   token. `adapt` lo escribe en la respuesta de Express.

Si algo falla, el código lanza un `AppError` con un tipo (`unauthenticated`, `conflict`…) y un código estable
(`INVALID_CREDENTIALS`). Express 5 lleva el error a `frameworks/express/error-handler.ts`, que usa el
presentador `toProblem` para responder `application/problem+json` con el `detail` traducido según
`Accept-Language`. Cualquier error desconocido se convierte en un 500 genérico, sin detalles internos.

## Convenciones

**Nombres de archivo** (kebab-case, con sufijo de rol):

| Pieza               | Ejemplo                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| Entidad             | `entities/user.ts`                                                      |
| Regla compartida    | `entities/rules/password-policy.ts`                                     |
| Caso de uso         | `use-cases/auth/register-user.use-case.ts`                              |
| Puerto de salida    | `use-cases/auth/ports/password-hasher.ts`, `…/ports/role.repository.ts` |
| Controlador         | `interface-adapters/controllers/auth.controller.ts`                     |
| Presentador         | `interface-adapters/presenters/session.presenter.ts`                    |
| Esquemas de entrada | `interface-adapters/schemas/auth.schemas.ts`                            |
| Rutas               | `frameworks/express/routes/auth.routes.ts`                              |
| Detalle             | `frameworks/database/prisma-user.repository.ts` (prefijo = tecnología)  |

**Código:**

- ESM con imports relativos que incluyen la extensión `.ts`.
- Sin `enum` ni _parameter properties_: campos explícitos asignados en el constructor (compatible con el
  _type stripping_ de Node).
- Los cuerpos de las peticiones se validan con esquemas Zod **estrictos**: un campo desconocido es un 400.
- Todo código de error nuevo debe tener mensaje en español y en inglés en
  `interface-adapters/presenters/messages.ts`; hay una prueba que lo comprueba.
- El `id` numérico de la base de datos nunca sale de la persistencia: hacia fuera se usa `publicId` (UUID).

## Dónde van las pruebas

Las pruebas unitarias siguen las mismas capas que el código.

| Nivel       | Carpeta              | Qué prueba                                                                                | Dependencias      |
| ----------- | -------------------- | ----------------------------------------------------------------------------------------- | ----------------- |
| Unitarias   | `tests/unit/`        | Entidades, casos de uso, controladores, presentadores, adaptador de Express, arquitectura | Ninguna           |
| Aceptación  | `tests/acceptance/`  | El contrato HTTP completo con Supertest: rutas, cabeceras, errores, límites de intentos   | Dobles en memoria |
| Integración | `tests/integration/` | Los detalles reales contra Postgres (Testcontainers) y el flujo de punta a punta          | Docker            |

Qué doble usar en cada capa (todos en `tests/helpers`):

- **Casos de uso:** repositorios en memoria y dobles de los demás puertos (`fakes.ts`, `role-fakes.ts`…).
- **Controladores:** `StubUseCase` en lugar de cada caso de uso y `httpRequest()` para construir la petición.
  No hace falta Express.
- **Rutas y middlewares:** Supertest sobre una aplicación montada con los casos de uso reales y
  repositorios en memoria.

`npm run test:unit` y `npm run test:acceptance` corren en cada commit; `npm run test:integration`, en cada
push. `npm run verify` lo ejecuta todo junto con lint, formato y tipos.

## Cómo añadir una funcionalidad a mano

> La guía [ADDING-A-FEATURE.md](ADDING-A-FEATURE.md) hace este mismo recorrido con el código completo de
> un ejemplo (productos), sus pruebas y el principio que protege cada paso. Esto es el resumen.

Ejemplo: `products`. Trabaja de dentro hacia fuera, escribiendo primero la prueba de cada paso.

1. **Entidad:** `src/entities/product.ts`, con sus validaciones (lanzando `AppError`). Pruebas en
   `tests/unit/entities/`.
2. **Casos de uso:** `src/use-cases/products/`, un archivo `.use-case.ts` por operación. Cada clase
   implementa `UseCase<Request, Response>` y exporta sus modelos de petición y respuesta. Lo que necesite del
   exterior lo declara como puerto en `use-cases/products/ports/` (por ejemplo `product.repository.ts`).
   Pruebas con un repositorio en memoria.
3. **Permisos:** `use-cases/products/permissions.ts`
   (`definePermissions("products", { "products:read": { es: "Ver productos", en: "View products" } })`).
4. **Adaptadores de interfaz:** esquemas Zod estrictos en `interface-adapters/schemas/`, el controlador en
   `interface-adapters/controllers/products.controller.ts` (tipado contra `UseCase<…>`) y, si la salida
   necesita forma propia, un presentador. Pruebas del controlador con `StubUseCase`.
5. **Persistencia:** añade el modelo a `prisma/schema.prisma` y ejecuta `npx prisma format`,
   `npx prisma migrate dev --name create_products` y `npm run db:generate`. Implementa el puerto en
   `frameworks/database/prisma-product.repository.ts`. Pruebas en `tests/integration/frameworks/database/`.
6. **Rutas:** `createProductsRouter(deps)` en `frameworks/express/routes/`, que recibe `authenticate` y
   `authorize`, protege cada ruta con su permiso y monta los controladores con `adapt`. Pruebas en
   `tests/acceptance/`.
7. **Mensajes:** añade a `interface-adapters/presenters/messages.ts` (es y en) los códigos de error nuevos.
8. **Composición:** en `composition.ts`, crea el repositorio y los casos de uso, añade el router a
   `routers` y suma `PRODUCTS_PERMISSIONS` al `PermissionRegistry`.
9. **Verifica:** `npm run verify`. El test de arquitectura confirmará que cada pieza está en su capa.
