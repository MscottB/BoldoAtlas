import type { Zona } from "@/db/tipos";
import type { EntradaLeyenda } from "@/features/arbol/LeyendaLienzo.vue";
import { PLEGADA } from "@/features/arbol/layout";
import {
  anchoEtiqueta,
  caminoSvg,
  puntaFlecha,
  trazarLaterales,
  type Caja,
  type Lateral,
  type Punto,
} from "@/features/arbol/lateral";
import type { ConfigVista } from "@/features/arbol/vista";
import type { ZonasDibujadas } from "@/features/arbol/zonas";
import { ACENTOS, MARCA_TEXTO, textoSobre } from "@/features/tema/tema";
import { anchoTexto, partir, recortar } from "./medida";
import type { Nivel, Tarjeta, Traducir } from "./niveles";

/** Lo que dibuja la imagen. Las cajas, aristas, laterales y zonas salen de las mismas funciones que usa el lienzo. */
export interface EntradaSvg {
  nivel: Nivel;
  /** `tarjetasDe(nivel, ...)`. Una tarjeta sin caja no se dibuja. */
  tarjetas: Tarjeta[];
  /** Lugar y medida de cada tarjeta: `cajasDibujadas(g, posiciones(...), tam.unidad, tam.puesto)` con `tamanos(nivel, ...)`. */
  cajas: ReadonlyMap<string, Caja>;
  /** Las líneas jerárquicas: `aristasDibujadas(g)`. */
  aristas: [string, string][];
  /** Las conexiones laterales: `lateralesADibujar(g, config)`. */
  laterales: (Lateral & { ambos?: boolean })[];
  /** `zonasDibujadas(...)` con las mismas cajas; null si no se ven. En Presentación no se dibujan. */
  zonas: ZonasDibujadas | null;
  /** La leyenda de «Colorear por» (título y entradas, como LeyendaLienzo). Solo se dibuja en «Como en pantalla». */
  leyenda: { titulo: string; entradas: EntradaLeyenda[] } | null;
  vista: Pick<ConfigVista, "direccion" | "lineas">;
  /**
   * `fecha`, ya escrita para leer: hoy o la elegida en «Organigrama a una fecha». `logo`: una URL `data:image/...;base64`
   * (así el PNG se puede dibujar en un canvas); cualquier otra cosa se ignora.
   */
  encabezado: { organizacion: string; alcance: string; fecha: string; logo: string | null };
  t: Traducir;
}

// Paleta clara de main.css, fija: la imagen no sigue el tema oscuro de la app.
const P = {
  fondo: "#ffffff",
  borde: "#d4d4d4",
  texto: "#0a0a0a",
  tenue: "#737373",
  linea: "#a3a3a3",
  apagado: "#ebebeb",
  marca: ACENTOS.cobre,
  marcaTexto: MARCA_TEXTO.cobre.claro,
};
// La imagen no trae la letra de la app: se usa la del equipo que la abra.
const FUENTE = "Inter, Segoe UI, Arial, sans-serif";
const MARGEN = 32;
const ALTO_ENCABEZADO = 48;
const LOGO = 40;
const AIRE = 24; // entre el encabezado, el dibujo y la leyenda
const RELLENO = 8; // dentro de la tarjeta
const FRANJA = 4; // la del color de «Colorear por»
const LETRA_MAS = 11;
const INTERLINEA = 1.3;
const FILA_LEYENDA = 20;
const ALTO_TITULO_ZONA = 18;

// Presentación, con letra más grande; «Como en pantalla», con el nombre en una línea, como en el lienzo.
const LETRA: Record<Nivel, { titulo: number; lineasTitulo: number; linea: number; centrar: boolean }> = {
  estructura: { titulo: 14, lineasTitulo: 2, linea: 12, centrar: true },
  presentacion: { titulo: 16, lineasTitulo: 2, linea: 13, centrar: true },
  pantalla: { titulo: 13, lineasTitulo: 1, linea: 11, centrar: false },
};

