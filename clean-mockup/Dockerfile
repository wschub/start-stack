# syntax=docker/dockerfile:1

FROM node:24-slim AS base
WORKDIR /app

# Todas las dependencias (también las de desarrollo): hacen falta para compilar y para migrar.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Compilación: genera el cliente de Prisma y transpila TypeScript a dist/.
FROM deps AS build
COPY tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
# Solo para generar el cliente: prisma generate no se conecta a la base de datos.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run db:generate && npm run build

# Migraciones: imagen aparte con el CLI de Prisma, para ejecutarlas antes de desplegar la API.
FROM deps AS migrate
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY prisma.config.ts ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

# Solo las dependencias de producción.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Imagen final: lo mínimo para ejecutar la API, sin privilegios.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main/server.js"]
