// Trazado de las conexiones laterales por el espacio libre entre tarjetas. Funciones puras: se calcula al llegar un layout
// (no al pasar el puntero) y se dibuja en AristaLateral.vue. Todo se razona como si el árbol bajara: en horizontal se
// intercambian x e y a la entrada y a la salida.

export type Punto = { x: number; y: number };
export type Caja = Punto & { ancho: number; alto: number };

export interface Trazado {
  /** La línea, en ángulos rectos: de un borde del origen a un borde del destino. */
  puntos: Punto[];
  /** Centro de la etiqueta, sobre la línea. */
  etiqueta: Punto;
  /** Tarjetas que atraviesa: 0 salvo que no haya otro camino (entonces, las menos posibles). */
  cruces: number;
}

export interface Lateral {
  id: string;
  origen_id: string;
  destino_id: string;
  etiqueta?: string | null;
}

/** Tarjetas de una misma fila, ordenadas por x, y los tramos que ocupan (ya unidos) a lo ancho. */
interface Fila {
  desde: number;
  hasta: number;
  cajas: Caja[];
  ocupado: [number, number][];
  anchoMayor: number;
}

const COSTO_CRUCE = 1e7; // cruzar una tarjeta solo si no queda otra
const COSTO_CODO = 30; // un codo vale como 30 px de línea: mejor una línea larga y simple que una escalera
const COSTO_ARRIBA = 40; // por arriba llega la línea del superior: se usa si es claramente mejor
const COSTO_COSTADO_CON_ETIQUETA = 400; // de costado a una vecina no queda dónde poner el texto: se prefiere la franja libre
const MARGEN_EXTERIOR = 40; // franja libre sobre la primera fila y bajo la última
const LADO_FILA = 20; // carril por fuera del extremo de una fila
const VECINDAD = 3; // cuántas tarjetas a cada lado de los extremos se miran para cruzar una fila
const ALTO_ETIQUETA = 20;
const ANCHO_LETRA = 6.5;
const ANCHO_ETIQUETA = 192; // el texto más largo se abrevia a esto (max-w-48 en AristaLateral.vue)
// Varias líneas por la misma franja van en carriles distintos; el medio (0,5) es de las líneas jerárquicas.
const CARRILES_FRANJA = [0.25, 0.75, 0.4, 0.6];
const CARRILES_HUECO = [0.5, 0.3, 0.7, 0.4];

const girarPunto = ({ x, y }: Punto): Punto => ({ x: y, y: x });
const girarCaja = ({ x, y, ancho, alto }: Caja): Caja => ({ x: y, y: x, ancho: alto, alto: ancho });

function agruparFilas(cajas: Caja[]): Fila[] {
  const filas: Fila[] = [];
  for (const c of [...cajas].sort((a, b) => a.y - b.y)) {
    const ultima = filas[filas.length - 1];
    if (ultima && c.y < ultima.hasta) {
      ultima.hasta = Math.max(ultima.hasta, c.y + c.alto);
      ultima.cajas.push(c);
    } else filas.push({ desde: c.y, hasta: c.y + c.alto, cajas: [c], ocupado: [], anchoMayor: 0 });
  }
  for (const f of filas) {
    f.cajas.sort((a, b) => a.x - b.x);
    for (const c of f.cajas) {
      f.anchoMayor = Math.max(f.anchoMayor, c.ancho);
      const fin = f.ocupado[f.ocupado.length - 1];
      if (fin && c.x <= fin[1]) fin[1] = Math.max(fin[1], c.x + c.ancho);
      else f.ocupado.push([c.x, c.x + c.ancho]);
    }
  }
  return filas;
}

