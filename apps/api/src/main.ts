import 'reflect-metadata';
import { AwsSsmParametersReader, loadSsmEnv } from './config/load-ssm-env.js';
import type { Env } from './config/env.js';

async function bootstrap(): Promise<void> {
  // En AWS (paso 30) los secretos vienen de SSM Parameter Store. Hay que leerlos
  // ANTES de importar AppModule: ConfigModule.forRoot valida las variables en
  // cuanto se carga el módulo, y sin ellas la app no arrancaría.
  const ssmPath = process.env.SSM_PARAMETERS_PATH;
  if (ssmPath) {
    const loaded = await loadSsmEnv(ssmPath, new AwsSsmParametersReader());
    console.log(`SSM: ${loaded.length} variables cargadas desde ${ssmPath}`);
  }

  const [{ NestFactory }, { ConfigService }, { AppModule }, { configureApp }] = await Promise.all([
    import('@nestjs/core'),
    import('@nestjs/config'),
    import('./app.module.js'),
    import('./configure-app.js'),
  ]);

  // rawBody: guarda también el cuerpo original de cada petición. El webhook de Stripe
  // lo necesita para verificar la firma (el JSON re-serializado no sería idéntico).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  app.enableShutdownHooks();

  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
