# Arquitectura

API backend en Node.js + TypeScript con **Domain-Driven Design** (DDD): el código se organiza por
**contextos delimitados**, cada uno con su modelo de dominio (agregados, objetos de valor y eventos) y con las
cuatro capas de puertos y adaptadores alrededor. Este documento explica los bloques, las reglas de dependencia
que un test hace cumplir, cómo se conecta todo y cómo añadir un contexto nuevo.

## Mapa del código

```text
src/
  main.ts            arranque: lee el entorno, levanta el servidor, programa tareas y gestiona el apagado
  composition.ts     raíz de composición: conecta adaptadores, comandos, consultas y manejadores de eventos
  app.ts             aplicación Express: seguridad, CORS, lectura de JSON, rutas y manejo de errores
  config/env.ts      variables de entorno validadas con Zod
  shared/            núcleo compartido: piezas sin lógica de negocio que usan todos los contextos
    domain/          AggregateRoot y DomainEvent
    events/          EventBus y su implementación en memoria (InProcessEventBus)
    errors/          AppError (tipo + código estable)
    http/            Problem Details, validación de entrada, límite de intentos, CSRF, logger, servidor
    i18n/            idiomas y catálogo de mensajes (es/en)
    permissions/     definición de permisos y su catálogo (PermissionRegistry)
  contexts/          contextos delimitados: el negocio
    <contexto>/
      domain/
        aggregates/      raíces de agregado: protegen sus invariantes y anotan eventos
        entities/        entidades que no son raíz de un agregado
        value-objects/   objetos de valor: inmutables, se validan al crearse, se comparan por valor
        events/          eventos de dominio: hechos ya ocurridos, solo datos
        repositories/    interfaces de repositorio, una por agregado
        services/        reglas que no pertenecen a un solo agregado (funciones puras)
      application/
        commands/        cambian el estado: cargan agregados, les piden el cambio y los guardan
        queries/         solo leen y devuelven DTO
        event-handlers/  reacciones a los eventos de dominio
        ports/           interfaces de lo que la aplicación necesita del exterior
        dtos/            vistas públicas de los agregados
      infrastructure/    adaptadores: base de datos, criptografía, notificaciones
      presentation/      HTTP: rutas, controladores, esquemas de entrada, middlewares
  platform/          capacidades técnicas sin modelo de negocio, con las mismas cuatro capas
    health/          liveness y readiness
  generated/prisma/  cliente de Prisma (no se versiona; se crea con `npm run db:generate`)
```

Contextos actuales:

- `identity`: quién es cada persona y qué puede hacer. Cuentas, inicio de sesión, sesiones con refresh
  rotativo, recuperación de contraseña, roles y permisos.

Usuarios y roles están en el mismo contexto a propósito: los permisos se consultan en cada petición junto al
usuario, y separarlos solo añadiría llamadas entre contextos sin dar a cada parte un modelo distinto.

Además, `src/cli/create-admin.ts` es un segundo punto de entrada (línea de comandos) que reutiliza
`composition.ts` para crear el primer superadministrador.

## Los bloques del dominio

| Bloque              | Qué es                                                                                                                | Ejemplos                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Agregado            | Conjunto de objetos que cambian juntos. Su raíz es la única puerta de entrada y garantiza que nunca queda incoherente | `User`, `Role`, `PasswordResetRequest`           |
| Objeto de valor     | Un dato con reglas propias. No tiene identidad: dos con el mismo valor son el mismo. Si existe, es válido             | `Email`, `PersonName`, `PhoneNumber`, `RoleName` |
| Evento de dominio   | Algo relevante que **ya ocurrió**, nombrado en pasado. Solo lleva datos                                               | `user.registered`, `password_reset.requested`    |
| Repositorio         | Interfaz para guardar y recuperar un agregado completo. La implementa `infrastructure`                                | `UserRepository`, `RoleRepository`               |
| Servicio de dominio | Regla de negocio que afecta a más de un agregado. Funciones puras que reciben los datos ya cargados                   | `super-admin-policy`, `password-policy`          |
| Entidad             | Objeto con identidad que no necesita ser un agregado                                                                  | `RefreshToken`                                   |

