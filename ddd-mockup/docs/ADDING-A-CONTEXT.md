# Cómo añadir un contexto nuevo, paso a paso

Esta guía recorre el camino completo de un contexto nuevo, desde las reglas del negocio hasta la tabla y la
ruta HTTP. El ejemplo es un catálogo de **productos** (`catalog`) con dos operaciones: crear uno y listarlos,
y una reacción a que se cree: anunciarlo.

Todo el código de esta página se escribió dentro del proyecto, se compiló y pasó las pruebas y el test de
arquitectura antes de copiarlo aquí. No está en `src/` para no imponer un contexto que quizá no necesites.

## Primero, decide dónde va

Antes de crear nada, una pregunta: ¿el concepto nuevo pertenece a un contexto que ya existe o es otro?

- **Mismo contexto** (por ejemplo, "sesiones" dentro de `identity`): añade un agregado dentro de él. Los
  pasos de abajo valen igual, sin crear la carpeta del contexto.
- **Contexto nuevo** (como `catalog`): cuando tiene su propio lenguaje y sus propias reglas, y puede cambiar
  sin que `identity` se entere. Este es el caso del ejemplo.

Un contexto nuevo **no puede importar el dominio de `identity`** (regla R10). Si necesita saber quién hace
la petición, recibe el `publicId` ya resuelto, o reacciona a un evento. Por eso las rutas de `catalog` reciben
`authenticate` y `authorize` ya construidos y no importan nada de `identity`.

## El recorrido

Se trabaja **de dentro hacia fuera**: primero lo que no depende de nada, al final lo que depende de todo.
Cada paso se puede probar antes de escribir el siguiente. Todo vive en `src/contexts/catalog/`.

```text
 1. objetos de valor   domain/value-objects/                       ¿qué datos tienen reglas propias?
 2. evento             domain/events/                              ¿qué hecho interesa a otros?
 3. agregado           domain/aggregates/product.ts                ¿qué debe mantenerse coherente?
 4. repositorio        domain/repositories/                        ¿qué guardo y leo? (interfaz)
 5. comando y consulta application/commands/, queries/             ¿qué cambia el estado y qué solo lee?
 6. reacción           application/event-handlers/ + ports/        ¿qué ocurre cuando pasa el hecho?
 7. permisos           application/permissions.ts                  ¿quién puede hacerlo?
 8. esquema y controlador  presentation/schemas/, controllers/     petición → comando → respuesta
 9. tabla              prisma/schema.prisma + migración            ¿cómo se guarda?
10. adaptador          infrastructure/database/                    la interfaz, con Prisma; publica eventos
11. rutas              presentation/routes/                        URL, permiso y controlador
12. mensajes           src/shared/i18n/messages.ts                 textos de los errores nuevos
13. composición        src/composition.ts                          se conecta todo
```

Hasta el paso 8 no existe ninguna tabla y todo se prueba en milisegundos. La base de datos llega al final.

## 1. Los objetos de valor

Un dato con reglas propias es un objeto de valor: se valida **al crearse**, no tiene identidad y se compara
por valor. Si existe, es válido.

`src/contexts/catalog/domain/value-objects/product-name.ts`

```ts
import { AppError } from "../../../../shared/errors/app-error.ts";

const MAX_LENGTH = 120;

/** Nombre de un producto: no vacío y de longitud razonable. */
export class ProductName {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static create(raw: string): ProductName {
    const value = raw.trim();
    if (value.length === 0 || value.length > MAX_LENGTH) {
      throw new AppError("validation", {
        code: "INVALID_PRODUCT_NAME",
        details: { field: "name" },
      });
    }
    return new ProductName(value);
  }

  /** Para valores que ya pasaron la validación (leídos de la base de datos). */
  static restore(value: string): ProductName {
    return new ProductName(value);
  }

  equals(other: ProductName): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
```

`src/contexts/catalog/domain/value-objects/price.ts`

```ts
import { AppError } from "../../../../shared/errors/app-error.ts";

/** Precio en céntimos: el dinero nunca se guarda como número con decimales. */
export class Price {
  readonly cents: number;

  private constructor(cents: number) {
    this.cents = cents;
    Object.freeze(this);
  }

  static create(cents: number): Price {
    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new AppError("validation", {
        code: "INVALID_PRODUCT_PRICE",
        details: { field: "priceCents" },
      });
    }
    return new Price(cents);
  }

  /** Para valores que ya pasaron la validación (leídos de la base de datos). */
  static restore(cents: number): Price {
    return new Price(cents);
  }

  equals(other: Price): boolean {
    return this.cents === other.cents;
  }
}
```

