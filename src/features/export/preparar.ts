import { toRaw } from "vue";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Unidad, ValorCatalogo, Zona } from "@/db/tipos";
import { i18n } from "@/i18n";
import { useOrganizacion } from "@/stores/organizacion";
import {
  coloresDeTarjetas,
  datosDePuestos,
  datosDeUnidades,
  etiquetasPorUnidad,
} from "@/features/arbol/datosNodo";
import { escalaPorTarjeta, esCriterioEscala } from "@/features/arbol/escala";
import {
  descendientes,
  dotacionPorUnidad,
  marcasPorUnidad,
  rutasPorTipo,
  tiposEnUso,
} from "@/features/arbol/jerarquia";
import {
  aristasDibujadas,
  cajasDibujadas,
  colapsadosIniciales,
  grafoElk,
  lateralesADibujar,
  posiciones,
  subgrafoVisible,
  unidadesDeRama,
  type NodoUbicado,
} from "@/features/arbol/layout";
import { leyendaDeColores } from "@/features/arbol/leyenda";
import {
  CRITERIO_LEYENDA,
  jefeEnTarjeta,
  separaciones,
  tipoDeMarca,
  type ConfigVista,
} from "@/features/arbol/vista";
import { zonasDibujadas } from "@/features/arbol/zonas";
import { formatearFecha, hoyISO } from "@/features/puestos/puestos";
import { tamanos, tarjetasDe, type Nivel, type Tarjeta } from "./niveles";
import type { EntradaSvg } from "./treeSvg";

/** Qué parte del organigrama va en la imagen: toda o la rama de una unidad. */
export type Alcance = "todo" | { rama: string };

export interface PedidoImagen {
  alcance: Alcance;
  nivel: Nivel;
  /** «Abrir todas las ramas del alcance»; sin ella, las ramas salen como en pantalla. */
  abrirTodo: boolean;
  /** La de Personalizar. */
  config: ConfigVista;
  /**
   * Lo que muestra el lienzo: sus ramas plegadas y las unidades que dibuja. Lo que no dibuja (otra rama, o el lienzo sin
   * abrir, desde la página Importar y exportar) sale con las ramas que el lienzo abre al empezar.
   */
  pantalla?: { colapsados: ReadonlySet<string>; unidades: ReadonlySet<string> } | null;
  /** false: sin el fondo blanco (PNG transparente). */
  fondo?: boolean;
  /** Ubica los bloques del grafo de elk; la ventana usa el worker del lienzo. Sin él, elk en este hilo (pruebas). */
  ubicar?: (grafo: ElkNode) => Promise<NodoUbicado[]>;
  /**
   * Una página del PDF por ramas: solo la rama de `raiz`, sin las hijas de `fuera`, y con `cortadas` plegadas (su tarjeta
   * lleva la línea de «+N unidades», que el PDF cambia por «sigue en la página N»). Los datos de cada tarjeta son los del
   * alcance entero.
   */
  pagina?: { raiz: string; cortadas: ReadonlySet<string>; fuera: ReadonlySet<string> };
  /**
   * El dibujo chico del manual: los puestos de esta unidad, en cualquier nivel. En Estructura solo el cargo; en
   * Presentación, también quién lo ocupa, y la jefatura va en la tarjeta de la unidad.
   */
  puestosDe?: string;
}

async function ubicarAqui(grafo: ElkNode): Promise<NodoUbicado[]> {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  return (await new ELK().layout(grafo)).children ?? [];
}

export const unidadesDe = (unidades: Unidad[], a: Alcance) =>
  a === "todo" ? unidades : unidadesDeRama(unidades, a.rama);