Decisiones de esta base:

- **Los agregados son inmutables.** `user.deactivate()` no cambia `user`: devuelve otro `User`. Así un
  comando no puede dejar un agregado a medio modificar.
- **`create` valida, `restore` no.** `User.create(...)` construye los objetos de valor (y falla con un
  `AppError` si un dato no es válido) y anota `user.registered`. `User.restore(props)` reconstruye lo que ya
  está en la base de datos, sin validar de nuevo ni anotar eventos.
- **Los agregados se guardan como tipos primitivos.** `toProps()` devuelve el estado en `string`, `Date`…;
  los objetos de valor no salen del dominio.
- **`RefreshToken` es una entidad, no un agregado.** La rotación del token depende de una actualización
  atómica condicionada en la base de datos (`markUsed`), no de una regla que el objeto pueda proteger solo.

## Eventos de dominio

Un agregado **anota** eventos cuando cambia; no sabe quién reacciona. El repositorio los **publica** después
de guardar, y los manejadores de `application/event-handlers` **reaccionan**:

```text
ResetPassword (comando)
  └─ user.changePassword(hash)             el agregado anota user.password_changed
  └─ users.update(user)                    el repositorio guarda y publica los eventos pendientes
       └─ EventBus
            └─ revokeSessionsOnPasswordChange   el manejador cierra las sesiones del usuario
```

| Evento                     | Lo anota                       | Quién reacciona                                              |
| -------------------------- | ------------------------------ | ------------------------------------------------------------ |
| `user.registered`          | `User.create`                  | Nadie todavía (un correo de bienvenida iría aquí)            |
| `user.password_changed`    | `user.changePassword`          | `revokeSessionsOnPasswordChange`: cierra sus sesiones        |
| `user.status_changed`      | `user.activate` / `deactivate` | Nadie todavía                                                |
| `password_reset.requested` | `PasswordResetRequest.issue`   | `sendPasswordResetNotification`: envía el enlace o el código |

- `application/event-handlers/subscribe.ts` es el **único** lugar donde se ve qué reacciona a qué. Para
  reaccionar a un evento nuevo se añade una línea ahí; ni el agregado ni los comandos cambian.
- `pullEvents()` entrega los eventos **una sola vez**: guardar dos veces el mismo agregado no los repite.
- `InProcessEventBus` ejecuta los manejadores uno tras otro, en el mismo proceso y dentro de la misma
  petición. Si un manejador falla, el error llega a quien guardó el agregado, **pero el agregado ya está
  guardado**: no hay transacción que abarque el guardado y sus reacciones.
- Para un envío asíncrono o garantizado (colas, _outbox_) basta con otra implementación de `EventBus`.
  Agregados, comandos y manejadores no cambian.
- `password_reset.requested` lleva el secreto en claro porque es el único momento en que existe. No debe
  guardarse ni escribirse en logs tal cual.

## Comandos y consultas

La capa de aplicación separa lo que **cambia** el estado de lo que solo lo **lee**:

- **Comando** (`application/commands/*.command.ts`): una clase con `execute`. Carga agregados por sus
  repositorios, les pide el cambio, consulta los servicios de dominio si hace falta y guarda. No contiene
  reglas de negocio: esas viven en el dominio.
- **Consulta** (`application/queries/*.query.ts`): una clase con `execute` que lee y devuelve un DTO
  (`PublicUser`, `RoleView`, `UserAccess`). Nunca guarda nada ni publica eventos.

Los comandos devuelven el DTO del agregado que acaban de cambiar cuando la respuesta HTTP lo necesita (por
ejemplo, `CreateRole` devuelve el rol creado): evita una segunda lectura sin mezclar las dos carpetas.