/** Llama a `visitar` con las cajas cuyo interior toca el rectángulo (cerrado en un eje si es un tramo recto). */
function cajasEn(filas: Fila[], x0: number, x1: number, y0: number, y1: number, visitar: (c: Caja) => void) {
  for (const f of filas) {
    if (f.hasta <= y0) continue;
    if (f.desde >= y1) break;
    // Ordenadas por x: la primera que puede alcanzar x0 se busca a saltos, porque una fila puede tener cientos.
    let lo = 0;
    let hi = f.cajas.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (f.cajas[m]!.x + f.anchoMayor > x0) hi = m;
      else lo = m + 1;
    }
    for (let k = lo; k < f.cajas.length; k++) {
      const c = f.cajas[k]!;
      if (c.x >= x1) break;
      if (c.x + c.ancho > x0 && c.y < y1 && c.y + c.alto > y0) visitar(c);
    }
  }
}

/** Tarjetas que atraviesa un tramo recto (tocar un borde no cuenta). */
function crucesDelTramo(filas: Fila[], p: Punto, q: Punto): number {
  let n = 0;
  cajasEn(filas, Math.min(p.x, q.x), Math.max(p.x, q.x), Math.min(p.y, q.y), Math.max(p.y, q.y), () => n++);
  return n;
}

type Puerto = { x: number; y: number; dx: number; dy: number; costo: number };

function puertos(c: Caja, otra: Caja, i: number, conEtiqueta: boolean): Puerto[] {
  // Abajo y arriba, hacia el lado de la otra tarjeta y lejos del centro (ahí llegan las líneas jerárquicas). Dos líneas de
  // una misma tarjeta no salen del mismo punto.
  const hacia = otra.x + otra.ancho / 2 >= c.x + c.ancho / 2 ? 0.75 : 0.25;
  const x = c.x + c.ancho * (hacia + ((i % 3) - 1) * 0.08);
  const y = c.y + c.alto * (0.5 + ((i % 3) - 1) * 0.2);
  const costado = conEtiqueta ? COSTO_COSTADO_CON_ETIQUETA : 0;
  return [
    { x, y: c.y + c.alto, dx: 0, dy: 1, costo: 0 },
    { x: c.x + c.ancho, y, dx: 1, dy: 0, costo: costado },
    { x: c.x, y, dx: -1, dy: 0, costo: costado },
    { x, y: c.y, dx: 0, dy: -1, costo: COSTO_ARRIBA },
  ];
}

/** Carriles posibles: las franjas entre las filas de por medio y los huecos entre tarjetas cerca de los dos extremos. */
function carriles(filas: Fila[], a: Caja, b: Caja, i: number) {
  const fila = (c: Caja) => filas.findIndex((f) => c.y >= f.desde && c.y < f.hasta);
  const [r0, r1] = [fila(a), fila(b)].sort((m, n) => m - n) as [number, number];
  const enFranja = CARRILES_FRANJA[i % CARRILES_FRANJA.length]!;
  const enHueco = CARRILES_HUECO[i % CARRILES_HUECO.length]!;
  const ys = new Set<number>();
  for (let r = r0 - 1; r <= r1; r++) {
    const arriba = filas[r]?.hasta ?? filas[0]!.desde - MARGEN_EXTERIOR;
    const abajo = filas[r + 1]?.desde ?? filas[filas.length - 1]!.hasta + MARGEN_EXTERIOR;
    ys.add(arriba + (abajo - arriba) * enFranja);
  }
  const xs = new Set<number>();
  const radio = Math.max(a.ancho, b.ancho) * VECINDAD;
  const cerca = (x: number) =>
    (x > a.x - radio && x < a.x + a.ancho + radio) || (x > b.x - radio && x < b.x + b.ancho + radio);
  for (let r = r0; r <= r1; r++) {
    const { ocupado } = filas[r]!;
    const primero = ocupado[0]![0] - LADO_FILA;
    const ultimo = ocupado[ocupado.length - 1]![1] + LADO_FILA;
    if (cerca(primero)) xs.add(primero);
    if (cerca(ultimo)) xs.add(ultimo);
    for (let k = 1; k < ocupado.length; k++) {
      const [fin, inicio] = [ocupado[k - 1]![1], ocupado[k]![0]];
      if (cerca(fin) || cerca(inicio)) xs.add(fin + (inicio - fin) * enHueco);
    }
  }
  return { xs, ys };
}

