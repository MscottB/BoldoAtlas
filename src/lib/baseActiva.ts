// La base con que trabaja la interfaz. Sin Tauri: quien la use sigue funcionando en las pruebas con `vi.mock("@/db/cliente")`.
let actual = "";
let cambiando = false;
const alSoltar = new Set<() => void>();

export const baseActual = (): string => actual;
export const fijarBase = (id: string): void => {
  actual = id;
};

/** Lo que la app guarda atado a la base abierta se suelta aquí al cambiar de base. */
export const alSoltarDatos = (f: () => void): void => void alSoltar.add(f);
export const soltarDatos = (): void => alSoltar.forEach((f) => f());

/** Una respuesta de una base que ya no es la activa: se descarta, y no es un error que mostrar. */
export class BaseCambiada extends Error {
  constructor() {
    super("base_cambiada");
    this.name = "BaseCambiada";
  }
}

/** Desde que Rust puede estar en otra base hasta que la interfaz la fija: en ese lapso, `otra_base` no es una falla. */
export const marcarCambio = (activo: boolean): void => {
  cambiando = activo;
};
export const enCambio = (): boolean => cambiando;
