# start-stack

[English](README.md)

Genera un backend Node.js + TypeScript listo para producción: eliges una arquitectura, respondes unas
preguntas y obtienes un proyecto probado (Express, Prisma, PostgreSQL) con autenticación, roles y permisos,
Docker, CI y una suite de pruebas en verde.

```bash
npx start-stack create mi-api
# o
npm create start-stack mi-api
```

> **Estado:** v0.1, en desarrollo. Aún no está publicado en npm: mira [INSTRUCCIONES.md](INSTRUCCIONES.md)
> para ejecutarlo desde este repositorio.

## Arquitecturas

| Arquitectura | Organización                                                                        |
| ------------ | ----------------------------------------------------------------------------------- |
| `hexagonal`  | puertos y adaptadores, organizada por módulos                                       |
| `ddd`        | contextos delimitados, agregados, objetos de valor, eventos de dominio              |
| `clean`      | entidades, casos de uso, adaptadores de interfaz, frameworks (regla de dependencia) |

Las tres exponen el mismo contrato HTTP, así que se pueden comparar de lado a lado.

## Comandos

- `start-stack create <nombre>`: genera un proyecto (asistente interactivo o banderas).
- `start-stack add module <nombre>`: añade una pieza completa y probada (entidad, casos de uso, rutas,
  permisos, modelo de Prisma, pruebas) con la organización de tu arquitectura.
- `start-stack add pattern outbox`: añade el patrón _outbox_ transaccional.
- `start-stack doctor`: comprobación de solo lectura de que el manifiesto y el código coinciden.

La referencia completa está en [`cli/README.md`](cli/README.md) (en inglés).

## Estructura del repositorio

| Carpeta               | Qué es                                                          |
| --------------------- | --------------------------------------------------------------- |
| `cli/`                | el comando `start-stack`                                        |
| `create-start-stack/` | envoltorio para que funcione `npm create start-stack`           |
| `hex-mockup/`         | proyecto de referencia hexagonal: la plantilla que copia el CLI |
| `ddd-mockup/`         | proyecto de referencia DDD                                      |
| `clean-mockup/`       | proyecto de referencia Clean Architecture                       |

Los proyectos de referencia son aplicaciones completas y probadas. El CLI genera a partir de ellos y una
prueba de oro comprueba que lo generado coincide con ellos.

## Contribuir

Cada carpeta es un proyecto npm: ejecuta `npm run verify` dentro de ella (las pruebas de integración
necesitan Docker). Los commits van en español con el estilo `feat(ámbito): ...`. Los hooks de git están en
`.githooks/`.

## Licencia

[MIT](LICENSE)
