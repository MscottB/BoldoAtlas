import { describe, expect, it } from "vitest";
import { unidades } from "../arbol/fixture";
import { destinoNavegacion, resolverAtajo, type TeclaAtajo } from "./atajos";

const tecla = (key: string, extra: Partial<TeclaAtajo> = {}): TeclaAtajo => ({
  key,
  ctrlKey: false,
  metaKey: false,
  enCampoDeTexto: false,
  ...extra,
});

describe("resolverAtajo", () => {
  it("Ctrl+K abre la paleta, también escribiendo en un campo, y Cmd+K en Mac", () => {
    expect(resolverAtajo(tecla("k", { ctrlKey: true }))).toBe("paleta");
    expect(resolverAtajo(tecla("K", { ctrlKey: true, enCampoDeTexto: true }))).toBe("paleta");
    expect(resolverAtajo(tecla("k", { metaKey: true }))).toBe("paleta");
    expect(resolverAtajo(tecla("k"))).toBeNull();
  });

  it("N y F solo fuera de campos de texto, y sin modificadores", () => {
    expect(resolverAtajo(tecla("n"))).toBe("nuevaUnidad");
    expect(resolverAtajo(tecla("N"))).toBe("nuevaUnidad");
    expect(resolverAtajo(tecla("f"))).toBe("buscarLienzo");
    expect(resolverAtajo(tecla("n", { enCampoDeTexto: true }))).toBeNull();
    expect(resolverAtajo(tecla("f", { enCampoDeTexto: true }))).toBeNull();
    expect(resolverAtajo(tecla("n", { ctrlKey: true }))).toBeNull();
    expect(resolverAtajo(tecla("f", { altKey: true }))).toBeNull();
  });

  it("Supr elimina solo fuera de campos", () => {
    expect(resolverAtajo(tecla("Delete"))).toBe("eliminar");
    expect(resolverAtajo(tecla("Delete", { enCampoDeTexto: true }))).toBeNull();
  });

  it("Esc cierra, también en un campo; Ctrl+0 encuadra", () => {
    expect(resolverAtajo(tecla("Escape"))).toBe("cerrar");
    expect(resolverAtajo(tecla("Escape", { enCampoDeTexto: true }))).toBe("cerrar");
    expect(resolverAtajo(tecla("0", { ctrlKey: true }))).toBe("encuadrar");
    expect(resolverAtajo(tecla("0"))).toBeNull();
  });

  it("las flechas recorren el árbol fuera de campos de texto", () => {
    expect(resolverAtajo(tecla("ArrowUp"))).toBe("irSuperior");
    expect(resolverAtajo(tecla("ArrowDown"))).toBe("irPrimerHijo");
    expect(resolverAtajo(tecla("ArrowLeft"))).toBe("irHermanoAnterior");
    expect(resolverAtajo(tecla("ArrowRight"))).toBe("irHermanoSiguiente");
    expect(resolverAtajo(tecla("ArrowLeft", { enCampoDeTexto: true }))).toBeNull();
    expect(resolverAtajo(tecla("ArrowUp", { ctrlKey: true }))).toBeNull();
  });

  it("con el árbol en horizontal las flechas siguen el dibujo", () => {
    const h = { horizontal: true };
    expect(resolverAtajo(tecla("ArrowLeft", h))).toBe("irSuperior");
    expect(resolverAtajo(tecla("ArrowRight", h))).toBe("irPrimerHijo");
    expect(resolverAtajo(tecla("ArrowUp", h))).toBe("irHermanoAnterior");
    expect(resolverAtajo(tecla("ArrowDown", h))).toBe("irHermanoSiguiente");
  });

  it("con un diálogo o menú abierto no actúa ningún atajo", () => {
    for (const key of ["n", "f", "Delete", "Escape", "ArrowUp"])
      expect(resolverAtajo(tecla(key, { modalAbierto: true }))).toBeNull();
    expect(resolverAtajo(tecla("k", { ctrlKey: true, modalAbierto: true }))).toBeNull();
  });

  it("en la vista a una fecha (solo lectura) N y Supr no hacen nada; el resto sigue", () => {
    expect(resolverAtajo(tecla("n", { soloLectura: true }))).toBeNull();
    expect(resolverAtajo(tecla("Delete", { soloLectura: true }))).toBeNull();
    expect(resolverAtajo(tecla("f", { soloLectura: true }))).toBe("buscarLienzo");
    expect(resolverAtajo(tecla("ArrowDown", { soloLectura: true }))).toBe("irPrimerHijo");
    // Mayús+flecha extiende la selección múltiple, que no existe en solo lectura
    expect(resolverAtajo(tecla("ArrowDown", { soloLectura: true, shiftKey: true }))).toBeNull();
    expect(
      resolverAtajo(tecla("ArrowLeft", { soloLectura: true, shiftKey: true, horizontal: true })),
    ).toBeNull();
  });
});