Las dos leen por los mismos repositorios y de la misma base de datos. Si una consulta necesitara un modelo de
lectura propio (una vista, otra base), cambiaría solo esa consulta.

## Las capas

| Capa             | Qué contiene                                                                                              | Qué no puede contener                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `domain`         | Agregados, objetos de valor, eventos, servicios de dominio e **interfaces** de repositorio                | HTTP, base de datos, librerías externas                     |
| `application`    | Comandos, consultas, manejadores de eventos, DTO y **puertos** (`PasswordHasher`, `AccessTokenService`)   | Adaptadores concretos, Express, Prisma, Zod                 |
| `infrastructure` | **Adaptadores** que implementan puertos y repositorios: `PrismaUserRepository`, `Argon2PasswordHasher`    | Rutas, controladores o cualquier cosa de `presentation`     |
| `presentation`   | Rutas, controladores, esquemas Zod de entrada, cookies y middlewares. Traduce HTTP ↔ comandos y consultas | Adaptadores de `infrastructure` (los recibe ya construidos) |

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
| R5    | `shared/**` nunca importa de `contexts/**` ni de `platform/**`.                                                                                                                                                                    |
| R6    | `src/generated/**` solo lo importan `infrastructure/**` y `composition.ts`.                                                                                                                                                        |
| R7    | `domain/**` y `application/**` no importan librerías de web, base de datos, log ni criptografía: `express`, `cors`, `helmet`, `cookie-parser`, `express-rate-limit`, `@prisma/*`, `pg`, `pino*`, `jose`, `@node-rs/argon2`, `zod`. |
| R8    | `domain/**` y `application/**` no importan `shared/http/**`: el núcleo no conoce HTTP, aunque esté en `shared`.                                                                                                                    |
| R9    | `src/config/**` solo lo importan `main.ts`, `composition.ts` y `src/cli/**`; el resto recibe la configuración por parámetros.                                                                                                      |
| R10   | **Entre contextos** solo se importa la `application/**` del otro (comandos, consultas, DTO, puertos); nunca su `domain`, su `infrastructure` ni su `presentation`. Cada contexto guarda su modelo para sí.                         |
| R11   | `platform/**` nunca importa de `contexts/**`: lo técnico no conoce el negocio.                                                                                                                                                     |
| R12   | `domain/value-objects/**` y `domain/events/**` son las hojas del dominio: solo se importan entre sí, de `shared/**` y de `node:*`; nunca de agregados, entidades, repositorios ni servicios.                                       |

El mismo test comprueba además la **forma** de cada contexto: solo existen las cuatro capas; el dominio solo
tiene las carpetas `aggregates`, `entities`, `value-objects`, `events`, `repositories` y `services`; los
archivos de `commands/` terminan en `.command.ts` y los de `queries/` en `.query.ts`; y ninguna consulta
llama a un método que guarde o publique.

Si el test falla, el mensaje indica la regla, el archivo y el import, por ejemplo:

```text
R2: src/contexts/identity/application/commands/revoke-session.command.ts → ../../infrastructure/security/argon2-password-hasher.ts
```

La solución casi nunca es mover el import: es definir un puerto en `application/ports` (o una interfaz en
`domain/repositories`), implementarlo en `infrastructure` e inyectarlo desde `composition.ts`.

Con R10, si un contexto necesita un dato de otro, **no importa su agregado**: usa una consulta del otro
contexto (su API pública) y trabaja con el DTO, o reacciona a uno de sus eventos. Lo único que comparten
todos es `shared/`.

## Composición

`src/composition.ts` es el **único** lugar donde se crean los adaptadores y se entregan a los comandos, las
consultas, los manejadores de eventos y los routers. Nada más en el código hace
`new PrismaUserRepository(...)`.

