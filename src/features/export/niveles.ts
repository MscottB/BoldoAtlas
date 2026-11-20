import type { Unidad } from "@/db/tipos";
import { textoRuta, type ColorTarjeta, type DatosNodo, type DatosPuesto } from "@/features/arbol/datosNodo";
import type { Traducir } from "@/features/arbol/escala";
import { tamPuesto, tamUnidad, type ConfigVista } from "@/features/arbol/vista";
import { iniciales } from "@/lib/texto";

/** Cuánto detalle lleva la imagen: Estructura no lleva datos de personas. */
export type Nivel = "estructura" | "presentacion" | "pantalla";

/** Lo que se escribe en una tarjeta. Las de puestos (solo en «Como en pantalla») tienen el id del puesto. */
export interface Tarjeta {
  id: string;
  titulo: string;
  lineas: string[];
  color: string | null;
  /** Cuántas unidades oculta la rama plegada; 0 si no hay. */
  mas: number;
  /** En lugar de «+N unidades»: en el PDF por ramas, «sigue en la página N». */
  textoMas?: string;
  /** Presentación sin jefatura: «Vacante» va en gris. */
  vacante?: boolean;
}

/** Lo mismo que lee cada tarjeta del lienzo, a la fecha que se ve (ver datosNodo.ts). */
export interface EntradaNivel {
  /** Las unidades que se dibujan (`Subgrafo.nodos`), en ese orden. */
  unidades: Unidad[];
  /** `datosDeUnidades(...)`: puede traer más unidades que las dibujadas. */
  datos: ReadonlyMap<string, DatosNodo>;
  /** `datosDePuestos(...)`. Con «Ver puestos», sus tarjetas; se dibujan solo las que tienen caja. */
  datosPuesto: ReadonlyMap<string, DatosPuesto>;
  /** `coloresDeTarjetas(...)`; vacío si no se colorea. */
  colores: ReadonlyMap<string, ColorTarjeta>;
  /** `rutasPorTipo(...)`, como el contexto del lienzo; null si la vista no muestra la ruta. */
  rutas: Map<string, Unidad[]> | null;
  /** Id del tipo de unidad → su nombre. */
  tipos: ReadonlyMap<string, string>;
  /** La configuración de Personalizar. Solo «Como en pantalla» la sigue. */
  config: ConfigVista;
  /** Unidad plegada → cuántas unidades quedan ocultas bajo ella (`descendientes(...).size`). */
  plegadas: ReadonlyMap<string, number>;
  t: Traducir;
}

type Tam = { ancho: number; alto: number };

/**
 * Lo que mide cada tarjeta en el nivel: el layout (`calcularLayout`/`grafoElk` y `posiciones`) y `cajasDibujadas` deben
 * usar esto mismo. Siempre a escala 100: la imagen no depende de la escala de la interfaz.
 */
export function tamanos(nivel: Nivel, config: ConfigVista, conRuta: boolean): { unidad: Tam; puesto: Tam } {
  const puesto = tamPuesto(config);
  if (nivel === "estructura") return { unidad: { ancho: 220, alto: 68 }, puesto };
  if (nivel === "presentacion") return { unidad: { ancho: 260, alto: 112 }, puesto };
  return { unidad: tamUnidad(config, conRuta), puesto };
}

const hay = (x: string | false | null | undefined): x is string => !!x;

/** Qué lleva cada tarjeta en el nivel. Estructura: solo el nombre de la unidad, sin color; ningún dato de personas. */
export function tarjetasDe(nivel: Nivel, e: EntradaNivel): Tarjeta[] {
  const { config: c, t } = e;
  const base = (u: Unidad) => ({ id: u.id, titulo: u.nombre, mas: e.plegadas.get(u.id) ?? 0 });
  if (nivel === "estructura") return e.unidades.map((u) => ({ ...base(u), lineas: [], color: null }));

  const unidades = e.unidades.flatMap((u): Tarjeta[] => {
    const d = e.datos.get(u.id);
    if (!d) return [];
    const jefatura =
      d.jefe && (d.jefeReemplazo ? t("arbol.reemplazo", { nombre: d.jefe.nombre }) : d.jefe.nombre);
    if (nivel === "presentacion")
      return [
        jefatura
          ? { ...base(u), lineas: [jefatura, d.cargoJefe].filter(hay), color: null }
          : { ...base(u), lineas: [t("puesto.vacante")], color: null, vacante: true },
      ];

    // Como en pantalla: lo que muestra NodoUnidad con esta configuración. La compacta es de una línea.
    const completa = c.densidad === "normal";
    const conPersonas = completa && c.personasEnTarjetas;
    const color = e.colores.get(u.id);
    const cifras = [
      c.mostrarDotacion && `${t("arbol.dotacion")}: ${d.total}`,
      c.mostrarVacantes && d.vacantes > 0 && t("arbol.vacantes", { n: d.vacantes }, d.vacantes),
      color?.texto,
    ].filter(hay);
    const lineas = completa
      ? [
          c.mostrarTipo && e.tipos.get(u.tipo_id)?.toUpperCase(),
          e.rutas && textoRuta(e.rutas, u),
          c.mostrarJefe &&
            (d.jefe && jefatura
              ? `${c.mostrarFoto ? `${iniciales(d.jefe.nombre)}  ` : ""}${jefatura}`
              : t("arbol.sinJefatura")),
          conPersonas && c.mostrarJefe && d.cargoJefe,
          conPersonas &&
            [...d.equipo.map((w) => iniciales(w.nombre)), d.resto ? `+${d.resto}` : ""].join(" ").trim(),
          c.mostrarEtiquetas && d.etiquetas.map((x) => x.nombre).join(", "),
        ]
      : [];
    return [{ ...base(u), lineas: [...lineas, cifras.join(" · ")].filter(hay), color: color?.color ?? null }];
  });
  if (nivel !== "pantalla" || !c.verPuestos) return unidades;

  // Las tarjetas de puestos, como NodoPuesto. Solo se dibujan las que tienen caja (el de jefatura puede no tenerla).
  const puestos = [...e.datosPuesto].map(([id, p]): Tarjeta => {
    const color = e.colores.get(id);
    const datos = [
      c.mostrarCargo && p.cargo,
      c.mostrarPersona && (p.titular ?? t("puesto.vacante")),
      c.mostrarPersona &&
        c.densidad === "normal" &&
        p.reemplazo &&
        t("puesto.reemplazoDe", { nombre: p.reemplazo }),
      color?.texto,
    ].filter(hay);
    return { id, titulo: datos[0] ?? "", lineas: datos.slice(1), color: color?.color ?? null, mas: 0 };
  });
  return [...unidades, ...puestos];
}