/** Cola de prioridad: [costo, estado], sale primero el de menor costo. */
function colaMinima() {
  const cola: [number, number][] = [];
  return {
    vacia: () => !cola.length,
    subir(e: [number, number]) {
      let k = cola.push(e) - 1;
      while (k > 0) {
        const m = (k - 1) >> 1;
        if (cola[m]![0] <= e[0]) break;
        cola[k] = cola[m]!;
        k = m;
      }
      cola[k] = e;
    },
    sacar() {
      const tope = cola[0]!;
      const ultimo = cola.pop()!;
      if (cola.length) {
        let k = 0;
        for (;;) {
          let h = 2 * k + 1;
          if (h >= cola.length) break;
          if (h + 1 < cola.length && cola[h + 1]![0] < cola[h]![0]) h++;
          if (cola[h]![0] >= ultimo[0]) break;
          cola[k] = cola[h]!;
          k = h;
        }
        cola[k] = ultimo;
      }
      return tope;
    },
  };
}

/** Busca el camino más corto y con menos codos, sobre la grilla de carriles; solo cruza una tarjeta si no hay otro. */
function camino(filas: Fila[], a: Caja, b: Caja, i: number, conEtiqueta: boolean): Punto[] | null {
  const salidas = puertos(a, b, i, conEtiqueta);
  const llegadas = puertos(b, a, i, conEtiqueta);
  const { xs: xSet, ys: ySet } = carriles(filas, a, b, i);
  for (const p of [...salidas, ...llegadas]) (p.dx ? ySet : xSet).add(p.dx ? p.y : p.x);
  const xs = [...xSet].sort((m, n) => m - n);
  const ys = [...ySet].sort((m, n) => m - n);
  const nodo = (ix: number, iy: number, h: 0 | 1) => (iy * xs.length + ix) * 2 + h;
  const hacia = (lista: number[], desde: number, signo: number) => {
    if (signo > 0) return lista.findIndex((v) => v > desde);
    for (let k = lista.length - 1; k >= 0; k--) if (lista[k]! < desde) return k;
    return -1;
  };
  // El primer cruce de carriles hacia afuera de cada puerto; cada puerto sale perpendicular a su borde.
  const entrada = (p: Puerto) => {
    const ix = p.dx ? hacia(xs, p.x, p.dx) : xs.indexOf(p.x);
    const iy = p.dy ? hacia(ys, p.y, p.dy) : ys.indexOf(p.y);
    if (ix < 0 || iy < 0) return null;
    const q = { x: xs[ix]!, y: ys[iy]! };
    return {
      p,
      ix,
      iy,
      h: (p.dx ? 1 : 0) as 0 | 1,
      costo: p.costo + Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + COSTO_CRUCE * crucesDelTramo(filas, p, q),
    };
  };
  const distancia = new Float64Array(xs.length * ys.length * 2).fill(Infinity);
  const previo = new Int32Array(distancia.length).fill(-1);
  const salidaDe = new Map<number, Puerto>();
  const { subir, sacar, vacia } = colaMinima();
  for (const e of salidas.map(entrada)) {
    if (!e) continue;
    const s = nodo(e.ix, e.iy, e.h);
    if (e.costo < distancia[s]!) {
      distancia[s] = e.costo;
      salidaDe.set(s, e.p);
      subir([e.costo, s]);
    }
  }
  const metas = llegadas.flatMap((p) => {
    const e = entrada(p);
    return e ? [e] : [];
  });
  let mejor = Infinity;
  let fin = -1;
  let llegada: Puerto | null = null;
  while (!vacia()) {
    const [d, s] = sacar();
    if (d > distancia[s]!) continue;
    if (d >= mejor) break;
    const h = (s & 1) as 0 | 1;
    const lugar = s >> 1;
    const iy = Math.floor(lugar / xs.length);
    const ix = lugar - iy * xs.length;
    for (const m of metas) {
      if (m.ix !== ix || m.iy !== iy) continue;
      const total = d + m.costo + (m.h === h ? 0 : COSTO_CODO);
      if (total < mejor) {
        mejor = total;
        fin = s;
        llegada = m.p;
      }
    }
    const aqui = { x: xs[ix]!, y: ys[iy]! };
    for (const [jx, jy] of [
      [ix - 1, iy],
      [ix + 1, iy],
      [ix, iy - 1],
      [ix, iy + 1],
    ] as const) {
      if (jx < 0 || jy < 0 || jx >= xs.length || jy >= ys.length) continue;
      const sigH = (jy === iy ? 1 : 0) as 0 | 1;
      const alla = { x: xs[jx]!, y: ys[jy]! };
      const paso =
        Math.abs(alla.x - aqui.x) +
        Math.abs(alla.y - aqui.y) +
        (sigH === h ? 0 : COSTO_CODO) +
        COSTO_CRUCE * crucesDelTramo(filas, aqui, alla);
      const t = nodo(jx, jy, sigH);
      if (d + paso < distancia[t]!) {
        distancia[t] = d + paso;
        previo[t] = s;
        subir([d + paso, t]);
      }
    }
  }
  if (fin < 0 || !llegada) return null;
  const puntos: Punto[] = [llegada];
  let s = fin;
  for (;;) {
    const lugar = s >> 1;
    const iy = Math.floor(lugar / xs.length);
    puntos.push({ x: xs[lugar - iy * xs.length]!, y: ys[iy]! });
    if (previo[s]! < 0) break;
    s = previo[s]!;
  }
  puntos.push(salidaDe.get(s)!);
  return simplificar(puntos.reverse());
}

