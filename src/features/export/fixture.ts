import type { Conexion, Etiqueta, Trabajador, Zona } from "@/db/tipos";
import { i18n } from "@/i18n";
import { a, p, u } from "@/features/arbol/fixture";
import { coloresDeTarjetas, datosDePuestos, datosDeUnidades } from "@/features/arbol/datosNodo";
import { descendientes, dotacionPorUnidad, vigentesPorPuesto } from "@/features/arbol/jerarquia";
import {
  aristasDibujadas,
  cajasDibujadas,
  calcularLayout,
  lateralesADibujar,
  subgrafoVisible,
} from "@/features/arbol/layout";
import { VISTA_POR_DEFECTO, jefeEnTarjeta, separaciones, type ConfigVista } from "@/features/arbol/vista";
import { zonasDibujadas } from "@/features/arbol/zonas";
import { tamanos, tarjetasDe, type EntradaNivel, type Nivel } from "./niveles";
import { dibujarSvg, type EntradaSvg, type OpcionesDibujo } from "./treeSvg";

// Datos de prueba de la exportación. Todo dato de personas (y lo que Estructura no lleva) tiene la marca: así una
// prueba busca la marca en el SVG entero.
export const MARCA = "ZQX";
/** Color de la marca de la Gerencia General: oscuro, así su texto va en blanco. */
export const COLOR_MARCA = "#1e3a8a";

const persona = (id: string, nombre: string): Trabajador => ({
  id,
  nombre,
  correo: `${MARCA}.${id}@correo.cl`,
  telefono: `+56 9 ${MARCA} ${id}`,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  updated_at: "2026-01-01T00:00:00Z",
});

/** Gerencia General (jefa Ximena) con Finanzas (jefe Bruno) y Operaciones (sin jefatura, plegada con 3 unidades dentro). */
export function datos() {
  const unidades = [
    { ...u("g", "t-g", "Gerencia General", null), jefe_puesto_id: "p-g" },
    { ...u("a1", "t-a", "Finanzas", "g", 0), jefe_puesto_id: "p-a1" },
    u("a2", "t-a", "Operaciones", "g", 1),
    u("s1", "t-s", "Logística", "a2", 0),
    u("s2", "t-s", "Mantención", "a2", 1),
    u("s3", "t-s", "Bodega", "s1", 0),
  ];
  const puestos = [
    { ...p("p-g", "g"), cargo_id: "c-g" },
    { ...p("p-a1", "a1"), cargo_id: "c-a" },
    { ...p("p-x", "a1"), cargo_id: "c-x", orden: 1 },
    { ...p("p-v", "a2"), cargo_id: "c-x" },
  ];
  const asignaciones = [a("x1", "p-g", "w1"), a("x2", "p-a1", "w2"), a("x3", "p-x", "w3", "reemplazo")];
  const trabajadores = new Map(
    [
      persona("w1", `Ximena Quiroga ${MARCA}`),
      persona("w2", `Bruno ${MARCA}`),
      persona("w3", `Carla ${MARCA}`),
    ].map((w) => [w.id, w]),
  );
  const cargos = new Map([
    ["c-g", `Gerente ${MARCA}`],
    ["c-a", `Jefe ${MARCA}`],
    ["c-x", `Analista ${MARCA}`],
  ]);
  const etiquetas = new Map<string, Etiqueta[]>([
    ["g", [{ id: "e", nombre: `Clave ${MARCA}`, color: "#00ff00" }]],
  ]);
  const zonas: Zona[] = [{ id: "z", nombre: "Zona Norte", color: "#2563eb" }];
  const conexiones: Conexion[] = [{ id: "c1", origen_id: "a1", destino_id: "a2", etiqueta: "Coordina" }];
  return { unidades, puestos, asignaciones, trabajadores, cargos, etiquetas, zonas, conexiones };
}

type Datos = ReturnType<typeof datos>;
const PLEGADAS = new Set(["a2"]);

