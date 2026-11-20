import { AwsSsmParametersReader, loadSsmEnv } from '../shared/load-ssm-env.js';

/**
 * Punto de entrada de las Lambdas de los workers (imagen apps/workers/Dockerfile).
 *
 * 1. Si hay SSM_PARAMETERS_PATH, copia los secretos de SSM a process.env.
 * 2. Arma el worker que dice WORKER (notifications, fulfillment u outbox-relay).
 * 3. Escucha en el puerto 8080: el Lambda Web Adapter le reenvía cada evento
 *    como POST /events.
 */
const ssmPath = process.env.SSM_PARAMETERS_PATH;
if (ssmPath) {
  const loaded = await loadSsmEnv(ssmPath, new AwsSsmParametersReader());
  console.log(`SSM: ${loaded.length} variables cargadas desde ${ssmPath}`);
}

// Import dinámico: los módulos validan las variables al cargarse, y para eso
// los secretos de SSM ya tienen que estar en process.env.
const [{ buildHandler }, { createEventServer }] = await Promise.all([
  import('./handlers.js'),
  import('../shared/event-server.js'),
]);

const worker = process.env.WORKER;
const port = Number(process.env.PORT ?? 8080);
createEventServer(buildHandler(worker, process.env)).listen(port, () => {
  console.log(`Worker ${worker} listo en el puerto ${port}`);
});
