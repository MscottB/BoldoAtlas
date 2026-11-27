import ELK from "elkjs/lib/elk.bundled.js";
import { descendientes } from "@/features/arbol/jerarquia";
import {
  aristasDibujadas,
  cajasDibujadas,
  grafoElk,
  lateralesADibujar,
  posiciones,
  subgrafoVisible,
} from "@/features/arbol/layout";
import { separaciones } from "@/features/arbol/vista";
import { zonasDibujadas } from "@/features/arbol/zonas";
import type { Traducir } from "@/features/arbol/escala";
import { dibujarSvg } from "@/features/export/treeSvg";
import type { DatosVisor } from "../datos";

/** Un `t` sobre los textos del archivo: reemplaza `{n}` y `{nombre}` y elige la forma de `a | b` (como vue-i18n). */
export function traductor(textos: Record<string, string>): Traducir {
  return ((clave: string, nombrados: Record<string, unknown> = {}, plural?: number) => {
    const formas = (textos[clave] ?? clave).split("|").map((x) => x.trim());
    const n = plural ?? (typeof nombrados.n === "number" ? nombrados.n : 1);
    // Como vue-i18n: con dos formas, 1 es la primera; con tres, 0, 1 y 2 o más.
    const forma = formas[formas.length === 3 ? Math.min(n, 2) : formas.length === 2 ? (n === 1 ? 0 : 1) : 0];
    return forma.replace(/\{(\w+)\}/g, (m, k: string) => (k in nombrados ? String(nombrados[k]) : m));
  }) as Traducir;
}

/** El organigrama con las ramas `plegadas` cerradas: el mismo camino de `prepararImagen`, con los datos del archivo. */
export async function dibujar(
  d: DatosVisor,
  plegadas: ReadonlySet<string>,
): Promise<{ svg: string; ancho: number; alto: number }> {
  const cerradas = new Set(plegadas);
  const g = subgrafoVisible(d.unidades, d.conexiones, cerradas, d.puestos, d.jefeEnTarjeta);
  const { tam, opcionesLayout } = d;
  const grafo = grafoElk(g, tam.unidad, tam.puesto, opcionesLayout, d.tiposAlinear);
  // elk.bundled va en la misma página (sin worker): el archivo no carga nada de afuera.
  const pos = posiciones(
    g,
    (await new ELK().layout(grafo)).children ?? [],
    tam.unidad,
    tam.puesto,
    opcionesLayout,
  );
  const cajas = cajasDibujadas(g, pos, tam.unidad, tam.puesto);
  const conRamas = new Set(d.unidades.flatMap((u) => (u.parent_id ? [u.parent_id] : [])));
  return dibujarSvg(
    {
      nivel: d.nivel,
      tarjetas: d.tarjetas.map((t) => ({
        ...t,
        mas: cerradas.has(t.id) ? descendientes(d.unidades, t.id).size : 0,
      })),
      cajas,
      aristas: aristasDibujadas(g),
      laterales: lateralesADibujar(g, d.config),
      zonas: d.zonas
        ? zonasDibujadas(
            d.zonas.zonas,
            d.zonas.zonaUnidades,
            cajas,
            g.puestos,
            Math.floor(separaciones(d.config).hermanos / 2),
          )
        : null,
      leyenda: d.leyenda,
      vista: d.config,
      encabezado: d.encabezado,
      fondo: true,
      t: traductor(d.textos),
    },
    // La barra del visor ya muestra el logo, la organización, el alcance y la fecha.
    { interactivo: { conRamas, plegadas: cerradas }, sinEncabezado: true },
  );
}
