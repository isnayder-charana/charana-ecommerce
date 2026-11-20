# Imagen de los workers para AWS Lambda (paso 31). Se construye desde la RAÍZ del repo:
#
#   docker build --platform linux/amd64 --provenance=false -f apps/workers/Dockerfile -t charanatech-workers .
#
# UNA imagen para las tres Lambdas (notifications, fulfillment y outbox-relay):
# la variable WORKER, que pone Terraform, elige cuál es cada una.
#
# Usamos el mismo Lambda Web Adapter que la API, en modo "eventos": recibe el
# evento de Lambda (un lote de SQS o de DynamoDB Streams) y lo reenvía como
# POST /events a src/lambda/server.ts. Así corre en Node 26, igual que la API,
# aunque Lambda todavía no tenga un runtime administrado de Node 26 estable.

# --- 1. Compilar -------------------------------------------------------------
FROM node:26.13.0-slim AS build
RUN npm install --global pnpm@12.18.0
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/workers/package.json apps/workers/
RUN pnpm install --frozen-lockfile --filter @charanatech/workers...

COPY tsconfig.base.json ./
COPY apps/workers apps/workers
RUN pnpm --filter @charanatech/workers build \
 && pnpm --filter @charanatech/workers deploy --prod --ignore-scripts --legacy /out

# --- 2. Imagen final (sin compiladores ni devDependencies) -------------------
FROM node:26.13.0-slim

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    AWS_LWA_PORT=8080 \
    AWS_LWA_READINESS_CHECK_PATH=/health \
    AWS_LWA_PASS_THROUGH_PATH=/events

COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/workers/dist ./dist

USER node
EXPOSE 8080
CMD ["node", "dist/lambda/server.js"]