- `create` valida y lanza `AppError` con un código estable; `restore` no valida y solo lo usa el
  repositorio para lo que ya está en la base.
- El precio es un entero de céntimos: el dinero nunca se guarda con decimales.
- ¿Cuándo un dato merece ser objeto de valor? Cuando tiene reglas (`Price`) o cuando mezclarlo con otro del
  mismo tipo sería un error (un nombre y una descripción son ambos `string`). Un dato sin reglas puede
  seguir siendo un `string`.

Prueba (`tests/unit/contexts/catalog/domain/price.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { Price } from "../../../../../src/contexts/catalog/domain/value-objects/price.ts";
import { errorOf } from "../../../../helpers/app-error.ts";

describe("Price", () => {
  it.each([0, 1, 4990])("acepta %i céntimos", (cents) => {
    expect(Price.create(cents).cents).toBe(cents);
  });

  it.each([-1, 10.5, Number.NaN, Number.POSITIVE_INFINITY])("rechaza %s", (cents) => {
    expect(errorOf(() => Price.create(cents))).toBe("validation:INVALID_PRODUCT_PRICE");
  });

  it("se compara por valor y es inmutable", () => {
    expect(Price.create(100).equals(Price.create(100))).toBe(true);
    expect(Price.create(100).equals(Price.create(101))).toBe(false);
    expect(Object.isFrozen(Price.create(100))).toBe(true);
  });
});
```

## 2. El evento de dominio

Un evento es un **hecho ya ocurrido**, nombrado en pasado (`agregado.hecho`) y que solo lleva datos.

`src/contexts/catalog/domain/events/product-events.ts`

```ts
import type { DomainEvent } from "../../../../shared/domain/domain-event.ts";

export interface ProductCreated extends DomainEvent {
  readonly name: "product.created";
  readonly productId: string;
  readonly productName: string;
  readonly priceCents: number;
}
```

Crea un evento solo para los hechos que le importen a alguien más (otro contexto, un envío, una
auditoría). No lo hagas por cada cambio "por si acaso": cada evento es un contrato.

## 3. El agregado

El agregado es la única puerta de entrada para cambiar un conjunto de objetos que deben mantenerse
coherentes. Protege sus invariantes y anota los eventos de lo que ocurre.

`src/contexts/catalog/domain/aggregates/product.ts`

```ts
import { randomUUID } from "node:crypto";
import { AggregateRoot } from "../../../../shared/domain/aggregate-root.ts";
import type { DomainEvent } from "../../../../shared/domain/domain-event.ts";
import type { ProductCreated } from "../events/product-events.ts";
import { Price } from "../value-objects/price.ts";
import { ProductName } from "../value-objects/product-name.ts";

/** Estado del producto en tipos primitivos: es la forma en que se guarda y se reconstruye. */
export interface ProductProps {
  publicId: string;
  name: string;
  priceCents: number;
  createdAt: Date;
}

export interface NewProductInput {
  name: string;
  priceCents: number;
}

export interface ProductFactoryOptions {
  generateId?: () => string;
  now?: () => Date;
}

/**
 * Agregado Product: un producto del catálogo. Su nombre y su precio son objetos de valor, así que
 * no puede existir uno inválido, y al crearse anota el evento `product.created`.
 */
export class Product extends AggregateRoot {
  readonly publicId: string;
  private readonly productName: ProductName;
  private readonly productPrice: Price;
  readonly createdAt: Date;

  private constructor(
    props: { publicId: string; name: ProductName; price: Price; createdAt: Date },
    events: readonly DomainEvent[] = [],
  ) {
    super(events);
    this.publicId = props.publicId;
    this.productName = props.name;
    this.productPrice = props.price;
    this.createdAt = props.createdAt;
    Object.freeze(this);
  }

  /** Alta de un producto nuevo. Anota el evento `product.created`. */
  static create(input: NewProductInput, options: ProductFactoryOptions = {}): Product {
    const now = (options.now ?? (() => new Date()))();
    const publicId = (options.generateId ?? randomUUID)();
    const name = ProductName.create(input.name);
    const price = Price.create(input.priceCents);
    const created: ProductCreated = {
      name: "product.created",
      occurredAt: now,
      productId: publicId,
      productName: name.value,
      priceCents: price.cents,
    };
    return new Product({ publicId, name, price, createdAt: now }, [created]);
  }

  /** Reconstruye un producto ya guardado. No valida de nuevo ni anota eventos. */
  static restore(props: ProductProps): Product {
    return new Product({
      publicId: props.publicId,
      name: ProductName.restore(props.name),
      price: Price.restore(props.priceCents),
      createdAt: props.createdAt,
    });
  }

  get name(): string {
    return this.productName.value;
  }

  get priceCents(): number {
    return this.productPrice.cents;
  }

  toProps(): ProductProps {
    return {
      publicId: this.publicId,
      name: this.name,
      priceCents: this.priceCents,
      createdAt: this.createdAt,
    };
  }
}
```

- **Inmutable:** un método que cambie algo devolvería otro `Product`, heredando los eventos pendientes.
- **`create` valida y anota; `restore` no.** Reconstruir desde la base no debe repetir el evento.
- **Se guarda como primitivos:** `toProps()` devuelve `string`, `number` y `Date`; los objetos de valor no
  salen del dominio.
- Un agregado no referencia a otro por objeto, solo por identificador.

Prueba (`tests/unit/contexts/catalog/domain/product.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { Product } from "../../../../../src/contexts/catalog/domain/aggregates/product.ts";
import { errorOf } from "../../../../helpers/app-error.ts";

const AT = new Date("2026-11-15T10:00:00Z");
const options = { generateId: () => "p-1", now: () => AT };

describe("Product", () => {
  it("se crea con el nombre limpio y el precio en céntimos", () => {
    const product = Product.create({ name: "  Teclado ", priceCents: 4990 }, options);

    expect(product.toProps()).toEqual({
      publicId: "p-1",
      name: "Teclado",
      priceCents: 4990,
      createdAt: AT,
    });
  });

  it("no puede existir uno inválido", () => {
    expect(errorOf(() => Product.create({ name: " ", priceCents: 1 }))).toBe(
      "validation:INVALID_PRODUCT_NAME",
    );
    expect(errorOf(() => Product.create({ name: "A", priceCents: -1 }))).toBe(
      "validation:INVALID_PRODUCT_PRICE",
    );
  });

  it("al crearse anota product.created, una sola vez", () => {
    const product = Product.create({ name: "Teclado", priceCents: 4990 }, options);

    expect(product.pullEvents()).toEqual([
      {
        name: "product.created",
        occurredAt: AT,
        productId: "p-1",
        productName: "Teclado",
        priceCents: 4990,
      },
    ]);
    expect(product.pullEvents()).toEqual([]);
  });

  it("al reconstruirse desde la base no anota eventos", () => {
    const stored = Product.create({ name: "Teclado", priceCents: 1 }, options).toProps();

    expect(Product.restore(stored).pullEvents()).toEqual([]);
  });
});
```

## 4. La interfaz del repositorio

Un repositorio por agregado. Es una interfaz de `domain/`; quien la implemente vendrá después.

`src/contexts/catalog/domain/repositories/product.repository.ts`

```ts
import type { Product } from "../aggregates/product.ts";

export interface ProductRepository {
  /**
   * Guarda un producto nuevo y publica sus eventos de dominio.
   * Lanza AppError conflict PRODUCT_NAME_TAKEN si ya existe un producto con ese nombre.
   */
  add(product: Product): Promise<void>;
  list(): Promise<Product[]>;
}
```

Pon solo los métodos que vas a usar. El contrato incluye que **al guardar se publican los eventos** del
agregado.

## 5. El comando y la consulta

La aplicación separa lo que **cambia** el estado de lo que solo lo **lee**. Los archivos llevan el sufijo
`.command.ts` o `.query.ts` y el test de arquitectura lo comprueba.

El DTO es lo que sale de la aplicación, nunca el agregado:

`src/contexts/catalog/application/dtos/product-view.ts`

```ts
import type { Product } from "../../domain/aggregates/product.ts";

/** Lo que sale de la aplicación: datos planos, nunca el agregado. */
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

El comando carga o crea el agregado, le pide el cambio y lo guarda. No contiene reglas de negocio:

`src/contexts/catalog/application/commands/create-product.command.ts`

```ts
import { Product } from "../../domain/aggregates/product.ts";
import type { ProductRepository } from "../../domain/repositories/product.repository.ts";
import { type ProductView, toProductView } from "../dtos/product-view.ts";

export interface CreateProductInput {
  name: string;
  priceCents: number;
}

export class CreateProduct {
  private readonly products: ProductRepository;

  constructor(deps: { products: ProductRepository }) {
    this.products = deps.products;
  }

  /** El agregado valida y anota `product.created`; el repositorio lo publica al guardar. */
  async execute(input: CreateProductInput): Promise<ProductView> {
    const product = Product.create(input);
    await this.products.add(product);
    return toProductView(product);
  }
}
```

La consulta solo lee y no publica eventos (el test de arquitectura impide que una consulta llame a
`add`, `update`, `remove` o `publish`):

`src/contexts/catalog/application/queries/list-products.query.ts`

```ts
import type { ProductRepository } from "../../domain/repositories/product.repository.ts";
import { type ProductView, toProductView } from "../dtos/product-view.ts";

export class ListProducts {
  private readonly products: ProductRepository;

  constructor(deps: { products: ProductRepository }) {
    this.products = deps.products;
  }

  async execute(): Promise<ProductView[]> {
    return (await this.products.list()).map(toProductView);
  }
}
```

Prueba con un repositorio en memoria que publica eventos, como el real (`tests/helpers/product-fakes.ts`):

```ts
import type { Product } from "../../src/contexts/catalog/domain/aggregates/product.ts";
import type { ProductRepository } from "../../src/contexts/catalog/domain/repositories/product.repository.ts";
import { type EventBus, NULL_EVENT_BUS } from "../../src/shared/events/event-bus.ts";

/** Como el repositorio real, publica los eventos de los agregados que guarda. */
export class InMemoryProductRepository implements ProductRepository {
  readonly items: Product[] = [];
  private readonly events: EventBus;

  constructor(events: EventBus = NULL_EVENT_BUS) {
    this.events = events;
  }

  async add(product: Product): Promise<void> {
    this.items.push(product);
    await this.events.publish(product.pullEvents());
  }

  async list(): Promise<Product[]> {
    return [...this.items];
  }
}
```

## 6. La reacción al evento

Si algo debe ocurrir cuando se crea un producto (avisar, indexar, actualizar otro contexto), no se añade al
comando: se escribe un manejador. El comando no sabe que existe.

Lo que el manejador necesita del exterior es un puerto:

`src/contexts/catalog/application/ports/product-announcer.ts`

```ts
/** Hace saber que hay un producto nuevo (correo, chat, otro sistema…). */
export interface ProductAnnouncer {
  announce(product: { productId: string; name: string; priceCents: number }): Promise<void>;
}
```

`src/contexts/catalog/application/event-handlers/announce-new-product.ts`

```ts
import type { EventHandler } from "../../../../shared/events/event-bus.ts";
import type { ProductCreated } from "../../domain/events/product-events.ts";
import type { ProductAnnouncer } from "../ports/product-announcer.ts";

/** Cuando se crea un producto, lo anuncia. El comando que lo creó no sabe que esto existe. */
export function announceNewProduct(deps: {
  announcer: ProductAnnouncer;
}): EventHandler<ProductCreated> {
  return async (event) => {
    await deps.announcer.announce({
      productId: event.productId,
      name: event.productName,
      priceCents: event.priceCents,
    });
  };
}
```

Y el único lugar donde se ve qué reacciona a qué:

`src/contexts/catalog/application/event-handlers/subscribe.ts`

```ts
import type { InProcessEventBus } from "../../../../shared/events/event-bus.ts";
import type { ProductCreated } from "../../domain/events/product-events.ts";
import type { ProductAnnouncer } from "../ports/product-announcer.ts";
import { announceNewProduct } from "./announce-new-product.ts";

/** Único lugar donde se ve qué reacciona a cada evento del contexto catalog. */
export function subscribeCatalogEventHandlers(
  bus: InProcessEventBus,
  deps: { announcer: ProductAnnouncer },
): void {
  bus.subscribe<ProductCreated>("product.created", announceNewProduct(deps));
}
```

Pruebas del comando, de la consulta y de la reacción (`tests/unit/contexts/catalog/application/create-product.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { announceNewProduct } from "../../../../../src/contexts/catalog/application/event-handlers/announce-new-product.ts";
import { subscribeCatalogEventHandlers } from "../../../../../src/contexts/catalog/application/event-handlers/subscribe.ts";
import { CreateProduct } from "../../../../../src/contexts/catalog/application/commands/create-product.command.ts";
import { ListProducts } from "../../../../../src/contexts/catalog/application/queries/list-products.query.ts";
import type { ProductAnnouncer } from "../../../../../src/contexts/catalog/application/ports/product-announcer.ts";
import { InProcessEventBus } from "../../../../../src/shared/events/event-bus.ts";
import { RecordingEventBus } from "../../../../helpers/event-fakes.ts";
import { InMemoryProductRepository } from "../../../../helpers/product-fakes.ts";

class RecordingAnnouncer implements ProductAnnouncer {
  readonly announced: { productId: string; name: string; priceCents: number }[] = [];

  async announce(product: { productId: string; name: string; priceCents: number }) {
    this.announced.push(product);
  }
}

describe("CreateProduct", () => {
  it("guarda el producto, devuelve su vista y publica product.created", async () => {
    const events = new RecordingEventBus();
    const products = new InMemoryProductRepository(events);

    const view = await new CreateProduct({ products }).execute({
      name: "Teclado",
      priceCents: 4990,
    });

    expect(view).toMatchObject({ name: "Teclado", priceCents: 4990 });
    expect(events.names()).toEqual(["product.created"]);
  });

  it("si los datos no valen no se guarda ni se publica nada", async () => {
    const events = new RecordingEventBus();
    const products = new InMemoryProductRepository(events);

    await expect(
      new CreateProduct({ products }).execute({ name: "Teclado", priceCents: -5 }),
    ).rejects.toMatchObject({ code: "INVALID_PRODUCT_PRICE" });
    expect(products.items).toEqual([]);
    expect(events.published).toEqual([]);
  });
});

describe("ListProducts", () => {
  it("devuelve vistas públicas de lo guardado", async () => {
    const products = new InMemoryProductRepository();
    await new CreateProduct({ products }).execute({ name: "Teclado", priceCents: 4990 });

    expect(await new ListProducts({ products }).execute()).toMatchObject([{ name: "Teclado" }]);
  });
});

describe("reacción a product.created", () => {
  it("el manejador anuncia el producto con los datos del evento", async () => {
    const announcer = new RecordingAnnouncer();
    const bus = new InProcessEventBus();
    subscribeCatalogEventHandlers(bus, { announcer });
    const products = new InMemoryProductRepository(bus);

    await new CreateProduct({ products }).execute({ name: "Teclado", priceCents: 4990 });

    expect(announcer.announced).toMatchObject([{ name: "Teclado", priceCents: 4990 }]);
  });

  it("el manejador por sí solo se prueba con un evento escrito a mano", async () => {
    const announcer = new RecordingAnnouncer();

    await announceNewProduct({ announcer })({
      name: "product.created",
      occurredAt: new Date(),
      productId: "p-1",
      productName: "Teclado",
      priceCents: 100,
    });

    expect(announcer.announced).toEqual([{ productId: "p-1", name: "Teclado", priceCents: 100 }]);
  });
});
```

> **Este paso es opcional.** El ejemplo funciona sin él. Para activarlo hace falta un adaptador de
> `ProductAnnouncer` en `infrastructure/` y llamar a `subscribeCatalogEventHandlers(events, { announcer })`
> en la composición, como ya se hace con `subscribeIdentityEventHandlers`. Hoy los manejadores se ejecutan
> en el mismo proceso y dentro de la misma petición; si uno falla, el producto **ya está guardado**.

## 7. Los permisos

Cada contexto declara sus permisos, con su nombre en cada idioma. Aparecerán solos en `GET /permissions` y
se podrán asignar a cualquier rol.

`src/contexts/catalog/application/permissions.ts`

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

## 8. El esquema y el controlador

El esquema comprueba la **forma** de la petición. No repite las reglas del negocio: que el precio no sea
negativo lo decide el objeto de valor, en un solo sitio.

`src/contexts/catalog/presentation/schemas/product.schemas.ts`

```ts
import { z } from "zod";

/** Solo la forma de la petición. Las reglas del negocio las comprueban los objetos de valor. */
export const createProductSchema = z
  .object({
    name: z.string().max(500),
    priceCents: z.number().int(),
  })
  .strict();
```

El controlador traduce HTTP a comandos y consultas, y no contiene reglas de negocio:

`src/contexts/catalog/presentation/controllers/products.controller.ts`

```ts
import type { RequestHandler } from "express";
import { parseBody } from "../../../../shared/http/validate.ts";
import type { CreateProduct } from "../../application/commands/create-product.command.ts";
import type { ListProducts } from "../../application/queries/list-products.query.ts";
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

## 9. La tabla

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

## 10. El adaptador de base de datos

Implementa la interfaz del paso 4 con Prisma. Convierte entre filas y agregados y **publica los eventos
solo después de guardar**.

`src/contexts/catalog/infrastructure/database/prisma-product.repository.ts`

```ts
import { Prisma, type PrismaClient } from "../../../../generated/prisma/client.ts";
import { AppError } from "../../../../shared/errors/app-error.ts";
import { type EventBus, NULL_EVENT_BUS } from "../../../../shared/events/event-bus.ts";
import { Product } from "../../domain/aggregates/product.ts";
import type { ProductRepository } from "../../domain/repositories/product.repository.ts";

export class PrismaProductRepository implements ProductRepository {
  private readonly prisma: PrismaClient;
  private readonly events: EventBus;

  constructor(prisma: PrismaClient, events: EventBus = NULL_EVENT_BUS) {
    this.prisma = prisma;
    this.events = events;
  }

  async add(product: Product): Promise<void> {
    try {
      await this.prisma.product.create({ data: product.toProps() });
    } catch (error) {
      // P2002: se violó un índice único. Aquí el único es el del nombre.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("conflict", { code: "PRODUCT_NAME_TAKEN", cause: error });
      }
      throw error;
    }
    // Los eventos se publican solo después de guardar: si la escritura falla, no sale ninguno.
    await this.events.publish(product.pullEvents());
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

Traduce los errores de la base a errores de la aplicación (`P2002` → `PRODUCT_NAME_TAKEN`). Se prueba contra
Postgres real en `tests/integration/contexts/`; mira `identity/prisma-user-repository.test.ts` como modelo,
incluidos sus casos de "si falla el guardado no se publica nada".

## 11. Las rutas

Aquí se decide la URL, el permiso que exige cada operación y qué controlador la atiende.

`src/contexts/catalog/presentation/routes/products.routes.ts`

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

Si olvidas protegerla, la ruta queda pública: cada ruta debe llevar su permiso y su prueba del 401 y del 403
(`tests/acceptance/products.test.ts`):

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.ts";
import { CreateProduct } from "../../src/contexts/catalog/application/commands/create-product.command.ts";
import { PRODUCTS_PERMISSIONS } from "../../src/contexts/catalog/application/permissions.ts";
import { ListProducts } from "../../src/contexts/catalog/application/queries/list-products.query.ts";
import { createProductsRouter } from "../../src/contexts/catalog/presentation/routes/products.routes.ts";
import { GetUserAccess } from "../../src/contexts/identity/application/queries/get-user-access.query.ts";
import { Role } from "../../src/contexts/identity/domain/aggregates/role.ts";
import { User } from "../../src/contexts/identity/domain/aggregates/user.ts";
import { requireAuth } from "../../src/contexts/identity/presentation/middlewares/require-auth.ts";
import { createPermissionGuard } from "../../src/contexts/identity/presentation/middlewares/require-permission.ts";
import { PermissionRegistry } from "../../src/shared/permissions/permission.ts";
import { InMemoryUserRepository } from "../helpers/fakes.ts";
import { InMemoryProductRepository } from "../helpers/product-fakes.ts";
import { InMemoryRoleRepository, testRegistry } from "../helpers/role-fakes.ts";
import { FakeAccessTokenService } from "../helpers/session-fakes.ts";

async function build() {
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository(users);
  const registry = new PermissionRegistry([
    ...testRegistry()
      .groups()
      .flatMap((group) => group.permissions),
    ...PRODUCTS_PERMISSIONS,
  ]);
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

  it("rechaza un precio inválido con el código del objeto de valor y campos desconocidos con 400", async () => {
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

## 12. Los mensajes de error

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

## 13. La composición

El último paso es el único que toca un archivo existente con lógica: `src/composition.ts`. El repositorio
recibe el bus de eventos que ya existe.

```ts
import { PRODUCTS_PERMISSIONS } from "./contexts/catalog/application/permissions.ts";
import { CreateProduct } from "./contexts/catalog/application/commands/create-product.command.ts";
import { ListProducts } from "./contexts/catalog/application/queries/list-products.query.ts";
import { PrismaProductRepository } from "./contexts/catalog/infrastructure/database/prisma-product.repository.ts";
import { createProductsRouter } from "./contexts/catalog/presentation/routes/products.routes.ts";

// 1. Los permisos nuevos entran en el catálogo.
const permissions = new PermissionRegistry([
  ...AUTH_PERMISSIONS,
  ...USERS_PERMISSIONS,
  ...PRODUCTS_PERMISSIONS,
]);

// 2. El adaptador recibe el bus: así publica los eventos al guardar.
const products = new PrismaProductRepository(prisma, events);
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

Termina con `npm run verify`. El test de arquitectura confirmará que cada archivo está en su capa, que
`catalog` no importa el dominio de `identity` y que los objetos de valor y los eventos no dependen del
resto del dominio.

## Qué principio protege cada paso

| Principio                             | Dónde se ve en el ejemplo                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Responsabilidad única                 | Los objetos de valor validan, el agregado protege su coherencia, el comando coordina, el controlador traduce, el adaptador guarda    |
| Abierto/cerrado                       | Añadir `catalog` no modificó ningún archivo de `identity`. Reaccionar a un evento nuevo es añadir un manejador, no tocar el comando  |
| Sustitución de Liskov                 | `InMemoryProductRepository` y `PrismaProductRepository` cumplen la misma interfaz y los dos publican eventos                         |
| Segregación de interfaces             | El repositorio solo tiene `add` y `list`; el manejador solo ve el puerto `ProductAnnouncer`                                          |
| Inversión de dependencias             | El comando depende de `ProductRepository` (una interfaz de `domain/`), no de Prisma. La dependencia apunta hacia el dominio          |
| CQRS (separar escribir de leer)       | `CreateProduct` es un comando y `ListProducts` una consulta, en carpetas distintas y con la comprobación del test de arquitectura    |
| Desacoplar con eventos                | El comando no sabe quién reacciona a `product.created`; el manejador no sabe quién lo causó                                          |
| Validar en la frontera y en el núcleo | El esquema rechaza peticiones mal formadas; los objetos de valor garantizan que no existe un producto inválido, venga de donde venga |
| Mínimo privilegio                     | Cada ruta exige su permiso; leer y crear son permisos distintos                                                                      |

Sobre **CQRS**: aquí se aplica separar comandos y consultas, que no cuesta nada. No hay un modelo de lectura
aparte ni otra base de datos. Si una consulta llegara a necesitarlos, se cambiaría solo esa consulta.

## Lista de comprobación

- [ ] Los datos con reglas son objetos de valor, con `create` y `restore`.
- [ ] El agregado no se puede crear inválido, es inmutable y solo anota eventos de hechos que importan.
- [ ] El repositorio es una interfaz de `domain/` con solo los métodos que se usan, y publica los eventos
      después de guardar, nunca antes.
- [ ] Los comandos no tienen reglas de negocio; las consultas no escriben.
- [ ] Los comandos y las consultas devuelven DTO, no agregados.
- [ ] El contexto no importa el dominio de otro (R10).
- [ ] El esquema de entrada es `.strict()`.
- [ ] La unicidad y las claves foráneas están en la base de datos, no solo en el código.
- [ ] Ninguna respuesta expone el `id` interno ni datos sensibles; un evento con un secreto no se guarda ni
      se escribe en logs.
- [ ] Cada ruta lleva `authenticate` y su permiso, y hay pruebas del 401 y del 403.
- [ ] Los códigos de error nuevos tienen mensaje en español y en inglés.
- [ ] `npm run verify` pasa.