// Fuera de «Como en pantalla» no van puestos: elk no les deja lugar.
function subgrafo(o: PedidoImagen) {
  const org = useOrganizacion();
  // Sin el proxy reactivo del store: con una organización grande, leer a través de él tarda el doble.
  const e = toRaw(org.enFecha);
  const unidades = unidadesDe(toRaw(e.unidades), o.alcance);
  const pantalla = o.nivel === "pantalla";
  let plegadas = new Set<string>();
  if (!o.abrirTodo) {
    const p = o.pantalla;
    plegadas = colapsadosIniciales(unidades);
    if (p) plegadas = new Set([...[...plegadas].filter((id) => !p.unidades.has(id)), ...p.colapsados]);
    // Una rama pedida desde su propia tarjeta plegada se ve abierta, no como una sola tarjeta.
    if (o.alcance !== "todo") plegadas.delete(o.alcance.rama);
  }
  const pag = o.pagina;
  if (pag) plegadas = new Set([...plegadas, ...pag.cortadas]);
  const puestos = toRaw(e.puestos);
  const sinJefe = pantalla ? jefeEnTarjeta(o.config) : o.nivel === "presentacion";
  const g = subgrafoVisible(
    pag ? unidadesDeRama(unidades, pag.raiz).filter((x) => !pag.fuera.has(x.id)) : unidades,
    toRaw(org.conexiones),
    plegadas,
    pantalla && o.config.verPuestos
      ? puestos
      : o.puestosDe
        ? puestos.filter((x) => x.unidad_id === o.puestosDe)
        : [],
    sinJefe,
  );
  return { org, e, unidades, plegadas, g, sinJefe };
}

/** Cuántas tarjetas lleva la imagen: para avisar si pasa de LIMITE_TARJETAS, como «Expandir todo». */
export function cuantasTarjetas(o: PedidoImagen): number {
  const { g } = subgrafo(o);
  return g.nodos.length + g.puestos.length;
}

/** Lo que arma `contenidoImagen`: todo lo de la imagen menos lo que ubica elk. */
export interface ContenidoImagen {
  g: ReturnType<typeof subgrafo>["g"];
  /** Las unidades del alcance. */
  unidades: Unidad[];
  plegadas: Set<string>;
  tam: ReturnType<typeof tamanos>;
  opcionesLayout: {
    direccion: ConfigVista["direccion"];
    densidad: ConfigVista["densidad"];
    alinearPorTipo: boolean;
  };
  /** Los tipos de unidad con que elk alinea; vacío si no se alinea por tipo. */
  tiposAlinear: ValorCatalogo[];
  /** La jefatura va en la tarjeta de la unidad, no en la de su puesto. */
  jefeEnTarjeta: boolean;
  tarjetas: Tarjeta[];
  leyenda: EntradaSvg["leyenda"];
  encabezado: EntradaSvg["encabezado"];
  /** Las zonas con las unidades que cubren, o null si no se ven. */
  zonasDatos: { zonas: Zona[]; zonaUnidades: { zona_id: string; unidad_id: string }[] } | null;
}

