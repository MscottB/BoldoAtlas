import type { DatosVisor, PersonaPanel } from "../datos";
import { dibujar, traductor } from "./dibujo";
import {
  abrirHasta,
  buscar,
  desplegar,
  enlaceCorreo,
  enlaceTelefono,
  filasDeLista,
  moverEnLista,
  plegar,
  posicionEnHermanos,
  siguienteResultado,
  type TeclaLista,
} from "./estado";

// La página del visor, armada con createElement y textContent: ningún texto de los datos entra como HTML. La única
// excepción es el SVG de `dibujar`, que ya sale escapado. Cada parte lleva su `data-visor`, que es lo que usan las
// pruebas del archivo.

type Caja = { x: number; y: number; w: number; h: number };
const TECLAS_LISTA = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);
const SEP = " › ";

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...hijos: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...hijos);
  return e;
}

const esCampo = (x: EventTarget | null) =>
  x instanceof HTMLElement && (x.matches("input,textarea,select") || x.isContentEditable);

/** Arma el visor en la página (la barra, el diagrama, la lista y el panel) y espera al primer dibujo. */
export async function montar(d: DatosVisor): Promise<void> {
  const t = traductor(d.textos);
  const main = document.querySelector<HTMLElement>('main[data-visor="dibujo"]')!;
  const nombreDe = new Map(d.unidades.map((u) => [u.id, u.nombre]));

  let plegadas = new Set(d.plegadas);
  let vista: "diagrama" | "lista" = "diagrama";
  let resaltado: string | null = null;
  let svg: SVGSVGElement | null = null;
  let fit: Caja = { x: 0, y: 0, w: 1, h: 1 };
  let vb: Caja | null = null;
  let ticket = 0;
  let sucio = false; // el diagrama quedó atrás de lo plegado mientras se veía la lista
  let focoLista = "";

  // ---- La barra
  const boton = (visor: string, etiqueta: string, texto: string, alPulsar: () => void) => {
    const b = h(
      "button",
      { type: "button", "data-visor": visor, "aria-label": etiqueta, title: etiqueta },
      texto,
    );
    b.addEventListener("click", alPulsar);
    return b;
  };
  const buscador = h("div", { "data-visor": "buscador" });
  const campo = h("input", {
    type: "search",
    "data-visor": "buscar",
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": "false",
    "aria-controls": "visor-resultados",
    "aria-label": t("visor.buscar"),
    placeholder: t("visor.buscar"),
    autocomplete: "off",
  });
  const resultados = h("ul", {
    id: "visor-resultados",
    "data-visor": "resultados",
    role: "listbox",
    "aria-label": t("visor.resultados"),
  });
  resultados.hidden = true;
  buscador.append(campo, resultados);

  const zoom = h(
    "div",
    { "data-visor": "zoom", role: "group" },
    boton("acercar", t("visor.acercar"), "+", () => zoomCentro(1.25)),
    boton("alejar", t("visor.alejar"), "−", () => zoomCentro(0.8)),
    boton("encuadrar", t("visor.encuadrar"), "⤢", () => encuadrar()),
  );
  const bDiagrama = boton(
    "vista-diagrama",
    t("visor.diagrama"),
    t("visor.diagrama"),
    () => void verVista("diagrama"),
  );
  const bLista = boton("vista-lista", t("visor.lista"), t("visor.lista"), () => void verVista("lista"));
  const cambio = h(
    "div",
    { "data-visor": "vista", role: "group", "aria-label": t("visor.vista") },
    bDiagrama,
    bLista,
  );

  const { organizacion, alcance, fecha, logo } = d.encabezado;
  const barra = h(
    "header",
    { "data-visor": "barra" },
    h(
      "div",
      { "data-visor": "titulos" },
      h("span", { "data-visor": "organizacion" }, organizacion),
      h("span", { "data-visor": "alcance" }, `${alcance} · ${fecha}`),
    ),
    h("span", { "data-visor": "generado" }, t("visor.generado", { generado: d.generado })),
    buscador,
    zoom,
    cambio,
  );
  if (logo) {
    const img = h("img", { "data-visor": "logo", alt: "" });
    img.src = logo;
    barra.prepend(img);
  }
  const estado = h("div", { "data-visor": "estado", role: "status" });
  const lista = h("div", { "data-visor": "lista", role: "tree", "aria-label": t("visor.organigrama") });
  lista.hidden = true;
  const panel = h("aside", {
    "data-visor": "panel",
    role: "dialog",
    "aria-labelledby": "visor-panel-titulo",
  });
  panel.hidden = true;
  main.setAttribute("aria-label", t("visor.organigrama"));
  document.body.insertBefore(barra, main);
  document.body.append(estado, lista, panel);

  // ---- El diagrama: el viewBox es lo único que se mueve al arrastrar y acercar.
  const aplicar = () => vb && svg?.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const encuadrar = () => {
    vb = { ...fit };
    aplicar();
  };
  function enSvg(cx: number, cy: number) {
    const m = svg?.getScreenCTM();
    return m ? new DOMPoint(cx, cy).matrixTransform(m.inverse()) : null;
  }
  /** Acerca por `f` dejando quieto el punto de la pantalla (cx, cy). */
  function acercar(f: number, cx: number, cy: number) {
    const p = enSvg(cx, cy);
    if (!p || !vb) return;
    const w = Math.min(Math.max(vb.w / f, fit.w / 20), fit.w * 3);
    const k = vb.w / w;
    vb = { x: p.x - (p.x - vb.x) / k, y: p.y - (p.y - vb.y) / k, w, h: vb.h / k };
    aplicar();
  }
  function zoomCentro(f: number) {
    const r = main.getBoundingClientRect();
    acercar(f, r.left + r.width / 2, r.top + r.height / 2);
  }
  function marcarResaltado() {
    svg?.querySelectorAll(".resaltada").forEach((g) => g.classList.remove("resaltada"));
    if (resaltado) svg?.querySelector(`[data-id="${CSS.escape(resaltado)}"]`)?.classList.add("resaltada");
  }
  function centrar(id: string) {
    const g = svg?.querySelector<SVGGraphicsElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!g || !vb) return;
    const b = g.getBBox();
    const w = Math.min(vb.w, fit.w / 2);
    const alto = (vb.h * w) / vb.w;
    vb = { x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - alto / 2, w, h: alto };
    aplicar();
  }
  function mostrarError() {
    estado.textContent = "";
    document.querySelector('[data-visor="error"]')?.remove();
    document.body.append(h("p", { "data-visor": "error", role: "alert" }, t("visor.error")));
  }
  /** Ordena y dibuja con lo plegado. Si mientras tanto se pidió otro dibujo, este resultado se descarta (false). */
  async function redibujar(): Promise<boolean> {
    const mio = ++ticket;
    sucio = false;
    estado.textContent = t("visor.ordenando");
    try {
      const r = await dibujar(d, plegadas);
      if (mio !== ticket) return false;
      main.innerHTML = r.svg; // ya escapado por treeSvg
      svg = main.querySelector("svg");
      if (svg) {
        const b = svg.viewBox.baseVal;
        fit = { x: b.x, y: b.y, w: b.width, h: b.height };
        vb ??= { ...fit };
        aplicar();
      }
      marcarResaltado();
      estado.textContent = "";
      document.querySelector('[data-visor="error"]')?.remove();
      return true;
    } catch {
      if (mio === ticket) mostrarError();
      return false;
    }
  }

  // Arrastrar mueve: hasta pasar unos pixeles es un clic, para no robarle el clic a las tarjetas.
  let inicio: { x: number; y: number; vb: Caja } | null = null;
  let arrastrando = false;
  let sinClic = false;
  main.addEventListener("pointerdown", (e) => {
    if (e.button === 0 && vb) inicio = { x: e.clientX, y: e.clientY, vb: { ...vb } };
  });
  main.addEventListener("pointermove", (e) => {
    const m = svg?.getScreenCTM();
    if (inicio && !(e.buttons & 1)) soltar(); // se soltó fuera de la página
    if (!inicio || !m) return;
    const [dx, dy] = [e.clientX - inicio.x, e.clientY - inicio.y];
    if (!arrastrando && Math.hypot(dx, dy) > 4) {
      arrastrando = true;
      main.setPointerCapture(e.pointerId);
      main.classList.add("arrastrando");
    }
    if (arrastrando) {
      vb = { ...inicio.vb, x: inicio.vb.x - dx / m.a, y: inicio.vb.y - dy / m.d };
      aplicar();
    }
  });
  function soltar() {
    if (arrastrando) {
      sinClic = true;
      setTimeout(() => (sinClic = false), 0);
    }
    inicio = null;
    arrastrando = false;
    main.classList.remove("arrastrando");
  }
  main.addEventListener("pointerup", soltar);
  main.addEventListener("pointercancel", soltar);
  main.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      acercar(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    },
    { passive: false },
  );
  main.addEventListener("click", (e) => {
    if (sinClic) return;
    const o = (e.target as Element).closest("[data-plegar],[data-id]");
    const plegarId = o?.getAttribute("data-plegar");
    if (plegarId) alternar(plegarId);
    else if (o) abrirPanel(o.getAttribute("data-id")!);
  });
  main.addEventListener("keydown", (e) => {
    const o = (e.target as Element).closest("[data-plegar],[data-id]");
    const plegarId = o?.getAttribute("data-plegar");
    if (plegarId && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      alternar(plegarId);
    } else if (o && !plegarId && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      abrirPanel(o.getAttribute("data-id")!);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) return cerrarPanel();
    if (vista !== "diagrama" || esCampo(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "+" || e.key === "=") zoomCentro(1.25);
    else if (e.key === "-" || e.key === "−") zoomCentro(0.8);
    else if (e.key === "0") encuadrar();
  });

  // ---- Lo plegado, compartido por el diagrama y la lista
  function cambiar(nuevas: Set<string>, volverA?: string) {
    plegadas = nuevas;
    construirLista();
    if (vista === "lista") return void (sucio = true);
    void redibujar().then((ok) => {
      // Tras plegar, el foco vuelve al botón de esa tarjeta (el dibujo nuevo lo reemplazó).
      if (ok && volverA) svg?.querySelector<SVGElement>(`[data-plegar="${CSS.escape(volverA)}"]`)?.focus();
    });
  }
  const alternar = (id: string) =>
    cambiar(plegadas.has(id) ? desplegar(plegadas, id) : plegar(plegadas, id), id);

  // ---- La lista
  function construirLista() {
    const filas = filasDeLista(d, plegadas);
    const pos = posicionEnHermanos(filas);
    if (!filas.some((f) => f.id === focoLista)) focoLista = filas[0]?.id ?? "";
    lista.replaceChildren(
      ...filas.map((f, i) => {
        const fila = h(
          "div",
          {
            role: "treeitem",
            "data-visor": "fila",
            "data-unidad": f.id,
            "aria-level": String(f.nivel),
            "aria-setsize": String(pos[i].tam),
            "aria-posinset": String(pos[i].pos),
            tabindex: f.id === focoLista ? "0" : "-1",
            ...(f.conRamas && { "aria-expanded": String(f.abierta) }),
          },
          h(
            "span",
            { "data-visor": "rama", "aria-hidden": "true" },
            f.conRamas ? (f.abierta ? "▾" : "▸") : "",
          ),
          nombreDe.get(f.id) ?? f.id,
        );
        fila.style.paddingLeft = `${(f.nivel - 1) * 20 + 8}px`;
        fila.classList.toggle("resaltada", f.id === resaltado);
        return fila;
      }),
    );
  }
  const filaDe = (id: string) => lista.querySelector<HTMLElement>(`[data-unidad="${CSS.escape(id)}"]`);
  function enfocarFila(id: string) {
    focoLista = id;
    lista.querySelectorAll("[data-unidad]").forEach((f) => f.setAttribute("tabindex", "-1"));
    const f = filaDe(id);
    f?.setAttribute("tabindex", "0");
    f?.focus();
  }
  lista.addEventListener("click", (e) => {
    const fila = (e.target as Element).closest<HTMLElement>("[data-unidad]");
    if (!fila) return;
    const id = fila.dataset.unidad!;
    focoLista = id;
    if ((e.target as Element).closest('[data-visor="rama"]') && fila.hasAttribute("aria-expanded")) {
      cambiar(plegadas.has(id) ? desplegar(plegadas, id) : plegar(plegadas, id));
      enfocarFila(id);
    } else {
      enfocarFila(id);
      abrirPanel(id);
    }
  });
  lista.addEventListener("keydown", (e) => {
    const id = (e.target as Element).closest<HTMLElement>("[data-unidad]")?.dataset.unidad;
    if (!id) return;
    if (e.key === "Enter") {
      e.preventDefault();
      abrirPanel(id);
    } else if (TECLAS_LISTA.has(e.key)) {
      e.preventDefault();
      const r = moverEnLista(filasDeLista(d, plegadas), id, e.key as TeclaLista);
      focoLista = r.foco;
      if (r.abrir) cambiar(desplegar(plegadas, r.abrir));
      if (r.cerrar) cambiar(plegar(plegadas, r.cerrar));
      enfocarFila(r.foco);
    }
  });

  async function verVista(v: "diagrama" | "lista") {
    vista = v;
    main.hidden = v !== "diagrama";
    zoom.hidden = v !== "diagrama";
    lista.hidden = v !== "lista";
    bDiagrama.setAttribute("aria-pressed", String(v === "diagrama"));
    bLista.setAttribute("aria-pressed", String(v === "lista"));
    if (v === "diagrama" && sucio) await redibujar();
  }

  // ---- El panel de la unidad
  let abridor: Element | null = null;
  let abiertoId = "";
  const persona = (p: PersonaPanel) => {
    const li = h("li", {}, h("div", { "data-visor": "cargo" }, p.cargo || t("visor.sinCargo")));
    // Estructura no lleva nombres: ahí un puesto sin nombre no es una vacante, solo no se dice.
    if (d.nivel !== "estructura")
      li.append(
        p.nombre
          ? h("div", { "data-visor": "nombre" }, p.nombre)
          : h("div", { "data-visor": "vacante" }, t("puesto.vacante")),
      );
    if (p.reemplazo)
      li.append(h("div", { "data-visor": "reemplazo" }, t("puesto.reemplazoDe", { nombre: p.reemplazo })));
    if (p.correo) li.append(h("a", { "data-visor": "correo", href: enlaceCorreo(p.correo) }, p.correo));
    if (p.telefono) {
      const href = enlaceTelefono(p.telefono);
      li.append(
        href
          ? h("a", { "data-visor": "telefono", href }, p.telefono)
          : h("div", { "data-visor": "telefono" }, p.telefono),
      );
    }
    return li;
  };
  function abrirPanel(id: string) {
    const info = d.panel[id];
    if (!info) return;
    abridor = document.activeElement;
    abiertoId = id;
    const cerrar = boton("panel-cerrar", t("visor.cerrar"), "✕", cerrarPanel);
    panel.replaceChildren(
      cerrar,
      h(
        "h2",
        { id: "visor-panel-titulo", "data-visor": "panel-titulo" },
        info.ruta[info.ruta.length - 1] ?? nombreDe.get(id) ?? id,
      ),
      h("div", { "data-visor": "ruta" }, info.ruta.join(SEP)),
      ...(info.jefatura ? [h("h3", {}, t("visor.jefatura")), h("ul", {}, persona(info.jefatura))] : []),
      ...(info.personas.length
        ? [h("h3", {}, t("visor.personas")), h("ul", {}, ...info.personas.map(persona))]
        : info.jefatura
          ? []
          : [h("p", { "data-visor": "sin-puestos" }, t("visor.sinPuestos"))]),
    );
    // Debajo de la barra, para no tapar la búsqueda ni el cambio de vista.
    panel.style.top = `${barra.offsetHeight}px`;
    panel.hidden = false;
    cerrar.focus();
  }
  function cerrarPanel() {
    panel.hidden = true;
    const vuelta = abridor?.isConnected
      ? abridor
      : (svg?.querySelector(`[data-id="${CSS.escape(abiertoId)}"]`) ?? filaDe(abiertoId));
    (vuelta as HTMLElement | null)?.focus();
  }

  // ---- La búsqueda
  let encontrados: ReturnType<typeof buscar> = [];
  let activo = -1;
  const cerrarResultados = () => {
    resultados.hidden = true;
    campo.setAttribute("aria-expanded", "false");
    campo.removeAttribute("aria-activedescendant");
    activo = -1;
  };
  function marcarActivo(i: number) {
    activo = i;
    [...resultados.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
    if (i < 0) return campo.removeAttribute("aria-activedescendant");
    campo.setAttribute("aria-activedescendant", `visor-res-${i}`);
    resultados.children[i]?.scrollIntoView({ block: "nearest" });
  }
  function mostrarResultados() {
    if (!campo.value.trim()) return cerrarResultados();
    encontrados = buscar(d, campo.value);
    resultados.replaceChildren(
      ...(encontrados.length
        ? encontrados.map((r, i) =>
            h(
              "li",
              {
                role: "option",
                id: `visor-res-${i}`,
                "aria-selected": "false",
                "data-visor": "resultado",
                "data-unidad": r.id,
              },
              h("span", {}, r.titulo),
              ...(r.detalle ? [h("span", { "data-visor": "detalle" }, r.detalle)] : []),
            ),
          )
        : [h("li", { role: "option", "aria-disabled": "true" }, t("visor.sinResultados"))]),
    );
    resultados.hidden = false;
    campo.setAttribute("aria-expanded", "true");
    marcarActivo(-1);
  }
  /** Abre las ramas hasta la unidad, la centra, la resalta y abre su panel. */
  async function elegir(id: string) {
    cerrarResultados();
    resaltado = id;
    const abiertas = abrirHasta(plegadas, d.unidades, id);
    const hubo = abiertas.size !== plegadas.size;
    plegadas = abiertas;
    focoLista = id;
    construirLista();
    if (vista === "lista") {
      sucio ||= hubo;
      enfocarFila(id);
    } else {
      if (hubo || !svg) {
        if (!(await redibujar())) return;
      } else marcarResaltado();
      centrar(id);
    }
    abrirPanel(id);
  }
  campo.addEventListener("input", mostrarResultados);
  campo.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (resultados.hidden) mostrarResultados();
      const n = encontrados.length;
      if (n) marcarActivo(siguienteResultado(activo, n, e.key === "ArrowDown"));
    } else if (e.key === "Enter") {
      const r = encontrados[Math.max(activo, 0)];
      if (r && !resultados.hidden) void elegir(r.id);
    } else if (e.key === "Escape" && (campo.value || !resultados.hidden)) {
      e.stopPropagation();
      campo.value = "";
      cerrarResultados();
    }
  });
  // El clic en un resultado no le quita el foco al campo.
  resultados.addEventListener("mousedown", (e) => e.preventDefault());
  resultados.addEventListener("click", (e) => {
    const id = (e.target as Element).closest<HTMLElement>("[data-unidad]")?.dataset.unidad;
    if (id) void elegir(id);
  });
  buscador.addEventListener("focusout", (e) => {
    if (!buscador.contains(e.relatedTarget as Node | null)) cerrarResultados();
  });

  construirLista();
  await verVista("diagrama");
  await redibujar();
}
