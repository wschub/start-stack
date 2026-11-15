# Cómo añadir una entidad nueva, paso a paso

Esta guía recorre el camino completo de una funcionalidad nueva, desde la regla de negocio hasta la tabla y
la ruta HTTP. El ejemplo es un catálogo de **productos** con dos operaciones: crear uno y listarlos.

Todo el código de esta página se escribió dentro del proyecto, se compiló y pasó las pruebas y el test de
arquitectura antes de copiarlo aquí. No está en `src/` para no imponer un módulo que quizá no necesites.

## El recorrido

Se trabaja **de dentro hacia fuera**: primero lo que no depende de nada, al final lo que depende de todo.
Cada paso se puede probar antes de escribir el siguiente.

```text
 1. entidad            src/entities/product.ts                        ¿qué es un producto válido?
 2. puerto             src/use-cases/products/ports/                  ¿qué necesito guardar y leer?
 3. casos de uso       src/use-cases/products/*.use-case.ts           ¿qué se puede hacer?
 4. permisos           src/use-cases/products/permissions.ts          ¿quién puede hacerlo?
 5. esquema            src/interface-adapters/schemas/                ¿qué forma tiene la petición?
 6. controlador        src/interface-adapters/controllers/            petición → caso de uso → respuesta
 7. tabla              prisma/schema.prisma + migración               ¿cómo se guarda?
 8. repositorio        src/frameworks/database/                       el puerto, implementado con Prisma
 9. rutas              src/frameworks/express/routes/                 URL, permiso y controlador
10. mensajes           src/interface-adapters/presenters/messages.ts  textos de los errores nuevos
11. composición        src/composition.ts                             se conecta todo
```

Hasta el paso 6 no existe ninguna tabla y todo se prueba en milisegundos. La base de datos es un detalle
que llega al final, no el punto de partida.

## 1. La entidad

Empieza por la regla de negocio: qué datos tiene un producto y cuándo son válidos. La entidad no sabe nada
de HTTP ni de la base de datos, y no importa ninguna librería.

`src/entities/product.ts`

```ts
import { randomUUID } from "node:crypto";
import { AppError } from "./errors/app-error.ts";

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
- `restore` existe para el repositorio: lo que viene de la base ya se validó al guardarse.
- Los errores son `AppError` con un código estable (`INVALID_PRODUCT_PRICE`), que es lo que verá el front.

Prueba (`tests/unit/entities/product.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { Product } from "../../../src/entities/product.ts";

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

## 2. El puerto

Antes de pensar en tablas, escribe **qué necesitan los casos de uso** de la persistencia. Es una interfaz
que vive junto a ellos; quien la implemente vendrá después.

`src/use-cases/products/ports/product.repository.ts`

```ts
import type { Product } from "../../../entities/product.ts";

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

Un archivo por operación. Cada uno declara su modelo de petición y de respuesta e implementa
`UseCase<Request, Response>`, que es lo único que conocerá el controlador.

El modelo de respuesta se comparte entre los dos casos de uso:

`src/use-cases/products/product-view.ts`

```ts
import type { Product } from "../../entities/product.ts";

/** Modelo de respuesta: lo que sale de los casos de uso. Datos planos, nunca la entidad. */
export interface ProductView {
  publicId: string;
  name: string;
  priceCents: number;
  createdAt: string;
}

export function toProductView(product: Product): ProductView {
  return {
    publicId: product.publicId,
    name: product.name,
    priceCents: product.priceCents,
    createdAt: product.createdAt.toISOString(),
  };
}
```

Crear cambia el estado:

`src/use-cases/products/create-product.use-case.ts`

```ts
import { Product } from "../../entities/product.ts";
import type { UseCase } from "../use-case.ts";
import type { ProductRepository } from "./ports/product.repository.ts";
import { type ProductView, toProductView } from "./product-view.ts";

/** Modelo de petición: lo que el caso de uso necesita, sin rastro de HTTP. */
export interface CreateProductInput {
  name: string;
  priceCents: number;
}

export class CreateProduct implements UseCase<CreateProductInput, ProductView> {
  private readonly products: ProductRepository;

  constructor(deps: { products: ProductRepository }) {
    this.products = deps.products;
  }

  async execute(input: CreateProductInput): Promise<ProductView> {
    const product = Product.create(input);
    await this.products.add(product);
    return toProductView(product);
  }
}
```

Listar solo lee:

`src/use-cases/products/list-products.use-case.ts`

```ts
import type { UseCase } from "../use-case.ts";
import type { ProductRepository } from "./ports/product.repository.ts";
import { type ProductView, toProductView } from "./product-view.ts";

export class ListProducts implements UseCase<void, ProductView[]> {
  private readonly products: ProductRepository;

  constructor(deps: { products: ProductRepository }) {
    this.products = deps.products;
  }

