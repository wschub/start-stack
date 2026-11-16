# Instrucciones de uso de start-stack

> Documento de trabajo con los comandos en el orden en que se usan. Se irá ampliando con cada comando
> nuevo. La documentación definitiva y la publicación del paquete vienen después.

## 1. Preparar el comando (una vez)

El paquete aún no está en npm, así que se usa desde este repositorio. Requiere Node 24 y, para la base de
datos y las pruebas de integración, Docker corriendo.

```bash
cd start-stack/cli
npm install
npm run build && npm link      # deja disponible el comando `start-stack` en tu máquina
```

Sin enlazarlo, se puede ejecutar directo desde cualquier carpeta:

```bash
node /ruta/a/start-stack/cli/src/bin.ts <comando>
```

## 2. Crear un proyecto

Se ejecuta en la carpeta **donde quieras que se cree** el proyecto (se crea una subcarpeta con su nombre).

```bash
start-stack create <nombre> [opciones]
```

Sin opciones abre el asistente y pregunta todo (tipo, arquitectura, lenguaje, autenticación, frontend,
gestor de paquetes, Docker, git, instalación y base de datos). Las opciones que aún no existen aparecen
como "coming soon" y no se pueden elegir.

| Opción                                   | Efecto                                                       |
| ---------------------------------------- | ------------------------------------------------------------ |
| `--architecture <hexagonal\|ddd\|clean>` | Arquitectura del proyecto (por defecto `hexagonal`)          |
| `--no-docker`                            | Sin Dockerfile ni contenedor de la API                       |
| `--no-git`                               | No inicializa git                                            |
| `--no-install`                           | No instala dependencias                                      |
| `--no-database`                          | No levanta Postgres ni crea el superadministrador            |
| `-y`, `--yes`                            | Sin preguntas: usa los valores por defecto de lo no indicado |
| `--dry-run`                              | Lista lo que crearía y no escribe nada                       |

Ejemplos:

```bash
start-stack create tienda-productos                          # asistente
start-stack create tienda-productos -y --architecture ddd    # sin preguntas
start-stack create tienda-productos --dry-run                # solo ver qué crearía
```

Si hay Docker, el asistente puede levantar Postgres (primer puerto libre desde 55432), aplicar las
migraciones y crear el superadministrador. La contraseña se pasa al proyecto por variable de entorno
(`ADMIN_EMAIL` y `ADMIN_PASSWORD` si usas `-y`), nunca como argumento.

## 3. Arrancar el proyecto

```bash
cd tienda-productos
npm run dev                    # servidor con recarga
```

Después abre `http://localhost:3000/health/ready`. Si no se creó el superadministrador durante el
asistente: `npm run admin:create`.

Otros comandos del proyecto generado:

```bash
npm run verify                 # lint + formato + tipos + todas las pruebas (la integración necesita Docker)
npm run test:unit | test:acceptance | test:integration
docker compose up -d           # solo la base de datos
```

## 4. Añadir un módulo

Se ejecuta en la raíz del proyecto generado (donde está `.scaffold.json`).

```bash
start-stack add module <nombre> [opciones]
```

| Opción                  | Efecto                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `--entity <nombre>`     | Nombre de la entidad en singular (por defecto, el del módulo)                                 |
| `--field <nombre:tipo>` | Un campo; se repite. Tipos: `string`, `int`, `boolean`, `datetime`. Por defecto `name:string` |
| `--migrate`             | Crea también la migración de Prisma (necesita la base de datos arriba)                        |
| `--dry-run`             | Lista lo que cambiaría y no escribe nada                                                      |

Ejemplo:

```bash
start-stack add module products --entity product \
  --field name --field priceCents:int --field active:boolean --migrate
```

Qué hace, según la arquitectura del proyecto:

- **hexagonal:** un módulo en `src/modules/<nombre>/` con sus cuatro capas.
- **ddd:** un contexto nuevo en `src/contexts/<nombre>/`, con agregado y evento `<entidad>.created`.
- **clean:** una pieza en cada capa (`entities`, `use-cases`, `interface-adapters`, `frameworks`).

En las tres genera crear y listar, los permisos `<nombre>:read` y `<nombre>:manage`, el modelo y el
repositorio de Prisma, los mensajes de error (es y en) y las pruebas (unitarias, de aceptación y de
integración con Postgres real). Lo conecta insertando código encima
de los comentarios `// start-stack:<marcador>` de `src/composition.ts`, del catálogo de mensajes y de
`prisma/schema.prisma`: **no borres ni muevas esos comentarios**. Si falta alguno, o algún archivo ya
existe, se detiene sin escribir nada.

Después del comando:

1. Sin `--migrate`, ejecuta la migración que te imprime: `npx prisma migrate dev --name add_<nombre>`
   (con la base de datos arriba). **Hasta que exista la migración, `npm run verify` falla**: la prueba de
   integración del módulo necesita su tabla.
2. Asigna los permisos nuevos a un rol (el superadministrador los recibe solo).
3. `npm run verify`.

## 5. Comprobar el proyecto

```bash
start-stack doctor
```

No escribe nada. Se ejecuta en la raíz del proyecto y comprueba que `add module` puede seguir trabajando:

- **Errores** (código de salida 1): falta o está repetido algún marcador `// start-stack:*`; el manifiesto
  lista un módulo sin carpeta; un módulo añadido no tiene su modelo en `prisma/schema.prisma` o no está
  registrado y montado en `src/composition.ts`.
- **Avisos**: una carpeta de módulo que no está en el manifiesto; un módulo sin migración que cree su tabla.

## 6. Todavía no existen

`add` para otras piezas que no sean `module` (lectura por id, actualización, borrado, extender un
contexto DDD existente), patrones, otros lenguajes y bases de datos, frontend y la publicación en npm.

## 7. Para quien desarrolla el CLI

```bash
cd cli
npm run verify                 # lint + formato + tipos + pruebas unitarias
npm run test:e2e               # genera cada arquitectura, añade un módulo con migración, ejecuta `doctor` y su verify (Docker, ~4 min)
```

Cada maqueta (`hex-mockup`, `ddd-mockup`, `clean-mockup`) es la plantilla de su arquitectura: lo que se
cambia ahí es lo que el CLI genera. Se prueban desde su carpeta con `npm run verify`.
