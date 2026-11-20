import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';

/**
 * En Lambda no hay archivo .env: los secretos viven en SSM Parameter Store
 * (paso 29) bajo una ruta como /charanatech/prod. Esta función los lee al
 * arrancar y los copia a process.env ANTES de validar las variables.
 * (Es la misma función que usa la API en apps/api/src/config.)
 *
 *   /charanatech/prod/internal-api-key    →  INTERNAL_API_KEY
 *
 * Una variable que ya existe en el entorno gana: así se puede sobrescribir
 * un valor sin tocar SSM (por ejemplo, para una prueba).
 */
export interface SsmParametersReader {
  /** Devuelve todos los parámetros (descifrados) que cuelgan de `path`. */
  readByPath(path: string): Promise<Array<{ name: string; value: string }>>;
}

export function envNameFromParameter(name: string): string {
  const last = name.split('/').filter(Boolean).at(-1) ?? '';
  return last.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}

export async function loadSsmEnv(
  path: string,
  reader: SsmParametersReader,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const loaded: string[] = [];
  for (const { name, value } of await reader.readByPath(path)) {
    const key = envNameFromParameter(name);
    if (!key || env[key] !== undefined) continue;
    env[key] = value;
    loaded.push(key);
  }
  return loaded;
}

/** Adaptador real: SDK de AWS. En Lambda usa las credenciales del rol. */
export class AwsSsmParametersReader implements SsmParametersReader {
  constructor(private readonly client = new SSMClient({})) {}

  async readByPath(path: string): Promise<Array<{ name: string; value: string }>> {
    const parameters: Array<{ name: string; value: string }> = [];
    let nextToken: string | undefined;
    do {
      const page = await this.client.send(
        new GetParametersByPathCommand({
          Path: path,
          WithDecryption: true,
          NextToken: nextToken,
        }),
      );
      for (const parameter of page.Parameters ?? []) {
        if (parameter.Name && parameter.Value !== undefined) {
          parameters.push({ name: parameter.Name, value: parameter.Value });
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);
    return parameters;
  }
}
