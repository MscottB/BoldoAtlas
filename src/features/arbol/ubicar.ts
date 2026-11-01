import type { Puesto, Trabajador, Unidad } from "@/db/tipos";
import { normalizarTexto } from "@/lib/texto";
import type { Vigentes } from "./jerarquia";
import { jefeEnTarjeta, type ConfigVista } from "./vista";

/** Un puesto donde la persona tiene una asignación vigente: como titular o como reemplazo. */
export interface Ubicacion {
  puestoId: string;
  unidadId: string;
  cargoId: string;
  reemplazo: boolean;
}

/**
 * Los puestos vigentes de cada persona, en una pasada por los puestos. La fecha ya viene resuelta en `vigentes`
 * (los de hoy o los del día que muestra el lienzo): así sirve para «ver a una fecha».
 */
export function puestosPorPersona(
  puestos: (Puesto & { deleted_at?: string | null })[],
  vigentes: Vigentes,
): Map<string, Ubicacion[]> {
  const m = new Map<string, Ubicacion[]>();
  for (const p of puestos) {
    if (p.deleted_at) continue;
    const v = vigentes.get(p.id);
    for (const a of [v?.titular, v?.reemplazo]) {
      if (!a) continue;
      const u = {
        puestoId: p.id,
        unidadId: p.unidad_id,
        cargoId: p.cargo_id,
        reemplazo: a.tipo === "reemplazo",
      };
      const lista = m.get(a.trabajador_id);
      if (lista) lista.push(u);
      else m.set(a.trabajador_id, [u]);
    }
  }
  return m;
}

/** Nombre y correo de cada persona ya normalizados: buscar es un `includes` por persona, sin renormalizar por tecla. */
export const indicePersonas = (trabajadores: Trabajador[]) =>
  trabajadores.map((t) => ({
    id: t.id,
    nombre: normalizarTexto(t.nombre),
    correo: normalizarTexto(t.correo ?? ""),
  }));

/**
 * Unidades donde una persona con puesto vigente (titular o reemplazo) tiene el texto en su nombre o correo; null sin
 * texto. Una pasada por las personas más sus puestos: O(n).
 */
export function unidadesConPersona(
  texto: string,
  indice: ReturnType<typeof indicePersonas>,
  porPersona: Map<string, Ubicacion[]>,
): Set<string> | null {
  const buscado = normalizarTexto(texto);
  if (!buscado) return null;
  const res = new Set<string>();
  for (const p of indice)
    if (p.nombre.includes(buscado) || p.correo.includes(buscado))
      for (const u of porPersona.get(p.id) ?? []) res.add(u.unidadId);
  return res;
}

/** El puesto tiene su propia tarjeta en el lienzo: «Ver puestos» encendido y no es la jefatura que va en la tarjeta. */
export const puestoConTarjeta = (
  p: Pick<Puesto, "id">,
  u: Pick<Unidad, "jefe_puesto_id">,
  c: Pick<ConfigVista, "verPuestos" | "densidad" | "personasEnTarjetas" | "mostrarJefe" | "colorearPor">,
) => c.verPuestos && !(u.jefe_puesto_id === p.id && jefeEnTarjeta(c));