```ts
const events = new InProcessEventBus();
const users = new PrismaUserRepository(prisma, events); // adaptador: guarda y publica eventos
const hasher = new Argon2PasswordHasher(); // adaptador

subscribeIdentityEventHandlers(events, { notifier, refreshTokens }); // quién reacciona a qué

const authRouter = createAuthRouter({
  registerUser: new RegisterUser({ users, hasher }), // comando
  // …
});
```

- Comandos y consultas reciben sus dependencias por el constructor, tipadas con la **interfaz** (puerto o
  repositorio), nunca con la clase concreta.
- Los contextos no leen `process.env` ni importan `config/env.ts`: `composition.ts` les pasa los valores que
  necesitan (duraciones, secreto, orígenes permitidos).
- `app.ts` recibe los routers y las sondas ya construidos; por eso las pruebas de aceptación pueden montar la
  aplicación con dobles en memoria, sin base de datos.

## Permisos y roles

La autorización es **dinámica**: los roles viven en la base de datos y los crea el superadministrador; los
permisos los declara el código.

- **Permiso:** una clave estable `recurso:acción` (`users:read`). Cada contexto declara los suyos en su capa
  de aplicación con `definePermissions`, con un nombre en cada idioma (`identity` lo hace en
  `auth-permissions.ts` y `users-permissions.ts`).
- **Catálogo:** `composition.ts` reúne las listas de todos los contextos en un `PermissionRegistry`. Falla al
  arrancar si hay claves repetidas o mal formadas.
- **Rol:** el agregado `Role`, con un nombre (`RoleName`) y una lista de claves de permiso. Un usuario puede
  tener varios roles; sus permisos son la unión.
- **`SUPER_ADMIN`:** rol de sistema creado en la migración. Tiene todos los permisos del catálogo, incluidos
  los de contextos que se añadan después, y no se puede editar ni borrar (`role.assertEditable()`).
- **Protección de rutas:** `authorize("users:read")` después de `authenticate`. Los permisos se consultan en
  cada petición (no viajan en el token), así un cambio de rol se aplica al instante. Pedir un permiso que
  no está en el catálogo falla al montar las rutas.

```ts
const read = [deps.authenticate, deps.authorize(USERS_PERMISSION.read)];
router.get("/users", read, controller.list);
```

Las reglas que protegen a los superadministradores afectan a dos agregados (`User` y `Role`), así que viven
en el servicio de dominio `domain/services/super-admin-policy.ts`: solo un superadministrador concede o
retira ese rol o cambia el estado de otro, y siempre debe quedar uno activo. Los comandos `AssignUserRoles`
y `ChangeUserStatus` cargan los roles y le preguntan.

Los middlewares `authenticate` y `authorize` pertenecen a `identity`. Otros contextos **no los importan**
(sería usar la `presentation` de otro contexto, R10): los reciben ya construidos desde `composition.ts`,
igual que cualquier otra dependencia.

## Flujo de una petición: `POST /auth/login`

1. **`app.ts`** aplica lo transversal: id de petición y log, cabeceras de seguridad, CORS y lectura del JSON
   con límite de tamaño.
2. **Ruta** (`presentation/routes/auth.routes.ts`): aplica los límites de intentos (por IP y por cuenta) y
   delega en el controlador.
3. **Controlador** (`presentation/controllers/auth.controller.ts`): valida el cuerpo con el esquema Zod
   (`parseBody(loginSchema, req.body)`) y llama a los comandos.
4. **Comando** (`application/commands/authenticate-user.command.ts`): busca el agregado `User` a través de
   `UserRepository` y comprueba la contraseña a través del puerto `PasswordHasher`. No sabe que existen
   Prisma ni Argon2.
5. **Adaptadores** (`infrastructure`): `PrismaUserRepository` consulta Postgres y reconstruye el agregado con
   `User.restore`; `Argon2PasswordHasher` verifica el hash.
