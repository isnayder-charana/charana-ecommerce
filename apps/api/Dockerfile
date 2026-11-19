# Imagen de la API para AWS Lambda (paso 30). Se construye desde la RAÍZ del repo:
#
#   docker build --platform linux/amd64 --provenance=false -f apps/api/Dockerfile -t charanatech-api .
#
# Lambda Web Adapter deja correr la API como un servidor HTTP normal (app.listen):
# traduce cada invocación de Lambda en una petición HTTP a localhost:8080.
# Así el código es el mismo en tu PC, en Docker y en Lambda.

# --- 1. Compilar -------------------------------------------------------------
FROM node:26.13.0-slim AS build
RUN npm install --global pnpm@12.18.0
WORKDIR /repo

# Primero solo los manifiestos: si no cambian, Docker reutiliza la capa de
# `pnpm install` y la siguiente construcción tarda segundos.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter @charanatech/api...

COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN pnpm --filter @charanatech/api build \
 && pnpm --filter @charanatech/api deploy --prod --ignore-scripts --legacy /out

# --- 2. Imagen final (sin compiladores ni devDependencies) -------------------
FROM node:26.13.0-slim

# La extensión de Lambda Web Adapter: Lambda la arranca sola desde /opt/extensions.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    AWS_LWA_PORT=8080 \
    AWS_LWA_READINESS_CHECK_PATH=/api/health

# Autoridad que firma los certificados de RDS en us-east-2: la API solo confía
# en ella para hablar con MySQL por TLS (DATABASE_URL ?sslcert=/app/certs/rds-ca.pem).
ADD https://truststore.pki.rds.amazonaws.com/us-east-2/us-east-2-bundle.pem /app/certs/rds-ca.pem
RUN chmod 755 /app/certs && chmod 644 /app/certs/rds-ca.pem

COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist

# Lambda ejecuta la imagen con un usuario sin privilegios; aquí hacemos lo mismo.
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
