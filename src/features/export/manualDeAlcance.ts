import { toRaw } from "vue";
import { i18n } from "@/i18n";
import { indiceHijos } from "@/features/arbol/jerarquia";
import type { ConfigVista } from "@/features/arbol/vista";
import { useOrganizacion } from "@/stores/organizacion";
import { datosManual } from "./manual";
import type { DatosManualPdf } from "./manualPdf";
import { LETRA_MIN_PT, areaUtil, type Hoja, type Orientacion } from "./paginas";
import { paginasPdf } from "./paginasDeAlcance";
import type { PaginaPdf } from "./pdf";
import { prepararImagen, unidadesDe, type Alcance, type PedidoImagen } from "./preparar";
import { dibujarSvg, letraMinima, type EntradaSvg } from "./treeSvg";

export interface PedidoManual {
  alcance: Alcance;
  conPersonas: boolean;
  hoja: Hoja;
  orientacion: Orientacion;
  /** La de Personalizar: dirección, separaciones, zonas. */
  config: ConfigVista;
  /** Como en `PedidoImagen`: la ventana usa el worker del lienzo. */
  ubicar?: PedidoImagen["ubicar"];
}

/** Lo que va al worker (`DatosManualPdf`) y lo que se dice antes de guardar. */
export interface ManualDeAlcance extends DatosManualPdf {
  /** Alguna lámina del general o algún dibujo chico quedaría con letra bajo 8 pt. */
  ilegible: boolean;
  /** El de cada página: organización, alcance, fecha y logo. */
  encabezado: EntradaSvg["encabezado"];
}

const NINGUNA = new Set<string>();

/**
 * Todo lo que lleva el manual, salvo los textos fijos: las secciones, el organigrama general por ramas (cada hoja es la
 * «Lámina N», y «sigue» y «viene» dicen láminas: el número de página no se sabe antes de armar el índice) y el dibujo
 * chico de cada unidad (ella, sus hijas plegadas y sus puestos). Sin personas, todo en Estructura; con ellas, en
 * Presentación. Cada dibujo es un layout: `senal` detiene en el siguiente, y `alAvanzar` dice cuánto va, ya traducido.
 */
export async function manualDeAlcance(
  p: PedidoManual,
  { senal, alAvanzar }: { senal?: AbortSignal; alAvanzar?: (texto: string) => void } = {},
): Promise<ManualDeAlcance> {
  const t = i18n.global.t;
  senal?.throwIfAborted();
  const nivel = p.conPersonas ? "presentacion" : "estructura";
  const unidades = datosManual({ alcance: p.alcance, conPersonas: p.conPersonas });

  const r = await paginasPdf(
    { alcance: p.alcance, nivel, abrirTodo: true, config: p.config, ubicar: p.ubicar },
    {
      hoja: p.hoja,
      orientacion: p.orientacion,
      reparto: "ramas",
      claves: { sigue: "manual.sigue", viene: "manual.viene" },
    },
    { senal },
  );
  const hojas = await r.paginas(senal, (n) => alAvanzar?.(t("manual.preparando", { n })));
  senal?.throwIfAborted();
  const general = hojas.lista.map((x, i) => ({
    ...x,
    arriba: [t("manual.lamina", { n: i + 1 }), x.arriba].filter(Boolean).join(" · "),
  }));

  // El dibujo chico va hasta media página (`documentoManual`): con esa escala se mide si se lee.
  const area = areaUtil(p.hoja, p.orientacion);
  const hijas = indiceHijos(unidadesDe(toRaw(useOrganizacion().enFecha.unidades), p.alcance));
  let ilegible = hojas.ilegible;
  const dibujos = new Map<string, PaginaPdf>();
  for (const [i, x] of unidades.entries()) {
    const e = await prepararImagen({
      alcance: { rama: x.id },
      nivel,
      abrirTodo: true,
      // En la densidad compacta, la tarjeta de un puesto es de una línea: no cabría quién lo ocupa.
      config: { ...p.config, densidad: "normal" },
      ubicar: p.ubicar,
      puestosDe: x.id,
      pagina: { raiz: x.id, cortadas: new Set((hijas.get(x.id) ?? []).map((h) => h.id)), fuera: NINGUNA },
    });
    senal?.throwIfAborted();
    const d = dibujarSvg(e, { sinEncabezado: true });
    ilegible ||=
      letraMinima(nivel) * Math.min(1, area.ancho / d.ancho, area.alto / 2 / d.alto) < LETRA_MIN_PT;
    dibujos.set(x.id, d);
    alAvanzar?.(t("manual.dibujando", { n: i + 1, m: unidades.length }));
  }
  return { unidades, general, dibujos, ilegible, encabezado: r.encabezado };
}