6. **Comando** `IssueSession`: crea el access token (puerto `AccessTokenService`) y guarda el hash del
   refresh token (repositorio `RefreshTokenRepository`).
7. **Controlador**: pone el refresh token en una cookie `HttpOnly` y responde con el access token y el
   usuario convertido con `toPublicUser` (nunca el agregado, nunca `passwordHash`).

Si algo falla, el código lanza un `AppError` con un tipo (`unauthenticated`, `conflict`…) y un código estable
(`INVALID_CREDENTIALS`). Express 5 lleva el error al manejador de `shared/http/error-handler.ts`, que
responde `application/problem+json` con el `detail` traducido según `Accept-Language`. Cualquier error
desconocido se convierte en un 500 genérico, sin detalles internos.

## Convenciones

**Nombres de archivo** (kebab-case; el sufijo indica el papel donde la carpeta no basta):

| Pieza                   | Ejemplo                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Agregado                | `domain/aggregates/user.ts`                                                         |
| Objeto de valor         | `domain/value-objects/email.ts`                                                     |
| Evento de dominio       | `domain/events/user-events.ts` (nombre del evento: `agregado.hecho_en_pasado`)      |
| Interfaz de repositorio | `domain/repositories/user.repository.ts`                                            |
| Servicio de dominio     | `domain/services/password-policy.ts`                                                |
| Comando                 | `application/commands/register-user.command.ts`                                     |
| Consulta                | `application/queries/list-users.query.ts`                                           |
| Manejador de eventos    | `application/event-handlers/revoke-sessions-on-password-change.ts`                  |
| Puerto                  | `application/ports/password-hasher.ts`                                              |
| DTO                     | `application/dtos/public-user.ts`                                                   |
| Adaptador               | `infrastructure/database/prisma-user.repository.ts` (prefijo = tecnología)          |
| Rutas y controlador     | `presentation/routes/auth.routes.ts`, `presentation/controllers/auth.controller.ts` |
| Esquemas de entrada     | `presentation/schemas/auth.schemas.ts`                                              |

**Código:**

- ESM con imports relativos que incluyen la extensión `.ts`.
- Sin `enum` ni _parameter properties_: campos explícitos asignados en el constructor (compatible con el
  _type stripping_ de Node).
- Los cuerpos de las peticiones se validan con esquemas Zod **estrictos**: un campo desconocido es un 400.
  Zod comprueba la forma de la petición; las reglas del negocio las comprueban los objetos de valor y los
  agregados.
- Todo código de error nuevo debe tener mensaje en español y en inglés en `shared/i18n/messages.ts`; hay una
  prueba que lo comprueba.
- El `id` numérico de la base de datos nunca sale de la persistencia: hacia fuera se usa `publicId` (UUID).

## Dónde van las pruebas

Las pruebas siguen la misma estructura que el código: `tests/unit/contexts/identity/domain/aggregates/`
prueba lo que hay en `src/contexts/identity/domain/aggregates/`.

| Nivel       | Carpeta              | Qué prueba                                                                                         | Dependencias      |
| ----------- | -------------------- | -------------------------------------------------------------------------------------------------- | ----------------- |
| Unitarias   | `tests/unit/`        | Dominio, comandos, consultas y manejadores (con dobles de `tests/helpers`), `shared`, arquitectura | Ninguna           |
| Aceptación  | `tests/acceptance/`  | El contrato HTTP completo con Supertest: rutas, cabeceras, errores, límites de intentos            | Dobles en memoria |
| Integración | `tests/integration/` | Los adaptadores reales contra Postgres (Testcontainers) y el flujo de punta a punta                | Docker            |

Qué se prueba en cada bloque:

- **Objetos de valor:** qué aceptan, qué rechazan, cómo normalizan y que se comparan por valor.
- **Agregados:** sus invariantes, que cada cambio devuelve otra instancia y **qué eventos anotan**
  (`aggregate.pullEvents()`).