describe("resolverAtajo: selección múltiple y duplicar", () => {
  it("Mayús+flecha extiende la selección hacia donde iría la flecha", () => {
    const m = { shiftKey: true };
    expect(resolverAtajo(tecla("ArrowUp", m))).toBe("extender:irSuperior");
    expect(resolverAtajo(tecla("ArrowDown", m))).toBe("extender:irPrimerHijo");
    expect(resolverAtajo(tecla("ArrowLeft", m))).toBe("extender:irHermanoAnterior");
    expect(resolverAtajo(tecla("ArrowRight", m))).toBe("extender:irHermanoSiguiente");
  });

  it("con el árbol en horizontal Mayús+flecha sigue el dibujo, igual que la flecha sola", () => {
    const m = { shiftKey: true, horizontal: true };
    expect(resolverAtajo(tecla("ArrowLeft", m))).toBe("extender:irSuperior");
    expect(resolverAtajo(tecla("ArrowRight", m))).toBe("extender:irPrimerHijo");
    expect(resolverAtajo(tecla("ArrowUp", m))).toBe("extender:irHermanoAnterior");
    expect(resolverAtajo(tecla("ArrowDown", m))).toBe("extender:irHermanoSiguiente");
  });

  it("Mayús+flecha no actúa escribiendo, con Ctrl/Alt ni con un diálogo abierto", () => {
    expect(resolverAtajo(tecla("ArrowUp", { shiftKey: true, enCampoDeTexto: true }))).toBeNull();
    expect(resolverAtajo(tecla("ArrowUp", { shiftKey: true, ctrlKey: true }))).toBeNull();
    expect(resolverAtajo(tecla("ArrowUp", { shiftKey: true, altKey: true }))).toBeNull();
    expect(resolverAtajo(tecla("ArrowUp", { shiftKey: true, modalAbierto: true }))).toBeNull();
  });

  it("Mayús no cambia N ni Supr (la N mayúscula sigue siendo N)", () => {
    expect(resolverAtajo(tecla("N", { shiftKey: true }))).toBe("nuevaUnidad");
    expect(resolverAtajo(tecla("Delete", { shiftKey: true }))).toBe("eliminar");
  });

  it("Ctrl+D (y Cmd+D) duplica la rama, también con la letra en mayúscula", () => {
    expect(resolverAtajo(tecla("d", { ctrlKey: true }))).toBe("duplicar");
    expect(resolverAtajo(tecla("D", { ctrlKey: true }))).toBe("duplicar");
    expect(resolverAtajo(tecla("d", { metaKey: true }))).toBe("duplicar");
  });

  it("D sola, o con Alt, no duplica", () => {
    expect(resolverAtajo(tecla("d"))).toBeNull();
    expect(resolverAtajo(tecla("d", { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it("Ctrl+D no actúa escribiendo, con un diálogo abierto ni viendo una fecha (solo lectura)", () => {
    expect(resolverAtajo(tecla("d", { ctrlKey: true, enCampoDeTexto: true }))).toBeNull();
    expect(resolverAtajo(tecla("d", { ctrlKey: true, modalAbierto: true }))).toBeNull();
    expect(resolverAtajo(tecla("d", { ctrlKey: true, soloLectura: true }))).toBeNull();
  });
});

describe("destinoNavegacion", () => {
  // GG › {Operaciones (orden 0) › Mantención › {Mecánica, Eléctrica}, Finanzas (orden 1)}
  const ir = (actual: string | null, a: Parameters<typeof destinoNavegacion>[2], lista = unidades) =>
    destinoNavegacion(lista, actual, a);

  it("superior, primer hijo y hermanos, en el orden del árbol", () => {
    expect(ir("mantencion", "irSuperior")).toBe("operaciones");
    expect(ir("gg", "irSuperior")).toBeNull();
    expect(ir("gg", "irPrimerHijo")).toBe("operaciones");
    expect(ir("mecanica", "irPrimerHijo")).toBeNull();
    expect(ir("operaciones", "irHermanoSiguiente")).toBe("finanzas");
    expect(ir("finanzas", "irHermanoAnterior")).toBe("operaciones");
    expect(ir("operaciones", "irHermanoAnterior")).toBeNull();
    expect(ir("finanzas", "irHermanoSiguiente")).toBeNull();
  });

  it("ignora las unidades borradas", () => {
    // misma posición: desempata el nombre (Eléctrica antes que Mecánica); «Borrada» no cuenta
    expect(ir("electrica", "irHermanoSiguiente")).toBe("mecanica");
    expect(ir("mecanica", "irHermanoSiguiente")).toBeNull();
  });

  it("sin selección (o con una que ya no existe) cualquier flecha va a la primera raíz", () => {
    expect(ir(null, "irPrimerHijo")).toBe("gg");
    expect(ir("fantasma", "irSuperior")).toBe("gg");
  });

  it("en una rama enfocada su raíz no tiene superior ni hermanos", () => {
    const rama = unidades.filter((x) => ["mantencion", "mecanica", "electrica"].includes(x.id));
    expect(ir("mantencion", "irSuperior", rama)).toBeNull();
    expect(ir("mantencion", "irHermanoSiguiente", rama)).toBeNull();
    expect(ir("mantencion", "irPrimerHijo", rama)).toBe("electrica");
  });
});
