import type { Etiqueta, Leyenda, Puesto, Trabajador, Unidad } from "@/db/tipos";
import { etiquetaEscala, type Traducir, type ValorEscala } from "./escala";
import {
  indiceHijos,
  jefeVisible,
  personasPorUnidad,
  rutaSuperiores,
  type Marca,
  type PersonasDeUnidad,
  type Vigentes,
} from "./jerarquia";

// Lo que muestra cada tarjeta del lienzo, en funciones puras: lo usan el lienzo (VistaArbol) y la imagen (export/niveles).

/** Los datos de la tarjeta de una unidad (NodoUnidad). */
export interface DatosNodo extends PersonasDeUnidad {
  unidad: Unidad;
  jefe: Trabajador | null;
  /** La jefatura la cubre un reemplazo: el puesto no tiene titular vigente. */
  jefeReemplazo: boolean;
  total: number;
  vacantes: number;
  etiquetas: Etiqueta[];
  hijos: number;
}

/** Los datos de la tarjeta de un puesto (NodoPuesto). */
export interface DatosPuesto {
  cargo: string;
  titular: string | null;
  reemplazo: string | null;
  leyendaId: string | null;
}

type ConBorrado<T> = T & { deleted_at?: string | null };

/** Unidad → sus etiquetas, en el orden de las relaciones. */
export function etiquetasPorUnidad(
  etiquetas: Etiqueta[],
  relaciones: { unidad_id: string; etiqueta_id: string }[],
): Map<string, Etiqueta[]> {
  const porId = new Map(etiquetas.map((e) => [e.id, e]));
  const m = new Map<string, Etiqueta[]>();
  for (const { unidad_id, etiqueta_id } of relaciones) {
    const e = porId.get(etiqueta_id);
    if (e) m.set(unidad_id, [...(m.get(unidad_id) ?? []), e]);
  }
  return m;
}

/**
 * `DatosNodo` de cada unidad, a la fecha de `vigentes`. `unidades`: todas las que pueden dibujarse (de ellas sale `hijos`);
 * `dotaciones`: las de `dotacionPorUnidad` sobre esas mismas unidades.
 */
export function datosDeUnidades(o: {
  unidades: Unidad[];
  puestos: ConBorrado<Puesto>[];
  vigentes: Vigentes;
  trabajadores: Map<string, Trabajador>;
  cargos: Map<string, string>;
  dotaciones: ReadonlyMap<string, { total: number; vacantes: number }>;
  etiquetas: ReadonlyMap<string, Etiqueta[]>;
}): Map<string, DatosNodo> {
  const indice = indiceHijos(o.unidades);
  const personas = personasPorUnidad(o.unidades, o.puestos, o.vigentes, o.trabajadores, o.cargos);
  return new Map(
    o.unidades.map((u): [string, DatosNodo] => {
      const { total, vacantes } = o.dotaciones.get(u.id) ?? { total: 0, vacantes: 0 };
      const jefe = jefeVisible(u, o.vigentes);
      return [
        u.id,
        {
          ...personas.get(u.id)!,
          unidad: u,
          jefe: (jefe && o.trabajadores.get(jefe.trabajador_id)) || null,
          jefeReemplazo: jefe?.tipo === "reemplazo",
          total,
          vacantes,
          etiquetas: o.etiquetas.get(u.id) ?? [],
          hijos: indice.get(u.id)?.length ?? 0,
        },
      ];
    }),
  );
}

/** `DatosPuesto` de cada puesto, a la fecha de `vigentes`. */
export function datosDePuestos(
  puestos: Puesto[],
  vigentes: Vigentes,
  trabajadores: ReadonlyMap<string, Trabajador>,
  cargos: ReadonlyMap<string, string>,
): Map<string, DatosPuesto> {
  const nombre = (a?: { trabajador_id: string }) => (a && trabajadores.get(a.trabajador_id)?.nombre) || null;
  return new Map(
    puestos.map((p): [string, DatosPuesto] => [
      p.id,
      {
        cargo: cargos.get(p.cargo_id) ?? "",
        titular: nombre(vigentes.get(p.id)?.titular),
        reemplazo: nombre(vigentes.get(p.id)?.reemplazo),
        leyendaId: p.leyenda_id,
      },
    ]),
  );
}

/** Los superiores por tipo de la unidad, como los escribe su tarjeta («Gerencia › Área»). */
export const textoRuta = (rutas: Map<string, Unidad[]>, unidad: Unidad) =>
  rutaSuperiores(rutas, unidad)
    .map((x) => x.nombre)
    .join(" › ");

/**
 * El color de una tarjeta según «Colorear por»: el propio (la marca de la unidad o la leyenda del puesto) y, si no
 * tiene, el de su rango en la escala. Null = sin color.
 */
export const colorEfectivo = (
  propio: { color: string | null } | null | undefined,
  escala: { color: string } | null | undefined,
): string | null => propio?.color ?? escala?.color ?? null;

/** El color de una tarjeta y el texto que va con él (el color nunca va solo): el código de la marca o el valor de la escala. */
export interface ColorTarjeta {
  color: string | null;
  texto?: string;
}

/**
 * `ColorTarjeta` de cada unidad y puesto, con lo mismo que el lienzo pone en su contexto: `marcas` (marcasPorUnidad),
 * `leyendas` (por id, solo coloreando por leyenda) y `escala` (escalaPorTarjeta). Las tarjetas sin color ni texto no van.
 */
export function coloresDeTarjetas(o: {
  criterio: string;
  unidades: Unidad[];
  puestos: ReadonlyMap<string, DatosPuesto>;
  marcas: ReadonlyMap<string, Marca | null> | null;
  leyendas: ReadonlyMap<string, Leyenda> | null;
  escala: ReadonlyMap<string, ValorEscala> | null;
  t: Traducir;
}): Map<string, ColorTarjeta> {
  const res = new Map<string, ColorTarjeta>();
  const poner = (id: string, propio: { color: string | null } | null | undefined, codigo?: string | null) => {
    const escala = etiquetaEscala(o.t, o.criterio, o.escala?.get(id));
    const color = colorEfectivo(propio, escala);
    const texto = codigo || escala?.texto;
    if (color || texto) res.set(id, texto ? { color, texto } : { color });
  };
  for (const u of o.unidades) {
    const marca = o.marcas?.get(u.id);
    poner(u.id, marca, marca?.codigo);
  }
  for (const [id, p] of o.puestos) poner(id, p.leyendaId ? o.leyendas?.get(p.leyendaId) : null);
  return res;
}