/** Como la armará la ventana: los datos de las tarjetas con las mismas funciones que el lienzo. */
export function entrada(d: Datos, config: ConfigVista = VISTA_POR_DEFECTO): EntradaNivel {
  const vigentes = vigentesPorPuesto(d.asignaciones);
  const datosPuesto = datosDePuestos(d.puestos, vigentes, d.trabajadores, d.cargos);
  const g = d.unidades[0]!;
  return {
    unidades: subgrafoVisible(d.unidades, [], PLEGADAS).nodos,
    datos: datosDeUnidades({
      unidades: d.unidades,
      puestos: d.puestos,
      vigentes,
      trabajadores: d.trabajadores,
      cargos: d.cargos,
      dotaciones: dotacionPorUnidad(d.unidades, d.puestos, d.asignaciones),
      etiquetas: d.etiquetas,
    }),
    datosPuesto,
    colores: coloresDeTarjetas({
      criterio: `marca:${g.tipo_id}`,
      unidades: d.unidades,
      puestos: datosPuesto,
      marcas: new Map([["g", { color: COLOR_MARCA, codigo: `${MARCA}1`, unidad: g }]]),
      leyendas: null,
      escala: null,
      t: i18n.global.t,
    }),
    rutas: null,
    tipos: new Map([
      ["t-g", "Gerencia"],
      ["t-a", "Área"],
    ]),
    config,
    plegadas: new Map([...PLEGADAS].map((id) => [id, descendientes(d.unidades, id).size])),
    t: i18n.global.t,
  };
}

/** El camino que hará la ventana: subgrafo, layout de elk, tarjetas del nivel y dibujo. */
export async function armarSvg(
  nivel: Nivel,
  o: {
    config?: ConfigVista;
    ajustar?: (d: Datos) => void;
    encabezado?: Partial<EntradaSvg["encabezado"]>;
    /** Pone los puestos en el grafo aunque el nivel no los lleve (un error de quien arma la entrada). */
    conPuestos?: boolean;
    cambiar?: (e: EntradaSvg) => EntradaSvg;
    dibujo?: OpcionesDibujo;
  } = {},
) {
  const d = datos();
  o.ajustar?.(d);
  const config = o.config ?? VISTA_POR_DEFECTO;
  const pantalla = nivel === "pantalla";
  const g = subgrafoVisible(
    d.unidades,
    d.conexiones,
    PLEGADAS,
    o.conPuestos || (pantalla && config.verPuestos) ? d.puestos : [],
    (o.conPuestos || pantalla) && jefeEnTarjeta(config),
  );
  const tam = tamanos(nivel, config, false);
  const pos = await calcularLayout(g, tam.unidad, tam.puesto, config);
  const cajas = cajasDibujadas(g, pos, tam.unidad, tam.puesto);
  const tarjetas = tarjetasDe(nivel, entrada(d, config));
  const e: EntradaSvg = {
    nivel,
    tarjetas,
    cajas,
    aristas: aristasDibujadas(g),
    laterales: lateralesADibujar(g, config),
    zonas: zonasDibujadas(
      d.zonas,
      [{ zona_id: "z", unidad_id: "a1" }],
      cajas,
      g.puestos,
      Math.floor(separaciones(config).hermanos / 2),
    ),
    // Se pasa siempre: el dibujo debe dejarla fuera salvo en «Como en pantalla».
    leyenda: {
      titulo: `Leyenda ${MARCA}`,
      entradas: [{ clave: "l", color: "#123456", nombre: `Ley ${MARCA}` }],
    },
    vista: config,
    encabezado: {
      organizacion: "Atlas SA",
      alcance: "Toda la organización",
      fecha: "20-11-2026",
      logo: null,
      ...o.encabezado,
    },
    fondo: true,
    t: i18n.global.t,
  };
  return { ...dibujarSvg(o.cambiar ? o.cambiar(e) : e, o.dibujo), tarjetas };
}
