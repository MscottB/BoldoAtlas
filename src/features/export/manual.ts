import { toRaw } from "vue";
import type { Puesto, Trabajador } from "@/db/tipos";
import { i18n } from "@/i18n";
import { datosDePuestos, datosDeUnidades } from "@/features/arbol/datosNodo";
import { indiceHijos, ruta } from "@/features/arbol/jerarquia";
import { useOrganizacion } from "@/stores/organizacion";
import { unidadesDe, type Alcance } from "./preparar";

/** Un puesto en la tabla de su unidad. `titular` y `reemplazo` solo van con personas. */
export interface PuestoManual {
  cargo: string;
  descripcion: string | null;
  /** Ocupado = con titular vigente; un reemplazo no lo ocupa, como en la dotación. */
  estado: "ocupado" | "vacante";
  titular?: string;
  reemplazo?: string;
}

/** Una sección del manual. `jefatura`, el nombre de quien la ejerce, solo va con personas. */
export interface UnidadManual {
  id: string;
  /** «1», «1.1», «1.2», «1.2.1»… en el orden del árbol, desde la raíz del alcance. */
  numero: string;
  nombre: string;
  /** Los nombres de sus superiores, desde la raíz de la organización (también con una rama como alcance). */
  ruta: string[];
  jefatura?: string;
  puestos: PuestoManual[];
}

/** Los textos fijos del manual, ya traducidos: el worker no tiene i18n. */
export interface TextosManual {
  indice: string;
  general: string;
  jefatura: string;
  cargo: string;
  descripcion: string;
  ocupa: string;
  estado: string;
  ocupado: string;
  vacante: string;
  sinDescripcion: string;
  reemplazo: string;
}

export function textosManual(): TextosManual {
  const t = i18n.global.t;
  return {
    indice: t("manual.indice"),
    general: t("manual.general"),
    jefatura: t("manual.jefatura"),
    cargo: t("manual.cargo"),
    descripcion: t("manual.descripcion"),
    ocupa: t("manual.ocupa"),
    estado: t("manual.estado"),
    ocupado: t("manual.ocupado"),
    vacante: t("manual.vacante"),
    sinDescripcion: t("manual.sinDescripcion"),
    reemplazo: t("manual.reemplazo"),
  };
}

/**
 * Las unidades del alcance en el orden del árbol (cada una antes que sus hijas; los hermanos, en el orden del lienzo),
 * a la fecha que se ve, con sus puestos. Jefatura, titular y reemplazo salen de `datosNodo.ts`, como en el lienzo. Sin
 * personas, los nombres ni se leen: no se pasa ninguna persona.
 */
export function datosManual(o: { alcance: Alcance; conPersonas: boolean }): UnidadManual[] {
  const org = useOrganizacion();
  const e = toRaw(org.enFecha);
  const todas = toRaw(e.unidades);
  const unidades = unidadesDe(todas, o.alcance);
  const enAlcance = new Set(unidades.map((x) => x.id));
  const puestos = (toRaw(e.puestos) as (Puesto & { deleted_at?: string | null })[])
    .filter((x) => !x.deleted_at && enAlcance.has(x.unidad_id))
    .sort((x, y) => x.orden - y.orden);
  const trabajadores = o.conPersonas
    ? new Map(toRaw(e.trabajadores).map((w) => [w.id, w]))
    : new Map<string, Trabajador>();
  const cargos = new Map(toRaw(org.catalogos).cargos.map((c) => [c.id, c.nombre]));
  const datosPuesto = datosDePuestos(puestos, e.vigentes, trabajadores, cargos);
  const jefes = o.conPersonas
    ? datosDeUnidades({
        unidades,
        puestos,
        vigentes: e.vigentes,
        trabajadores,
        cargos,
        dotaciones: new Map(),
        etiquetas: new Map(),
      })
    : null;
  const porUnidad = new Map<string, PuestoManual[]>();
  for (const x of puestos) {
    const d = datosPuesto.get(x.id)!;
    const fila: PuestoManual = {
      cargo: d.cargo,
      descripcion: x.descripcion,
      estado: e.vigentes.get(x.id)?.titular ? "ocupado" : "vacante",
      ...(d.titular ? { titular: d.titular } : {}),
      ...(d.reemplazo ? { reemplazo: d.reemplazo } : {}),
    };
    porUnidad.set(x.unidad_id, [...(porUnidad.get(x.unidad_id) ?? []), fila]);
  }

  const indice = indiceHijos(unidades);
  const res: UnidadManual[] = [];
  const recorrer = (padre: string | null, prefijo: string, camino: string[]) =>
    (indice.get(padre) ?? []).forEach((x, i) => {
      const numero = prefijo ? `${prefijo}.${i + 1}` : String(i + 1);
      const jefe = jefes?.get(x.id)?.jefe?.nombre;
      res.push({
        id: x.id,
        numero,
        nombre: x.nombre,
        ruta: camino,
        ...(jefe ? { jefatura: jefe } : {}),
        puestos: porUnidad.get(x.id) ?? [],
      });
      recorrer(x.id, numero, [...camino, x.nombre]);
    });
  // Con una rama, la ruta empieza en sus superiores, fuera del alcance.
  const sobre =
    o.alcance === "todo"
      ? []
      : ruta(todas, o.alcance.rama)
          .slice(0, -1)
          .map((x) => x.nombre);
  recorrer(null, "", sobre);
  return res;
}
