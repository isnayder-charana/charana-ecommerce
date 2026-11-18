import { consumerNamed } from './deps.js';

/** Lambda conectada a la cola charanatech-notifications (fase 4, Terraform). */
export const handler = consumerNamed('notifications').handler;
