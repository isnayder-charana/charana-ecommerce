# apps/workers

Consumidores de los eventos de pedidos (fase 3). Cada uno lee su cola SQS:

| Worker          | Cola                        | Qué hace                                                       |
| --------------- | --------------------------- | -------------------------------------------------------------- |
| `notifications` | `charanatech-notifications` | Avisa al cliente de cada cambio (correo con SES en el paso 24) |
| `fulfillment`   | `charanatech-fulfillment`   | Simula el envío del pedido (paso 25)                           |

En AWS son Lambdas (`src/lambda/server.ts`, una imagen para todas; ver `docs/pasos/31-eventos-en-aws.md`) conectadas a las colas. En tu PC, `pnpm dev` corre un
corredor (`src/local.ts`) que hace lo mismo contra LocalStack. Explicación completa en
`docs/pasos/23-workers.md`.