- **Servicios de dominio:** son funciones puras; se prueban con agregados construidos a mano, sin dobles.
- **Comandos:** con repositorios en memoria. Para ver qué eventos publican, `RecordingEventBus`
  (`tests/helpers/event-fakes.ts`); para probar un flujo con sus reacciones reales, `identityEventBus`.
- **Manejadores de eventos:** se les entrega un evento escrito a mano y se observa el efecto.
- **Repositorios (integración):** que guardan y reconstruyen el agregado sin perder datos, y que publican los
  eventos solo después de guardar.

`npm run test:unit` y `npm run test:acceptance` corren en cada commit; `npm run test:integration`, en cada
push. `npm run verify` lo ejecuta todo junto con lint, formato y tipos.

## Cómo añadir un contexto a mano

> La guía [ADDING-A-CONTEXT.md](ADDING-A-CONTEXT.md) hace este mismo recorrido con el código completo de
> un ejemplo (productos), sus pruebas y el principio que protege cada paso. Esto es el resumen.

Ejemplo: un contexto `catalog` con productos. Trabaja de dentro hacia fuera, escribiendo primero la prueba de
cada paso.

1. **Carpetas:** `src/contexts/catalog/{domain,application,infrastructure,presentation}`.
2. **Objetos de valor:** los datos con reglas propias (`Sku`, `Money`) en `domain/value-objects/`, con
   `create` (valida y lanza `AppError`), `restore` y `equals`.
3. **Agregado:** `domain/aggregates/product.ts`, que extiende `AggregateRoot`. Decide qué debe mantenerse
   coherente dentro de él y qué hechos interesan a otros; anota esos hechos como eventos
   (`domain/events/product-events.ts`). Define la interfaz `domain/repositories/product.repository.ts`.
4. **Aplicación:** un comando por operación que cambia algo (`application/commands/`) y una consulta por
   lectura (`application/queries/`), con sus DTO en `application/dtos/`. Si necesita algo del exterior que no
   sea un repositorio, define un puerto en `application/ports/`. Pruebas con un repositorio en memoria.
5. **Persistencia:** añade el modelo a `prisma/schema.prisma` y ejecuta `npx prisma format`,
   `npx prisma migrate dev --name create_products` y `npm run db:generate`. Implementa
   `infrastructure/database/prisma-product.repository.ts`: recibe el `EventBus` y publica
   `aggregate.pullEvents()` **después** de guardar. Pruebas en `tests/integration/contexts/catalog/`.
6. **Reacciones:** si algo debe ocurrir cuando se produce un evento, escribe el manejador en
   `application/event-handlers/` y suscríbelo en un `subscribe.ts` del contexto.
7. **Permisos:** declara los del contexto en su capa de aplicación
   (`definePermissions("catalog", { "products:read": { es: "Ver productos", en: "View products" } })`).
8. **Presentación:** esquemas Zod estrictos en `presentation/schemas/`, el controlador y un
   `createProductsRouter(deps)` en `presentation/routes/`, que recibe `authenticate` y `authorize` y protege
   cada ruta con su permiso. Pruebas en `tests/acceptance/`.
9. **Mensajes:** añade a `shared/i18n/messages.ts` (es y en) los códigos de error nuevos.
10. **Composición:** en `composition.ts`, crea el repositorio, los comandos y las consultas, suscribe los
    manejadores, añade el router a `routers` y suma los permisos al `PermissionRegistry`. Es el único
    archivo fuera del contexto que hay que tocar, además del esquema de Prisma y los mensajes.
11. **Verifica:** `npm run verify`. El test de arquitectura confirmará que el contexto nuevo respeta las
    capas y no importa el dominio de `identity`.

Si `catalog` necesita saber quién es el usuario, no importa `User`: recibe el `publicId` desde la
presentación (el middleware `authenticate` ya lo resuelve) o usa una consulta de `identity`.
