// Lo que devuelve Rust (src-tauri/src/historial.rs), en snake_case como lo serializa.

export interface FilaBreve {
  tabla: string;
  fila_id: string;
  op: "insert" | "update" | "delete";
  /** De un `update`: las columnas que cambió. */
  campos: string[];
  /** El nombre que se muestra: un puesto por su cargo, una asignación por su persona. */
  nombre: string | null;
  nombre_antes: string | null;
  nombre_despues: string | null;
  /** Un `update` que deja `deleted_at` con fecha. */
  elimina: boolean;
}

export interface AccionBreve {
  id: string;
  fecha: string;
  origen: "app" | "importar" | "revisar" | "suprimir";
  /** `archivo` al importar o revisar; `id` de la persona al suprimir. */
  datos: { archivo?: string; id?: string };
  estado: "hecha" | "deshecha";
  bloqueada: boolean;
  filas: number;
  /** Las 3 primeras filas; primero lo que crea, elimina o restaura. */
  muestra: FilaBreve[];
}

export interface Punteros {
  deshacer: AccionBreve | null;
  rehacer: AccionBreve | null;
}

export type Traducir = (clave: string, valores?: Record<string, unknown>, plural?: number) => string;