// XML no admite estos caracteres de control: se quitan para que el archivo siempre abra.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const esc = (s: string) =>
  s
    .replace(CONTROL, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const num = (v: number) => String(Math.round(v * 10) / 10);
const LOGO_VALIDO = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

type Atributos = Record<string, string | number | undefined>;
const atributos = (a: Atributos) =>
  Object.entries(a)
    .flatMap(([k, v]) => (v === undefined ? [] : [` ${k}="${typeof v === "number" ? num(v) : esc(v)}"`]))
    .join("");
const el = (nombre: string, a: Atributos, contenido?: string) =>
  contenido === undefined
    ? `<${nombre}${atributos(a)}/>`
    : `<${nombre}${atributos(a)}>${esc(contenido)}</${nombre}>`;
const texto = (
  x: number,
  y: number,
  s: string,
  tam: number,
  o: { color?: string; negrita?: boolean; centro?: boolean } = {},
) =>
  el(
    "text",
    {
      x,
      y,
      "font-size": tam,
      "font-weight": o.negrita ? 600 : undefined,
      fill: o.color ?? P.texto,
      "text-anchor": o.centro ? "middle" : undefined,
    },
    s,
  );

/** Línea jerárquica de `a` a `b`: en ángulo (smoothstep) o curva, como la arista de Vue Flow. */
function arista(a: Caja, b: Caja, v: EntradaSvg["vista"]): string {
  const h = v.direccion === "horizontal";
  const s = h ? { x: a.x + a.ancho, y: a.y + a.alto / 2 } : { x: a.x + a.ancho / 2, y: a.y + a.alto };
  const d = h ? { x: b.x, y: b.y + b.alto / 2 } : { x: b.x + b.ancho / 2, y: b.y };
  const m = h ? (s.x + d.x) / 2 : (s.y + d.y) / 2;
  if (v.lineas === "bezier")
    return h
      ? `M ${s.x} ${s.y} C ${m} ${s.y} ${m} ${d.y} ${d.x} ${d.y}`
      : `M ${s.x} ${s.y} C ${s.x} ${m} ${d.x} ${m} ${d.x} ${d.y}`;
  return caminoSvg(
    h ? [s, { x: m, y: s.y }, { x: m, y: d.y }, d] : [s, { x: s.x, y: m }, { x: d.x, y: m }, d],
    5,
  );
}

function tarjeta(t: Tarjeta, c: Caja, nivel: Nivel, zonas: Zona[], textoMas: string): string[] {
  const L = LETRA[nivel];
  // Solo «Como en pantalla» lleva color y líneas de datos; en los otros niveles se ignoran aunque vengan.
  const color = nivel === "pantalla" ? t.color : null;
  const franja = color ? FRANJA : 0;
  const ancho = c.ancho - 2 * RELLENO - franja;
  const filas = [
    ...partir(t.titulo, ancho, L.titulo, L.lineasTitulo, true).map((s) => ({
      s,
      tam: L.titulo,
      negrita: true,
      color: P.texto,
    })),
    ...(nivel === "estructura" ? [] : t.lineas).map((s, i) => ({
      s: recortar(s, ancho, L.linea),
      tam: L.linea,
      negrita: false,
      color: nivel === "presentacion" && (i > 0 || t.vacante) ? P.tenue : P.texto,
    })),
  ];
  // Lo que no cabe se deja fuera, de abajo hacia arriba; el «+N unidades» tiene su lugar al pie.
  const libre = c.alto - 2 * RELLENO - (t.mas ? LETRA_MAS * INTERLINEA : 0);
  const caben: typeof filas = [];
  let usado = 0;
  for (const f of filas) {
    if (usado + f.tam * INTERLINEA > libre) break;
    usado += f.tam * INTERLINEA;
    caben.push(f);
  }
  const x = L.centrar ? c.x + franja + (c.ancho - franja) / 2 : c.x + franja + RELLENO;
  let y = c.y + RELLENO + (L.centrar ? (libre - usado) / 2 : 0);
  const partes = [
    el("rect", { x: c.x, y: c.y, width: c.ancho, height: c.alto, rx: 8, fill: P.fondo, stroke: P.borde }),
  ];
  if (color)
    partes.push(
      el("rect", { x: c.x + 1, y: c.y + 4, width: FRANJA, height: c.alto - 8, rx: 2, fill: color }),
    );
  // Las zonas que como recuadro cubrirían a otras: una franja arriba, como en el lienzo.
  const anchoZona = (c.ancho - 16) / Math.max(1, zonas.length);
  zonas.forEach((z, i) =>
    partes.push(
      el("rect", { x: c.x + 8 + i * anchoZona, y: c.y + 1, width: anchoZona, height: 3, fill: z.color }),
    ),
  );
  for (const f of caben) {
    const alto = f.tam * INTERLINEA;
    partes.push(
      texto(x, y + alto / 2 + f.tam * 0.35, f.s, f.tam, {
        color: f.color,
        negrita: f.negrita,
        centro: L.centrar,
      }),
    );
    y += alto;
  }
  if (t.mas)
    partes.push(
      texto(x, c.y + c.alto - RELLENO - 2, textoMas, LETRA_MAS, {
        color: P.marcaTexto,
        negrita: true,
        centro: L.centrar,
      }),
    );
  return partes;
}

/**
 * El organigrama como texto SVG puro (rect, text, path e image solo para el logo), con la paleta clara y los textos
 * escapados. En Presentación el lienzo se amplía con márgenes blancos hasta 16:9 exacto. El primer elemento es el fondo
 * blanco, `<rect id="fondo" .../>`: quien quiera un PNG transparente lo quita.
 */
export function dibujarSvg(e: EntradaSvg): { svg: string; ancho: number; alto: number } {
  const zonas = e.nivel === "presentacion" ? null : e.zonas;
  const leyenda = e.nivel === "pantalla" && e.leyenda?.entradas.length ? e.leyenda : null;
  const trazados = trazarLaterales(e.laterales, e.cajas, e.vista.direccion);
  const { organizacion, alcance, fecha, logo } = e.encabezado;
  const conLogo = !!logo && LOGO_VALIDO.test(logo);
  const sub = `${alcance} · ${fecha}`;

  // Lo que ocupa el dibujo: tarjetas, recuadros de zonas con su nombre encima, y líneas laterales con su etiqueta.
  const ocupado: Caja[] = [
    ...e.cajas.values(),
    ...(zonas?.recuadros ?? []).map(({ caja: c }) => ({
      ...c,
      y: c.y - ALTO_TITULO_ZONA,
      alto: c.alto + ALTO_TITULO_ZONA,
    })),
    ...e.laterales.flatMap((l) => {
      const tr = trazados.get(l.id);
      const w = l.etiqueta ? anchoEtiqueta(l.etiqueta) : 10;
      return tr
        ? [
            ...tr.puntos.map((p) => ({ ...p, ancho: 0, alto: 0 })),
            { x: tr.etiqueta.x - w / 2, y: tr.etiqueta.y - 10, ancho: w, alto: 20 },
          ]
        : [];
    }),
  ];
  const [x0, y0, x1, y1] = ocupado.length
    ? [
        Math.min(...ocupado.map((c) => c.x)),
        Math.min(...ocupado.map((c) => c.y)),
        Math.max(...ocupado.map((c) => c.x + c.ancho)),
        Math.max(...ocupado.map((c) => c.y + c.alto)),
      ]
    : [0, 0, 0, 0];
  const dibujo = { ancho: x1 - x0, alto: y1 - y0 };
  const anchoEncabezado =
    (conLogo ? LOGO + 12 : 0) + Math.max(anchoTexto(organizacion, 18, true), anchoTexto(sub, 12));
  const anchoLeyenda = leyenda
    ? Math.max(
        anchoTexto(leyenda.titulo, 12, true),
        ...leyenda.entradas.map((x) => 32 + anchoTexto(x.nombre, 12)),
      )
    : 0;
  const altoLeyenda = leyenda ? (leyenda.entradas.length + 1) * FILA_LEYENDA : 0;
  const contenido = {
    ancho: Math.max(dibujo.ancho, anchoEncabezado, anchoLeyenda),
    alto: ALTO_ENCABEZADO + AIRE + dibujo.alto + (leyenda ? AIRE + altoLeyenda : 0),
  };
  let ancho = Math.ceil(contenido.ancho + 2 * MARGEN);
  let alto = Math.ceil(contenido.alto + 2 * MARGEN);
  if (e.nivel === "presentacion") {
    // Enteros 16k × 9k: así ancho / alto da 16 / 9 exacto.
    const k = Math.ceil(Math.max(ancho / 16, alto / 9));
    [ancho, alto] = [16 * k, 9 * k];
  }
  // El contenido va centrado en la imagen, y el dibujo, centrado bajo el encabezado.
  const ox = (ancho - contenido.ancho) / 2;
  const oy = (alto - contenido.alto) / 2;
  const dx = ox + (contenido.ancho - dibujo.ancho) / 2 - x0;
  const dy = oy + ALTO_ENCABEZADO + AIRE - y0;
  const mover = (p: Punto) => ({ x: p.x + dx, y: p.y + dy });
  const caja = (c: Caja): Caja => ({ ...c, ...mover(c) });

  const partes = [
    el("rect", { id: "fondo", x: 0, y: 0, width: ancho, height: alto, fill: P.fondo }),
    el("title", {}, `${organizacion} · ${alcance}`),
  ];
  let xEncabezado = ox;
  if (conLogo) {
    partes.push(
      el("image", {
        x: ox,
        y: oy + (ALTO_ENCABEZADO - LOGO) / 2,
        width: LOGO,
        height: LOGO,
        href: logo,
        preserveAspectRatio: "xMidYMid meet",
      }),
    );
    xEncabezado += LOGO + 12;
  }
  partes.push(texto(xEncabezado, oy + 20, organizacion, 18, { negrita: true }));
  partes.push(texto(xEncabezado, oy + 40, sub, 12, { color: P.tenue }));

  for (const { zona, caja: c } of zonas?.recuadros ?? []) {
    const r = caja(c);
    partes.push(
      el("rect", {
        x: r.x,
        y: r.y,
        width: r.ancho,
        height: r.alto,
        rx: 12,
        fill: zona.color,
        "fill-opacity": 0.1,
        stroke: zona.color,
        "stroke-width": 2,
      }),
    );
    partes.push(texto(r.x + 4, r.y - 6, recortar(zona.nombre, r.ancho - 4, 12), 12, { negrita: true }));
  }

  for (const [a, b] of e.aristas) {
    const [ca, cb] = [e.cajas.get(a), e.cajas.get(b)];
    if (ca && cb)
      partes.push(
        el("path", {
          d: arista(caja(ca), caja(cb), e.vista),
          fill: "none",
          stroke: P.linea,
          "stroke-width": 1.5,
        }),
      );
  }

  // Las laterales como AristaLateral: línea de la marca, punteada, con flecha salvo si va en los dos sentidos.
  const etiquetas: string[] = [];
  for (const l of e.laterales) {
    const tr = trazados.get(l.id);
    if (!tr) continue;
    const puntos = tr.puntos.map(mover);
    partes.push(
      el("path", {
        d: caminoSvg(puntos),
        fill: "none",
        stroke: P.marca,
        "stroke-width": 1.25,
        "stroke-dasharray": l.id.startsWith(PLEGADA) ? "2 4" : "6 4",
      }),
    );
    const punta = l.ambos ? null : puntaFlecha(puntos);
    if (punta) partes.push(el("path", { d: punta, fill: P.marca }));
    const c = mover(tr.etiqueta);
    if (l.etiqueta && tr.conTexto) {
      const w = anchoEtiqueta(l.etiqueta);
      etiquetas.push(
        el("rect", {
          x: c.x - w / 2,
          y: c.y - 10,
          width: w,
          height: 20,
          rx: 4,
          fill: P.fondo,
          stroke: P.borde,
        }),
        texto(c.x, c.y + 4, recortar(l.etiqueta, w - 12, 12), 12, { centro: true }),
      );
    } else
      etiquetas.push(
        el("rect", {
          x: c.x - 5,
          y: c.y - 5,
          width: 10,
          height: 10,
          rx: 5,
          fill: P.marca,
          stroke: P.fondo,
          "stroke-width": 2,
        }),
      );
  }

  for (const t of e.tarjetas) {
    const c = e.cajas.get(t.id);
    if (c)
      partes.push(
        ...tarjeta(
          t,
          caja(c),
          e.nivel,
          zonas?.marcas.get(t.id) ?? [],
          e.t("imagen.masUnidades", { n: t.mas }, t.mas),
        ),
      );
  }
  partes.push(...etiquetas);

  if (leyenda) {
    const y = oy + ALTO_ENCABEZADO + AIRE + dibujo.alto + AIRE;
    partes.push(texto(ox, y + 14, leyenda.titulo, 12, { negrita: true }));
    leyenda.entradas.forEach((x, i) => {
      const fila = y + (i + 1) * FILA_LEYENDA;
      if (x.trazo)
        partes.push(
          el("path", {
            d: `M ${ox} ${fila + 10} H ${ox + 24}`,
            stroke: P.marca,
            "stroke-width": 2,
            "stroke-dasharray": x.trazo === "punteado" ? "6 4" : x.trazo === "puntos" ? "2 4" : undefined,
          }),
        );
      else {
        partes.push(
          el("rect", {
            x: ox,
            y: fila + 3,
            width: 24,
            height: 14,
            rx: 3,
            fill: x.color ?? P.apagado,
            stroke: x.color ? undefined : P.borde,
          }),
        );
        if (x.codigo)
          partes.push(
            texto(ox + 12, fila + 13, x.codigo, 9, {
              negrita: true,
              centro: true,
              color: x.color ? textoSobre(x.color) : P.texto,
            }),
          );
      }
      partes.push(texto(ox + 32, fila + 14, x.nombre, 12));
    });
  }

  const raiz = atributos({
    xmlns: "http://www.w3.org/2000/svg",
    width: ancho,
    height: alto,
    viewBox: `0 0 ${ancho} ${alto}`,
    "font-family": FUENTE,
  });
  return { svg: `<svg${raiz}>${partes.join("")}</svg>`, ancho, alto };
}
