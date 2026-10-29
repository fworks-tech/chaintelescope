# -----------------------------------------------------------
# STAGE 1: Builder
# -----------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@12.6.0

# Copia manifests de workspaces
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Instala todas as dependências do monorepo
RUN pnpm install --frozen-lockfile

# Copia código fonte
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build de tipos e compilação
RUN pnpm --filter @hasheyes/shared build
RUN pnpm --filter @hasheyes/api build

# Isola os artefatos de produção em uma pasta separada
RUN pnpm --filter @hasheyes/api deploy --prod /prod/api

# -----------------------------------------------------------
# STAGE 2: Distroless Runtime
# -----------------------------------------------------------
FROM gcr.io/distroless/nodejs20-debian12:nonroot

WORKDIR /app
COPY --from=builder /prod/api /app

USER nonroot
EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

CMD ["dist/index.js"]