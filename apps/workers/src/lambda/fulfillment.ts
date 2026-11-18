import { consumerNamed } from './deps.js';

/** Lambda conectada a la cola charanatech-fulfillment (fase 4, Terraform). */
export const handler = consumerNamed('fulfillment').handler;
