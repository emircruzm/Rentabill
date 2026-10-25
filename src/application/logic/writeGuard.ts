/**
 * writeGuard.ts
 * Punto único de control en la capa application para interceptar operaciones de escritura
 * cuando el modo de prueba de roles (isTestingRole) está activo.
 *
 * Garantiza que ninguna mutación (RPC, insert, update, delete, upsert, upload a Storage)
 * llegue a la base de datos o almacenamiento remoto durante la prueba de roles.
 */

export interface WriteGuardOptions<T> {
  /**
   * Operación simulada a ejecutar cuando isTestingRole es true.
   * Debe retornar un resultado con la misma estructura y tipos que la operación real
   * (o actualizar el estado local en memoria).
   */
  onSimulate: () => T | Promise<T>;

  /**
   * Operación de escritura real hacia la capa data / backend.
   * Solo se ejecuta cuando isTestingRole es false.
   */
  onRealWrite: () => Promise<T>;

  /**
   * Función opcional para notificar al usuario (toast / alerta).
   * Muestra el mensaje reglamentario "Modo prueba: nada se guardó".
   */
  notifyTestMode?: (message: string, subtext?: string) => void;

  /**
   * Mensaje descriptivo adicional para el subtexto del aviso.
   */
  actionDescription?: string;

  /**
   * Bandera explícita para forzar o consultar el estado de prueba de rol.
   * Si no se envía, consulta el estado global en memoria del guardia.
   */
  isTestingRole?: boolean;
}

let _isTestingRoleGlobal = false;

export function setTestingRoleGlobal(active: boolean): void {
  _isTestingRoleGlobal = active;
}

export function isTestingRoleGlobal(): boolean {
  return _isTestingRoleGlobal;
}

export async function runWrite<T>(options: WriteGuardOptions<T>): Promise<T> {
  const isTesting = options.isTestingRole !== undefined ? options.isTestingRole : _isTestingRoleGlobal;

  if (isTesting) {
    if (options.notifyTestMode) {
      options.notifyTestMode(
        'Modo prueba: nada se guardó',
        options.actionDescription || 'Esta operación no se guardó en la base de datos'
      );
    }
    return await options.onSimulate();
  }

  return await options.onRealWrite();
}