function simplificar(puntos: Punto[]): Punto[] {
  const limpios = puntos
    .map(({ x, y }) => ({ x, y }))
    .filter((p, k, l) => !k || p.x !== l[k - 1]!.x || p.y !== l[k - 1]!.y);
  return limpios.filter((p, k) => {
    const [a, b] = [limpios[k - 1], limpios[k + 1]];
    return !a || !b || !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}

const solape = (p: Punto, w: number, h: number, c: Caja) =>
  Math.max(0, Math.min(p.x + w / 2, c.x + c.ancho) - Math.max(p.x - w / 2, c.x)) *
  Math.max(0, Math.min(p.y + h / 2, c.y + c.alto) - Math.max(p.y - h / 2, c.y));

/**
 * El punto de la línea donde la etiqueta tapa menos tarjetas y otras etiquetas. Se mira primero el tramo más largo que corre
 * a lo ancho de la pantalla (ahí cabe el texto) y desde su centro hacia afuera. `pantallaX`: el eje horizontal de la pantalla.
 */
function ubicarEtiqueta(
  puntos: Punto[],
  [w, h]: [number, number],
  filas: Fila[],
  ocupadas: Caja[],
  pantallaX: "x" | "y",
): Punto {
  const largo = (p: Punto, q: Punto) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
  const tramos = puntos
    .slice(1)
    .map((q, k): [Punto, Punto] => [puntos[k]!, q])
    .sort((m, n) => {
      const [am, an] = [m[0][pantallaX] !== m[1][pantallaX], n[0][pantallaX] !== n[1][pantallaX]];
      return am === an ? largo(n[0], n[1]) - largo(m[0], m[1]) : am ? -1 : 1;
    });
  const tapa = (p: Punto) => {
    let total = 0;
    const sumar = (c: Caja) => (total += solape(p, w, h, c));
    cajasEn(filas, p.x - w / 2, p.x + w / 2, p.y - h / 2, p.y + h / 2, sumar);
    ocupadas.forEach(sumar);
    return total;
  };
  let mejor = puntos[0]!;
  let menos = Infinity;
  for (const [p, q] of tramos) {
    const paso = Math.max(8, largo(p, q) / 48) / Math.max(1, largo(p, q));
    for (let d = 0; d <= 0.5; d += paso) {
      for (const t of d ? [0.5 - d, 0.5 + d] : [0.5]) {
        const c = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
        const n = tapa(c);
        if (n < menos) {
          menos = n;
          mejor = c;
        }
        if (!n) return mejor;
      }
    }
  }
  return mejor;
}

/** Ancho que ocupará la etiqueta en el lienzo (sin medir el DOM): el texto largo se abrevia. */
const anchoEtiqueta = (texto: string) => Math.min(ANCHO_ETIQUETA, texto.length * ANCHO_LETRA + 14);

/**
 * El trazado de cada lateral cuyas dos tarjetas están en `cajas`. Si no hay un camino sin cruzar tarjetas (una unidad rodeada
 * por completo), devuelve el que cruza menos y lo dice en `cruces`.
 */
export function trazarLaterales(
  laterales: Lateral[],
  cajas: ReadonlyMap<string, Caja>,
  direccion: "vertical" | "horizontal",
): Map<string, Trazado> {
  const horizontal = direccion === "horizontal";
  const normCaja = horizontal ? girarCaja : (c: Caja) => c;
  const norm = horizontal ? girarPunto : (p: Punto) => p;
  const res = new Map<string, Trazado>();
  if (!laterales.length) return res;
  const filas = agruparFilas([...cajas.values()].map(normCaja));
  const ocupadas: Caja[] = [];
  laterales.forEach((l, i) => {
    const [ca, cb] = [cajas.get(l.origen_id), cajas.get(l.destino_id)];
    if (!ca || !cb || ca === cb) return;
    const [a, b] = [normCaja(ca), normCaja(cb)];
    const puntos = camino(filas, a, b, i, !!l.etiqueta) ?? [
      { x: a.x + a.ancho / 2, y: a.y + a.alto / 2 },
      { x: b.x + b.ancho / 2, y: b.y + b.alto / 2 },
    ];
    const ancho = anchoEtiqueta(l.etiqueta ?? "");
    const medida: [number, number] = horizontal ? [ALTO_ETIQUETA, ancho] : [ancho, ALTO_ETIQUETA];
    const etiqueta = l.etiqueta
      ? ubicarEtiqueta(puntos, medida, filas, ocupadas, horizontal ? "y" : "x")
      : puntos[0]!;
    if (l.etiqueta) {
      const [w, h] = medida;
      ocupadas.push({ x: etiqueta.x - w / 2, y: etiqueta.y - h / 2, ancho: w, alto: h });
    }
    res.set(l.id, {
      puntos: puntos.map(norm),
      etiqueta: norm(etiqueta),
      cruces: puntos.slice(1).reduce((n, q, k) => n + crucesDelTramo(filas, puntos[k]!, q), 0),
    });
  });
  return res;
}

/** El `d` de un <path>: la línea con las esquinas redondeadas (sin pasarse de la mitad de cada tramo). */
export function caminoSvg(puntos: Punto[], radio = 8): string {
  const partes = [`M ${puntos[0]!.x} ${puntos[0]!.y}`];
  for (let k = 1; k < puntos.length - 1; k++) {
    const [a, p, b] = [puntos[k - 1]!, puntos[k]!, puntos[k + 1]!];
    const largo = (m: Punto) => Math.abs(m.x - p.x) + Math.abs(m.y - p.y);
    const r = Math.min(radio, largo(a) / 2, largo(b) / 2);
    const junto = (m: Punto) => ({
      x: p.x + (Math.sign(m.x - p.x) || 0) * r,
      y: p.y + (Math.sign(m.y - p.y) || 0) * r,
    });
    const [e, s] = [junto(a), junto(b)];
    partes.push(`L ${e.x} ${e.y} Q ${p.x} ${p.y} ${s.x} ${s.y}`);
  }
  const fin = puntos[puntos.length - 1]!;
  partes.push(`L ${fin.x} ${fin.y}`);
  return partes.join(" ");
}
