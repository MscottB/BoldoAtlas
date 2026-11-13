import type { Sentencia } from "@/db/cliente";

/** Claves que escribe la app: `org_nombre`, `logo_png`, `revision_bien` (JSON de las marcas «Así está bien»). */
export function guardarMeta(clave: string, valor: string): Sentencia[] {
  return [
    {
      sql: "INSERT INTO meta (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
      params: [clave, valor],
    },
  ];
}
