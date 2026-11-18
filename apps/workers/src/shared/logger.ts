/** Lo mínimo que necesitan los workers para escribir en el log (CloudWatch en AWS). */
export interface Logger {
  info(message: string): void;
  error(message: string): void;
}

/** Log por consola con el nombre del worker delante: `[notifications] …`. */
export function consoleLogger(name: string): Logger {
  return {
    info: (message) => console.log(`[${name}] ${message}`),
    error: (message) => console.error(`[${name}] ${message}`),
  };
}