  async execute(): Promise<ProductView[]> {
    return (await this.products.list()).map(toProductView);
  }
}
```

Fíjate en lo que el caso de uso **no** hace: no valida el precio (lo hace la entidad), no sabe qué es un
`400` (lo decide el presentador de errores) y no sabe que existe Prisma (recibe el puerto).

Prueba con un doble del puerto (`tests/unit/use-cases/products/create-product.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import type { Product } from "../../../../src/entities/product.ts";
import { CreateProduct } from "../../../../src/use-cases/products/create-product.use-case.ts";
import type { ProductRepository } from "../../../../src/use-cases/products/ports/product.repository.ts";

/** Doble del puerto: el caso de uso no nota la diferencia con el repositorio real. */
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

    const view = await new CreateProduct({ products }).execute({
      name: "Teclado",
      priceCents: 4990,
    });

    expect(view).toMatchObject({ name: "Teclado", priceCents: 4990 });
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

Cada funcionalidad declara sus permisos, con su nombre en cada idioma. Aparecerán solos en
`GET /permissions` y se podrán asignar a cualquier rol.

`src/use-cases/products/permissions.ts`

```ts
import { definePermissions } from "../permissions/permission.ts";

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

`src/interface-adapters/schemas/product.schemas.ts`

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

Traduce: lee la petición, llama al caso de uso por su puerto de entrada y devuelve la respuesta. No conoce
Express ni la clase del caso de uso; por eso solo usa `import type` de `use-cases/`.

`src/interface-adapters/controllers/products.controller.ts`

```ts
import type { CreateProductInput } from "../../use-cases/products/create-product.use-case.ts";
import type { ProductView } from "../../use-cases/products/product-view.ts";
import type { UseCase } from "../../use-cases/use-case.ts";
import { type Controller, created, ok } from "../http/http.ts";
import { parseBody } from "../http/parse-body.ts";
import { createProductSchema } from "../schemas/product.schemas.ts";

export interface ProductsControllerDeps {
  createProduct: UseCase<CreateProductInput, ProductView>;
  listProducts: UseCase<void, ProductView[]>;
}

export function createProductsController(deps: ProductsControllerDeps) {
  const create: Controller = async (request) => {
    const product = await deps.createProduct.execute(parseBody(createProductSchema, request.body));
    return created({ product });
  };

  const list: Controller = async () => ok({ products: await deps.listProducts.execute() });

  return { create, list };
}
```

Se prueba sin servidor, con un doble del caso de uso
(`tests/unit/interface-adapters/controllers/products.controller.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { createProductsController } from "../../../../src/interface-adapters/controllers/products.controller.ts";
import type { CreateProductInput } from "../../../../src/use-cases/products/create-product.use-case.ts";
import type { ProductView } from "../../../../src/use-cases/products/product-view.ts";
import { httpRequest } from "../../../helpers/http-request.ts";
import { StubUseCase } from "../../../helpers/use-case-fakes.ts";

const VIEW: ProductView = {
  publicId: "p-1",
  name: "Teclado",
  priceCents: 4990,
  createdAt: "2026-11-15T10:00:00.000Z",
};

