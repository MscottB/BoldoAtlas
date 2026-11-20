import type { Etiqueta, Puesto, Trabajador, Unidad } from "@/db/tipos";
import { jefeVisible, personasPorUnidad, type Vigentes } from "@/features/arbol/jerarquia";
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
  /** Presentación sin jefatura: «Vacante» va en gris. */
  vacante?: boolean;
}

/** El `t` de vue-i18n (`i18n.global.t` o el de useI18n). */
export type Traducir = {
  (clave: string): string;
  (clave: string, nombrados: Record<string, unknown>): string;
  (clave: string, nombrados: Record<string, unknown>, plural: number): string;
};

/** Todo a la fecha que se ve, como lo arma el lienzo (VistaArbol.vue). */
export interface EntradaNivel {
  /** Las unidades que se dibujan (`Subgrafo.nodos`), en ese orden. */
  unidades: Unidad[];
  /** Los puestos vivos de esas unidades: dan el cargo de la jefatura y las caras; con «Ver puestos», sus tarjetas. */
  puestos: Puesto[];
  /** Titular y reemplazo vigentes de cada puesto (`vigentesPorPuesto`, o `org.enFecha.vigentes`). */
  vigentes: Vigentes;
  /** Id → persona. */
  trabajadores: Map<string, Trabajador>;
  /** Id del cargo → su nombre. */
  cargos: Map<string, string>;
  /** Id del tipo de unidad → su nombre. */
  tipos: ReadonlyMap<string, string>;
  /** Dotación y vacantes de cada unidad con su rama (`dotacionPorUnidad` sobre todo el alcance, no solo lo visible). */
  dotaciones: ReadonlyMap<string, { total: number; vacantes: number }>;
  /** Unidad → sus etiquetas. */
  etiquetas: ReadonlyMap<string, Etiqueta[]>;
  /**
   * Tarjeta (unidad o puesto) → su color según «Colorear por» y el texto que va con él: el código de la marca o el
   * valor de la escala (`etiquetaEscala(...).texto`). Vacío si no se colorea.
   */
  colores: ReadonlyMap<string, { color: string | null; texto?: string }>;
  /** Unidad → sus superiores por tipo ya unidos («Gerencia › Área», como `ruta` en NodoUnidad). Vacío si no se usan. */
  rutas: ReadonlyMap<string, string>;
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

  const nombre = (id?: string) => (id && e.trabajadores.get(id)?.nombre) || null;
  const personas = personasPorUnidad(e.unidades, e.puestos, e.vigentes, e.trabajadores, e.cargos);
  const unidades = e.unidades.map((u): Tarjeta => {
    const p = personas.get(u.id)!;
    const jefe = jefeVisible(u, e.vigentes);
    const quien = nombre(jefe?.trabajador_id);
    const jefatura = quien && (jefe?.tipo === "reemplazo" ? t("arbol.reemplazo", { nombre: quien }) : quien);
    if (nivel === "presentacion")
      return jefatura
        ? { ...base(u), lineas: [jefatura, p.cargoJefe].filter(hay), color: null }
        : { ...base(u), lineas: [t("puesto.vacante")], color: null, vacante: true };

    // Como en pantalla: lo que muestra NodoUnidad con esta configuración. La compacta es de una línea.
    const completa = c.densidad === "normal";
    const conPersonas = completa && c.personasEnTarjetas;
    const { total = 0, vacantes = 0 } = e.dotaciones.get(u.id) ?? {};
    const color = e.colores.get(u.id);
    const cifras = [
      c.mostrarDotacion && `${t("arbol.dotacion")}: ${total}`,
      c.mostrarVacantes && vacantes > 0 && t("arbol.vacantes", { n: vacantes }, vacantes),
      color?.texto,
    ].filter(hay);
    const lineas = completa
      ? [
          c.mostrarTipo && e.tipos.get(u.tipo_id)?.toUpperCase(),
          e.rutas.get(u.id),
          c.mostrarJefe &&
            (quien && jefatura
              ? `${c.mostrarFoto ? `${iniciales(quien)}  ` : ""}${jefatura}`
              : t("arbol.sinJefatura")),
          conPersonas && c.mostrarJefe && p.cargoJefe,
          conPersonas &&
            [...p.equipo.map((w) => iniciales(w.nombre)), p.resto ? `+${p.resto}` : ""].join(" ").trim(),
          c.mostrarEtiquetas && (e.etiquetas.get(u.id) ?? []).map((x) => x.nombre).join(", "),
        ]
      : [];
    return { ...base(u), lineas: [...lineas, cifras.join(" · ")].filter(hay), color: color?.color ?? null };
  });
  if (nivel !== "pantalla" || !c.verPuestos) return unidades;

  // Las tarjetas de puestos, como NodoPuesto. Solo se dibujan las que tienen caja (el de jefatura puede no tenerla).
  const puestos = e.puestos.map((p): Tarjeta => {
    const v = e.vigentes.get(p.id);
    const reemplazo = nombre(v?.reemplazo?.trabajador_id);
    const color = e.colores.get(p.id);
    const datos = [
      c.mostrarCargo && (e.cargos.get(p.cargo_id) ?? ""),
      c.mostrarPersona && (nombre(v?.titular?.trabajador_id) ?? t("puesto.vacante")),
      c.mostrarPersona &&
        c.densidad === "normal" &&
        reemplazo &&
        t("puesto.reemplazoDe", { nombre: reemplazo }),
      color?.texto,
    ].filter(hay);
    return { id: p.id, titulo: datos[0] ?? "", lineas: datos.slice(1), color: color?.color ?? null, mas: 0 };
  });
  return [...unidades, ...puestos];
}