/** Todo lo de la imagen que se lee del store a la fecha que se ve, salvo el layout de elk. */
export function contenidoImagen(o: PedidoImagen): ContenidoImagen {
  const { org, e, unidades, plegadas, g, sinJefe } = subgrafo(o);
  const { config, nivel } = o;
  const t = i18n.global.t;
  const pantalla = nivel === "pantalla";
  const catalogos = toRaw(org.catalogos);
  const todas = toRaw(e.unidades);

  // Lo que solo usa «Como en pantalla» (Estructura no lee nada de personas).
  const tiposUso = tiposEnUso(todas, catalogos.tipos_unidad);
  const tiposRuta = new Set(tiposUso.filter((x) => config.rutaTipos.includes(x.id)).map((x) => x.id));
  const rutas = pantalla && tiposRuta.size ? rutasPorTipo(todas, catalogos.tipos_unidad, tiposRuta) : null;
  const tam = tamanos(nivel, config, !!rutas);
  const opcionesLayout = {
    direccion: config.direccion,
    densidad: config.densidad,
    alinearPorTipo: config.alinearPorTipo,
  };

  const conPersonas = nivel !== "estructura";
  const fecha = org.fechaVista ?? undefined;
  const trabajadores = new Map(toRaw(e.trabajadores).map((x) => [x.id, x]));
  const cargos = new Map(catalogos.cargos.map((c) => [c.id, c.nombre]));
  const dotaciones = conPersonas
    ? dotacionPorUnidad(unidades, toRaw(e.puestos), toRaw(e.asignaciones), fecha)
    : null;
  // Estructura no lleva personas: sus puestos (el manual) ni leen los nombres.
  const datosPuesto = datosDePuestos(g.puestos, e.vigentes, conPersonas ? trabajadores : new Map(), cargos);
  const tipoMarca = pantalla ? tipoDeMarca(config.colorearPor, tiposUso) : null;
  const marcas = tipoMarca ? marcasPorUnidad(todas, tipoMarca) : null;
  const criterio = esCriterioEscala(config.colorearPor) ? config.colorearPor : null;
  const escala =
    pantalla && criterio && dotaciones
      ? escalaPorTarjeta(
          criterio,
          unidades,
          toRaw(e.puestos),
          e.vigentes,
          dotaciones,
          org.fechaVista ?? hoyISO(),
        )
      : null;
  const leyendas = toRaw(org.leyendas);

  const tarjetas = tarjetasDe(nivel, {
    unidades: g.nodos,
    datos: dotaciones
      ? datosDeUnidades({
          unidades,
          puestos: toRaw(e.puestos),
          vigentes: e.vigentes,
          trabajadores,
          cargos,
          dotaciones,
          etiquetas: etiquetasPorUnidad(toRaw(org.etiquetas), toRaw(org.unidadEtiquetas)),
        })
      : new Map(),
    datosPuesto,
    colores: pantalla
      ? coloresDeTarjetas({
          criterio: config.colorearPor,
          unidades,
          puestos: datosPuesto,
          marcas,
          leyendas: config.colorearPor === CRITERIO_LEYENDA ? new Map(leyendas.map((l) => [l.id, l])) : null,
          escala,
          t,
        })
      : new Map(),
    rutas,
    tipos: new Map(catalogos.tipos_unidad.map((x) => [x.id, x.nombre])),
    conPuestos: !!o.puestosDe,
    config,
    plegadas: new Map(
      g.nodos.filter((u) => plegadas.has(u.id)).map((u) => [u.id, descendientes(unidades, u.id).size]),
    ),
    t,
  });

  const rama = o.alcance === "todo" ? null : e.porId.get(o.alcance.rama);
  return {
    g,
    unidades,
    plegadas,
    tam,
    opcionesLayout,
    jefeEnTarjeta: sinJefe,
    tiposAlinear: config.alinearPorTipo ? catalogos.tipos_unidad : [],
    tarjetas,
    leyenda: pantalla
      ? leyendaDeColores({
          criterio: config.colorearPor,
          escala,
          marcas,
          tipoMarca,
          tipos: tiposUso,
          leyendas,
          nodos: g.nodos,
          puestos: g.puestos,
          t,
        })
      : null,
    encabezado: {
      organizacion: org.org.nombre,
      alcance: rama?.nombre ?? t("imagen.alcanceTodo"),
      fecha: formatearFecha(org.fechaVista ?? hoyISO(), i18n.global.locale.value),
      logo: org.org.logo ? `data:image/png;base64,${org.org.logo}` : null,
    },
    zonasDatos:
      config.zonas && org.zonas.length
        ? { zonas: toRaw(org.zonas), zonaUnidades: toRaw(org.zonaUnidades) }
        : null,
  };
}

/** La entrada del dibujo SVG, armada desde el store a la fecha que se ve, con los mismos datos que el lienzo. */
export async function prepararImagen(o: PedidoImagen): Promise<EntradaSvg> {
  const c = contenidoImagen(o);
  const { g, tam, opcionesLayout } = c;
  const grafo = grafoElk(g, tam.unidad, tam.puesto, opcionesLayout, c.tiposAlinear);
  const pos = posiciones(g, await (o.ubicar ?? ubicarAqui)(grafo), tam.unidad, tam.puesto, opcionesLayout);
  const cajas = cajasDibujadas(g, pos, tam.unidad, tam.puesto);
  const config = o.config;
  return {
    nivel: o.nivel,
    tarjetas: c.tarjetas,
    cajas,
    aristas: aristasDibujadas(g),
    laterales: lateralesADibujar(g, config),
    zonas: c.zonasDatos
      ? zonasDibujadas(
          c.zonasDatos.zonas,
          c.zonasDatos.zonaUnidades,
          cajas,
          g.puestos,
          Math.floor(separaciones(config).hermanos / 2),
        )
      : null,
    leyenda: c.leyenda,
    vista: config,
    encabezado: c.encabezado,
    fondo: o.fondo ?? true,
    t: i18n.global.t,
  };
}