describe("controlador de productos", () => {
  it("create valida el cuerpo, llama al caso de uso y responde 201", async () => {
    const createProduct = StubUseCase.returning<CreateProductInput, ProductView>(VIEW);
    const controller = createProductsController({
      createProduct,
      listProducts: StubUseCase.returning([VIEW]),
    });

    const response = await controller.create(
      httpRequest({ body: { name: "Teclado", priceCents: 4990 } }),
    );

    expect(createProduct.calls).toEqual([{ name: "Teclado", priceCents: 4990 }]);
    expect(response).toEqual({ status: 201, body: { product: VIEW } });
  });

  it("create rechaza campos desconocidos sin llamar al caso de uso", async () => {
    const createProduct = StubUseCase.returning<CreateProductInput, ProductView>(VIEW);
    const controller = createProductsController({
      createProduct,
      listProducts: StubUseCase.returning([VIEW]),
    });

    await expect(
      controller.create(httpRequest({ body: { name: "Teclado", priceCents: 1, stock: 3 } })),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(createProduct.calls).toEqual([]);
  });
});
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

## 8. El repositorio

Implementa el puerto del paso 2 con Prisma. Es el único archivo de la funcionalidad que conoce la base de
datos, y su trabajo es convertir entre filas y entidades.

`src/frameworks/database/prisma-product.repository.ts`

```ts
import { AppError } from "../../entities/errors/app-error.ts";
import { Product } from "../../entities/product.ts";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";
import type { ProductRepository } from "../../use-cases/products/ports/product.repository.ts";

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
código no debe saber qué es un código de Prisma.

Se prueba contra Postgres real en `tests/integration/frameworks/database/`; mira
`prisma-role-repository.test.ts` como modelo.

## 9. Las rutas

Aquí se decide la URL, el permiso que exige cada operación y qué controlador la atiende. `adapt` convierte
el controlador en un manejador de Express.

`src/frameworks/express/routes/products.routes.ts`

```ts
import { type RequestHandler, Router } from "express";
import {
  createProductsController,
  type ProductsControllerDeps,
} from "../../../interface-adapters/controllers/products.controller.ts";
import { PRODUCTS_PERMISSION } from "../../../use-cases/products/permissions.ts";
import { adapt } from "../adapt.ts";
import type { PermissionGuard } from "../middlewares/require-permission.ts";

export interface ProductsRouterDeps extends ProductsControllerDeps {
  authenticate: RequestHandler;
  authorize: PermissionGuard;
}

export function createProductsRouter(deps: ProductsRouterDeps): Router {
  const router = Router();
  const controller = createProductsController(deps);
  const read = [deps.authenticate, deps.authorize(PRODUCTS_PERMISSION.read)];
  const manage = [deps.authenticate, deps.authorize(PRODUCTS_PERMISSION.manage)];

  router.get("/products", read, adapt(controller.list));
  router.post("/products", manage, adapt(controller.create));

  return router;
}
```

Las rutas reciben `authenticate` y `authorize` ya construidos. Si olvidas protegerla, la ruta queda
pública: revisa siempre que cada una lleve su permiso. La prueba de aceptación (`tests/acceptance/`) debe
comprobar el 401 sin token y el 403 sin permiso; `users.test.ts` es un buen modelo.

## 10. Los mensajes de error

Cada código de error nuevo necesita su texto en español y en inglés en
`src/interface-adapters/presenters/messages.ts`. Hay una prueba que falla si falta alguno.

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
repositorio, se le entrega a los casos de uso, estos al router, y el router a la aplicación.

```ts
import { PrismaProductRepository } from "./frameworks/database/prisma-product.repository.ts";
import { createProductsRouter } from "./frameworks/express/routes/products.routes.ts";
import { CreateProduct } from "./use-cases/products/create-product.use-case.ts";
import { ListProducts } from "./use-cases/products/list-products.use-case.ts";
import { PRODUCTS_PERMISSIONS } from "./use-cases/products/permissions.ts";

// 1. Los permisos nuevos entran en el catálogo.
const permissions = new PermissionRegistry([
  ...AUTH_PERMISSIONS,
  ...USERS_PERMISSIONS,
  ...PRODUCTS_PERMISSIONS,
]);

// 2. El detalle (Prisma) se entrega a los casos de uso a través del puerto.
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

Termina con `npm run verify`. El test de arquitectura confirmará que cada archivo está en su capa.

## Qué principio protege cada paso

| Principio                             | Dónde se ve en el ejemplo                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Responsabilidad única                 | Un caso de uso por operación. La entidad valida, el caso de uso coordina, el controlador traduce, el repositorio guarda         |
| Abierto/cerrado                       | Añadir productos no modificó ningún archivo de `auth` ni de `users`; solo se añadieron archivos y unas líneas en la composición |
| Sustitución de Liskov                 | `InMemoryProductRepository` y `PrismaProductRepository` cumplen el mismo puerto; el caso de uso funciona igual con los dos      |
| Segregación de interfaces             | El puerto solo tiene `add` y `list`; el controlador solo ve `UseCase<Request, Response>`, no la clase                           |
| Inversión de dependencias             | `CreateProduct` depende de `ProductRepository` (una interfaz suya), no de Prisma. La dependencia apunta hacia dentro            |
| Separar escritura de lectura          | `CreateProduct` cambia el estado y `ListProducts` solo lee: son clases distintas, con modelos distintos                         |
| Validar en la frontera y en el núcleo | El esquema rechaza peticiones mal formadas; la entidad garantiza que no existe un producto inválido, venga de donde venga       |
| Mínimo privilegio                     | Cada ruta exige su permiso; leer y crear son permisos distintos                                                                 |

Sobre **CQRS**: aquí se aplica solo la parte que no cuesta nada, separar los casos de uso que escriben de
los que leen. No hay un modelo de lectura aparte ni otra base de datos. Si una consulta llegara a
necesitarlos, se cambiaría ese caso de uso y su puerto sin tocar los de escritura.

## Lista de comprobación

- [ ] La entidad rechaza los datos inválidos y tiene pruebas.
- [ ] Cada caso de uso implementa `UseCase<Request, Response>` y devuelve datos planos, no la entidad.
- [ ] El puerto solo tiene los métodos que se usan.
- [ ] El esquema de entrada es `.strict()`.
- [ ] El controlador solo importa tipos de `use-cases/`.
- [ ] La unicidad y las claves foráneas están en la base de datos, no solo en el código.
- [ ] Ninguna respuesta expone el `id` interno ni datos sensibles.
- [ ] Cada ruta lleva `authenticate` y su permiso, y hay pruebas del 401 y del 403.
- [ ] Los códigos de error nuevos tienen mensaje en español y en inglés.
- [ ] `npm run verify` pasa.
