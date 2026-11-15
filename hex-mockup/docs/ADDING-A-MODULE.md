# Cómo añadir un módulo nuevo, paso a paso

Esta guía recorre el camino completo de un módulo nuevo, desde la regla de negocio hasta la tabla y la ruta
HTTP. El ejemplo es un catálogo de **productos** con dos operaciones: crear uno y listarlos.

Todo el código de esta página se escribió dentro del proyecto, se compiló y pasó las pruebas y el test de
arquitectura antes de copiarlo aquí. No está en `src/` para no imponer un módulo que quizá no necesites.

## El recorrido

Se trabaja **de dentro hacia fuera**: primero lo que no depende de nada, al final lo que depende de todo.
Cada paso se puede probar antes de escribir el siguiente. Todo vive en `src/modules/products/`, una
carpeta por capa.

```text
 1. entidad            domain/entities/product.entity.ts           ¿qué es un producto válido?
 2. repositorio        domain/repositories/                        ¿qué necesito guardar y leer? (interfaz)
 3. casos de uso       application/use-cases/*.use-case.ts         ¿qué se puede hacer?
 4. permisos           application/permissions.ts                  ¿quién puede hacerlo?
 5. esquema            presentation/schemas/                       ¿qué forma tiene la petición?
 6. controlador        presentation/controllers/                   petición → caso de uso → respuesta
 7. tabla              prisma/schema.prisma + migración            ¿cómo se guarda?
 8. adaptador          infrastructure/database/                    la interfaz, implementada con Prisma
 9. rutas              presentation/routes/                        URL, permiso y controlador
10. mensajes           src/shared/i18n/messages.ts                 textos de los errores nuevos
11. composición        src/composition.ts                          se conecta todo
```

Hasta el paso 6 no existe ninguna tabla y los pasos 1 a 3 se prueban en milisegundos. La base de datos es un
detalle que llega al final, no el punto de partida.

## 1. La entidad

Empieza por la regla de negocio: qué datos tiene un producto y cuándo son válidos. La entidad no sabe nada
de HTTP ni de la base de datos, y no importa ninguna librería (regla R1).

`src/modules/products/domain/entities/product.entity.ts`

```ts
import { randomUUID } from "node:crypto";
import { AppError } from "../../../../shared/errors/app-error.ts";

export interface ProductProps {
  publicId: string;
  name: string;
  /** Precio en céntimos: el dinero nunca se guarda como número con decimales. */
  priceCents: number;
  createdAt: Date;
}

export interface NewProductInput {
  name: string;
  priceCents: number;
}

const MAX_NAME = 120;

export class Product {
  readonly publicId: string;
  readonly name: string;
  readonly priceCents: number;
  readonly createdAt: Date;

  private constructor(props: ProductProps) {
    this.publicId = props.publicId;
    this.name = props.name;
    this.priceCents = props.priceCents;
    this.createdAt = props.createdAt;
    Object.freeze(this);
  }

  /** Único camino para crear un producto nuevo: aquí viven sus reglas. */
  static create(input: NewProductInput, now: () => Date = () => new Date()): Product {
    const name = input.name.trim();
    if (name.length === 0 || name.length > MAX_NAME) {
      throw new AppError("validation", {
        code: "INVALID_PRODUCT_NAME",
        details: { field: "name" },
      });
    }
    if (!Number.isSafeInteger(input.priceCents) || input.priceCents < 0) {
      throw new AppError("validation", {
        code: "INVALID_PRODUCT_PRICE",
        details: { field: "priceCents" },
      });
    }
    return new Product({
      publicId: randomUUID(),
      name,
      priceCents: input.priceCents,
      createdAt: now(),
    });
  }

  /** Reconstruye un producto ya guardado, sin validar de nuevo. Lo usa el repositorio. */
  static restore(props: ProductProps): Product {
    return new Product(props);
  }
}
```

- `create` es la única forma de obtener un producto nuevo, así que **no puede existir uno inválido**.
- `restore` existe para el adaptador de base de datos: lo que viene de la base ya se validó al guardarse.
- Los errores son `AppError` con un código estable (`INVALID_PRODUCT_PRICE`), que es lo que verá el front.

Prueba (`tests/unit/modules/products/product.entity.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { Product } from "../../../../src/modules/products/domain/entities/product.entity.ts";

describe("Product", () => {
  it("se crea con el nombre limpio y un id propio", () => {
    const product = Product.create({ name: "  Teclado  ", priceCents: 4990 });

    expect(product.name).toBe("Teclado");
    expect(product.priceCents).toBe(4990);
    expect(product.publicId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([-1, 10.5, Number.NaN])("rechaza el precio %s", (priceCents) => {
    expect(() => Product.create({ name: "Teclado", priceCents })).toThrow(
      expect.objectContaining({ code: "INVALID_PRODUCT_PRICE" }),
    );
  });

  it("rechaza un nombre vacío", () => {
    expect(() => Product.create({ name: "   ", priceCents: 100 })).toThrow(
      expect.objectContaining({ code: "INVALID_PRODUCT_NAME" }),
    );
  });
});
```

## 2. La interfaz del repositorio

Antes de pensar en tablas, escribe **qué necesitan los casos de uso** de la persistencia. Es una interfaz
que vive en `domain/`; quien la implemente vendrá después.

`src/modules/products/domain/repositories/product.repository.ts`

```ts
import type { Product } from "../entities/product.entity.ts";

/** Lo que los casos de uso necesitan de la persistencia. No dice cómo ni dónde se guarda. */
export interface ProductRepository {
  /** Lanza AppError conflict PRODUCT_NAME_TAKEN si ya existe un producto con ese nombre. */
  add(product: Product): Promise<void>;
  list(): Promise<Product[]>;
}
```

Pon solo los métodos que vas a usar ahora. Un repositorio con `findById`, `update` y `delete` "por si
acaso" obliga a implementarlos y probarlos sin que nadie los llame.

## 3. Los casos de uso

Un archivo por operación, con su modelo de petición. Lo que devuelven es una vista pública, no la entidad:

`src/modules/products/application/public-product.ts`

```ts
import type { Product } from "../domain/entities/product.entity.ts";

/** Lo que sale de los casos de uso: datos planos, nunca la entidad. */
export interface PublicProduct {
  publicId: string;
  name: string;
  priceCents: number;
  createdAt: string;
}

export function toPublicProduct(product: Product): PublicProduct {
  return {
    publicId: product.publicId,
    name: product.name,
    priceCents: product.priceCents,
    createdAt: product.createdAt.toISOString(),
  };
}
```

Crear cambia el estado:

`src/modules/products/application/use-cases/create-product.use-case.ts`

```ts
import { Product } from "../../domain/entities/product.entity.ts";
import type { ProductRepository } from "../../domain/repositories/product.repository.ts";
import { type PublicProduct, toPublicProduct } from "../public-product.ts";

export interface CreateProductInput {
  name: string;
  priceCents: number;
}

export class CreateProduct {
  private readonly products: ProductRepository;

  constructor(deps: { products: ProductRepository }) {
    this.products = deps.products;
  }

  async execute(input: CreateProductInput): Promise<PublicProduct> {
    const product = Product.create(input);
    await this.products.add(product);
    return toPublicProduct(product);
  }
}
```

Listar solo lee:

`src/modules/products/application/use-cases/list-products.use-case.ts`

```ts
import type { ProductRepository } from "../../domain/repositories/product.repository.ts";
import { type PublicProduct, toPublicProduct } from "../public-product.ts";

export class ListProducts {
  private readonly products: ProductRepository;

  constructor(deps: { products: ProductRepository }) {
    this.products = deps.products;
  }

  async execute(): Promise<PublicProduct[]> {
    return (await this.products.list()).map(toPublicProduct);
  }
}
```

Fíjate en lo que el caso de uso **no** hace: no valida el precio (lo hace la entidad), no sabe qué es un
`400` (lo decide el manejador de errores) y no sabe que existe Prisma (recibe la interfaz).

Prueba con un doble del repositorio (`tests/unit/modules/products/create-product.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import type { Product } from "../../../../src/modules/products/domain/entities/product.entity.ts";
import type { ProductRepository } from "../../../../src/modules/products/domain/repositories/product.repository.ts";
import { CreateProduct } from "../../../../src/modules/products/application/use-cases/create-product.use-case.ts";

/** Doble del repositorio: el caso de uso no nota la diferencia con el real. */
class InMemoryProductRepository implements ProductRepository {
  readonly items: Product[] = [];

  async add(product: Product): Promise<void> {
    this.items.push(product);
  }

  async list(): Promise<Product[]> {
    return this.items;
  }
}

describe("CreateProduct", () => {
  it("guarda el producto y devuelve su vista pública", async () => {
    const products = new InMemoryProductRepository();

    const result = await new CreateProduct({ products }).execute({
      name: "Teclado",
      priceCents: 4990,
    });

    expect(result).toMatchObject({ name: "Teclado", priceCents: 4990 });
    expect(products.items).toHaveLength(1);
  });

  it("si la entidad rechaza los datos no se guarda nada", async () => {
    const products = new InMemoryProductRepository();

    await expect(
      new CreateProduct({ products }).execute({ name: "Teclado", priceCents: -5 }),
    ).rejects.toMatchObject({ code: "INVALID_PRODUCT_PRICE" });
    expect(products.items).toEqual([]);
  });
});
```

## 4. Los permisos

Cada módulo declara sus permisos, con su nombre en cada idioma. Aparecerán solos en `GET /permissions` y se
podrán asignar a cualquier rol.

`src/modules/products/application/permissions.ts`

```ts
import { definePermissions } from "../../../shared/permissions/permission.ts";

export const PRODUCTS_PERMISSION = {
  read: "products:read",
  manage: "products:manage",
} as const;

export const PRODUCTS_PERMISSIONS = definePermissions("products", {
  [PRODUCTS_PERMISSION.read]: { es: "Ver productos", en: "View products" },
  [PRODUCTS_PERMISSION.manage]: { es: "Crear productos", en: "Create products" },
});
```

## 5. El esquema de entrada

El esquema comprueba la **forma** de la petición (tipos, campos desconocidos, tamaños máximos). No repite
las reglas del negocio: que el precio no sea negativo lo decide la entidad, en un solo sitio.

`src/modules/products/presentation/schemas/product.schemas.ts`

```ts
import { z } from "zod";

/** Solo la forma de la petición. Las reglas del negocio las comprueba la entidad. */
export const createProductSchema = z
  .object({
    name: z.string().max(500),
    priceCents: z.number().int(),
  })
  .strict();
```

`.strict()` hace que un campo desconocido sea un 400 en lugar de ignorarse.

## 6. El controlador

Traduce HTTP a casos de uso: valida el cuerpo, llama al caso de uso y responde. No contiene reglas de
negocio ni conoce la base de datos (regla R3).

`src/modules/products/presentation/controllers/products.controller.ts`

```ts
import type { RequestHandler } from "express";
import { parseBody } from "../../../../shared/http/validate.ts";
import type { CreateProduct } from "../../application/use-cases/create-product.use-case.ts";
import type { ListProducts } from "../../application/use-cases/list-products.use-case.ts";
import { createProductSchema } from "../schemas/product.schemas.ts";

export interface ProductsControllerDeps {
  createProduct: CreateProduct;
  listProducts: ListProducts;
}

export function createProductsController(deps: ProductsControllerDeps) {
  const create: RequestHandler = async (req, res) => {
    const product = await deps.createProduct.execute(parseBody(createProductSchema, req.body));
    res.status(201).json({ product });
  };

  const list: RequestHandler = async (_req, res) => {
    res.json({ products: await deps.listProducts.execute() });
  };

  return { create, list };
}
```

## 7. La tabla

Ahora sí, la base de datos. Añade el modelo a `prisma/schema.prisma`:

```prisma
model Product {
  id         Int      @id @default(autoincrement())
  publicId   String   @unique @db.Uuid
  name       String   @unique
  priceCents Int
  createdAt  DateTime @default(now())

  @@map("products")
}
```

Y crea la migración y el cliente:

```bash
npx prisma format
npx prisma migrate dev --name create_products
npm run db:generate
```

- `id` es interno y nunca sale de la persistencia; hacia fuera se usa `publicId`.
- La unicidad del nombre se garantiza **en la base** (`@unique`), no con una consulta previa: dos
  peticiones simultáneas no pueden colarse entre la comprobación y la escritura.
- Revisa el SQL generado en `prisma/migrations/` antes de confirmarlo. En producción las migraciones se
  aplican con `npm run db:migrate`, como paso aparte del arranque.

## 8. El adaptador de base de datos

Implementa la interfaz del paso 2 con Prisma. Es el único archivo del módulo que conoce la base de datos, y
su trabajo es convertir entre filas y entidades.

`src/modules/products/infrastructure/database/prisma-product.repository.ts`

```ts
import { Prisma, type PrismaClient } from "../../../../generated/prisma/client.ts";
import { AppError } from "../../../../shared/errors/app-error.ts";
import { Product } from "../../domain/entities/product.entity.ts";
import type { ProductRepository } from "../../domain/repositories/product.repository.ts";

export class PrismaProductRepository implements ProductRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async add(product: Product): Promise<void> {
    try {
      await this.prisma.product.create({
        data: {
          publicId: product.publicId,
          name: product.name,
          priceCents: product.priceCents,
          createdAt: product.createdAt,
        },
      });
    } catch (error) {
      // P2002: se violó un índice único. Aquí el único es el del nombre.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("conflict", { code: "PRODUCT_NAME_TAKEN", cause: error });
      }
      throw error;
    }
  }

  async list(): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({ orderBy: { name: "asc" } });
    return rows.map((row) =>
      Product.restore({
        publicId: row.publicId,
        name: row.name,
        priceCents: row.priceCents,
        createdAt: row.createdAt,
      }),
    );
  }
}
```

Traduce los errores de la base a errores de la aplicación (`P2002` → `PRODUCT_NAME_TAKEN`): el resto del
código no debe saber qué es un código de Prisma. Se prueba contra Postgres real en
`tests/integration/`; mira `auth/prisma-role-repository.test.ts` como modelo.

## 9. Las rutas

Aquí se decide la URL, el permiso que exige cada operación y qué controlador la atiende.

`src/modules/products/presentation/routes/products.routes.ts`

```ts
import { type RequestHandler, Router } from "express";
import { PRODUCTS_PERMISSION } from "../../application/permissions.ts";
import {
  createProductsController,
  type ProductsControllerDeps,
} from "../controllers/products.controller.ts";

export interface ProductsRouterDeps extends ProductsControllerDeps {
  /** Middlewares de autenticación y permisos, ya construidos en composition.ts. */
  authenticate: RequestHandler;
  authorize: (permission: string) => RequestHandler;
}

export function createProductsRouter(deps: ProductsRouterDeps): Router {
  const router = Router();
  const controller = createProductsController(deps);
  const read = [deps.authenticate, deps.authorize(PRODUCTS_PERMISSION.read)];
  const manage = [deps.authenticate, deps.authorize(PRODUCTS_PERMISSION.manage)];

  router.get("/products", read, controller.list);
  router.post("/products", manage, controller.create);

  return router;
}
```

Las rutas reciben `authenticate` y `authorize` ya construidos: no importan nada del módulo `auth`. Si
olvidas protegerla, la ruta queda pública, así que cada ruta debe llevar su permiso y su prueba del 401 y
del 403 (`tests/acceptance/products.test.ts`):

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.ts";
import { GetUserAccess } from "../../src/modules/auth/application/use-cases/get-user-access.use-case.ts";
import { Role } from "../../src/modules/auth/domain/entities/role.ts";
import { requireAuth } from "../../src/modules/auth/presentation/middlewares/require-auth.ts";
import { createPermissionGuard } from "../../src/modules/auth/presentation/middlewares/require-permission.ts";
import { CreateProduct } from "../../src/modules/products/application/use-cases/create-product.use-case.ts";
import { ListProducts } from "../../src/modules/products/application/use-cases/list-products.use-case.ts";
import type { Product } from "../../src/modules/products/domain/entities/product.entity.ts";
import type { ProductRepository } from "../../src/modules/products/domain/repositories/product.repository.ts";
import { createProductsRouter } from "../../src/modules/products/presentation/routes/products.routes.ts";
import { PRODUCTS_PERMISSIONS } from "../../src/modules/products/application/permissions.ts";
import { PermissionRegistry } from "../../src/shared/permissions/permission.ts";
import { User } from "../../src/modules/users/domain/entities/user.entity.ts";
import { InMemoryUserRepository } from "../helpers/fakes.ts";
import { InMemoryRoleRepository, testRegistry } from "../helpers/role-fakes.ts";
import { FakeAccessTokenService } from "../helpers/session-fakes.ts";

class InMemoryProductRepository implements ProductRepository {
  readonly items: Product[] = [];

  async add(product: Product): Promise<void> {
    this.items.push(product);
  }

  async list(): Promise<Product[]> {
    return this.items;
  }
}

async function build() {
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository(users);
  const registry = new PermissionRegistry([...testRegistryDefinitions(), ...PRODUCTS_PERMISSIONS]);
  const getUserAccess = new GetUserAccess({ roles, registry });
  const products = new InMemoryProductRepository();
  const router = createProductsRouter({
    authenticate: requireAuth({ accessTokens: new FakeAccessTokenService(), users }),
    authorize: createPermissionGuard({ registry, getUserAccess }),
    createProduct: new CreateProduct({ products }),
    listProducts: new ListProducts({ products }),
  });

  /** Crea un usuario con un rol hecho a medida y devuelve su cabecera de autenticación. */
  const userWith = async (email: string, permissions: string[]) => {
    const user = User.create({ email, passwordHash: "x", firstName: "Ana", lastName: "Gómez" });
    await users.add(user);
    const role = Role.create({ name: `Rol de ${email.split("@")[0]}`, permissions });
    await roles.add(role);
    await roles.setUserRoles(user.publicId, [role.publicId]);
    return `Bearer access:${user.publicId}`;
  };

  return { app: createApp({ routers: [router] }), userWith };
}

function testRegistryDefinitions() {
  const registry = testRegistry();
  return registry.groups().flatMap((group) => group.permissions);
}

describe("/products", () => {
  it("responde 401 sin token y 403 sin el permiso", async () => {
    const { app, userWith } = await build();
    const reader = await userWith("lector@example.com", ["products:read"]);

    const anonymous = await request(app).post("/products").send({ name: "A", priceCents: 1 });
    const forbidden = await request(app)
      .post("/products")
      .set("Authorization", reader)
      .send({ name: "A", priceCents: 1 });

    expect(anonymous.status).toBe(401);
    expect([forbidden.status, forbidden.body.code]).toEqual([403, "PERMISSION_DENIED"]);
  });

  it("crea un producto y luego lo lista", async () => {
    const { app, userWith } = await build();
    const admin = await userWith("admin@example.com", ["products:manage", "products:read"]);

    const created = await request(app)
      .post("/products")
      .set("Authorization", admin)
      .send({ name: "Teclado", priceCents: 4990 });
    const list = await request(app).get("/products").set("Authorization", admin);

    expect(created.status).toBe(201);
    expect(created.body.product).toMatchObject({ name: "Teclado", priceCents: 4990 });
    expect(list.body.products).toHaveLength(1);
  });

  it("rechaza un precio inválido con el código de la entidad y campos desconocidos con 400", async () => {
    const { app, userWith } = await build();
    const admin = await userWith("admin@example.com", ["products:manage"]);

    const price = await request(app)
      .post("/products")
      .set("Authorization", admin)
      .send({ name: "Teclado", priceCents: -5 });
    const extra = await request(app)
      .post("/products")
      .set("Authorization", admin)
      .send({ name: "Teclado", priceCents: 5, stock: 3 });

    expect([price.status, price.body.code]).toEqual([400, "INVALID_PRODUCT_PRICE"]);
    expect([extra.status, extra.body.code]).toEqual([400, "VALIDATION_ERROR"]);
  });
});
```

## 10. Los mensajes de error

Cada código de error nuevo necesita su texto en español y en inglés en `src/shared/i18n/messages.ts`. Hay
una prueba que falla si falta alguno.

```ts
// en
INVALID_PRODUCT_NAME: "The product name is not valid.",
INVALID_PRODUCT_PRICE: "The price must be a whole number of cents, zero or more.",
PRODUCT_NAME_TAKEN: "A product with that name already exists.",

// es
INVALID_PRODUCT_NAME: "El nombre del producto no es válido.",
INVALID_PRODUCT_PRICE: "El precio debe ser un número entero de céntimos, cero o más.",
PRODUCT_NAME_TAKEN: "Ya existe un producto con ese nombre.",
```

## 11. La composición

El último paso es el único que toca un archivo existente con lógica: `src/composition.ts`. Se crea el
adaptador, se le entrega a los casos de uso, estos al router, y el router a la aplicación.

```ts
import { PRODUCTS_PERMISSIONS } from "./modules/products/application/permissions.ts";
import { CreateProduct } from "./modules/products/application/use-cases/create-product.use-case.ts";
import { ListProducts } from "./modules/products/application/use-cases/list-products.use-case.ts";
import { PrismaProductRepository } from "./modules/products/infrastructure/database/prisma-product.repository.ts";
import { createProductsRouter } from "./modules/products/presentation/routes/products.routes.ts";

// 1. Los permisos nuevos entran en el catálogo.
const permissions = new PermissionRegistry([
  ...AUTH_PERMISSIONS,
  ...USERS_PERMISSIONS,
  ...PRODUCTS_PERMISSIONS,
]);

// 2. El adaptador (Prisma) se entrega a los casos de uso a través del repositorio.
const products = new PrismaProductRepository(prisma);
const productsRouter = createProductsRouter({
  authenticate,
  authorize,
  createProduct: new CreateProduct({ products }),
  listProducts: new ListProducts({ products }),
});

// 3. El router se suma a la aplicación.
const app = createApp({
  routers: [authRouter, sessionRouter, passwordRouter, rolesRouter, usersRouter, productsRouter],
  // …
});
```

Termina con `npm run verify`. El test de arquitectura confirmará que cada archivo está en su capa y que el
módulo nuevo no importa la infraestructura ni la presentación de otro.

## Qué principio protege cada paso

| Principio                             | Dónde se ve en el ejemplo                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Responsabilidad única                 | Un caso de uso por operación. La entidad valida, el caso de uso coordina, el controlador traduce, el adaptador guarda                     |
| Abierto/cerrado                       | Añadir productos no modificó ningún archivo de `auth` ni de `users`; solo se añadieron archivos y unas líneas en la composición           |
| Sustitución de Liskov                 | El repositorio en memoria de las pruebas y `PrismaProductRepository` cumplen la misma interfaz; el caso de uso funciona igual con los dos |
| Segregación de interfaces             | La interfaz solo tiene `add` y `list`, lo que los casos de uso usan                                                                       |
| Inversión de dependencias             | `CreateProduct` depende de `ProductRepository` (una interfaz de `domain/`), no de Prisma. La dependencia apunta hacia el dominio          |
| Separar escritura de lectura          | `CreateProduct` cambia el estado y `ListProducts` solo lee: son clases distintas                                                          |
| Validar en la frontera y en el núcleo | El esquema rechaza peticiones mal formadas; la entidad garantiza que no existe un producto inválido, venga de donde venga                 |
| Mínimo privilegio                     | Cada ruta exige su permiso; leer y crear son permisos distintos                                                                           |

Sobre **CQRS**: aquí se aplica solo la parte que no cuesta nada, separar los casos de uso que escriben de
los que leen. No hay un modelo de lectura aparte ni otra base de datos. Si una consulta llegara a
necesitarlos, se cambiaría ese caso de uso sin tocar los de escritura.

## Lista de comprobación

- [ ] La entidad rechaza los datos inválidos y tiene pruebas.
- [ ] Cada caso de uso devuelve datos planos, no la entidad.
- [ ] La interfaz del repositorio solo tiene los métodos que se usan.
- [ ] El esquema de entrada es `.strict()`.
- [ ] La unicidad y las claves foráneas están en la base de datos, no solo en el código.
- [ ] Ninguna respuesta expone el `id` interno ni datos sensibles.
- [ ] Cada ruta lleva `authenticate` y su permiso, y hay pruebas del 401 y del 403.
- [ ] Los códigos de error nuevos tienen mensaje en español y en inglés.
- [ ] `npm run verify` pasa.
