import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import * as U from "@/db/repos/unidades";
import { useOrganizacion } from "./organizacion";
import { TIPO_AREA, TIPO_GERENCIA, TIPO_OTRA, TIPO_SUBAREA } from "@/db/tipos";
import { cambiarIdioma } from "@/i18n";
import { vigentesPorPuesto } from "@/features/arbol/jerarquia";

// antesDeLote / antesDeMeta: ganchos de los tests para pausar una llamada y forzar solapes.
const h = vi.hoisted(() => ({
  bd: null as BasePrueba | null,
  antesDeLote: null as (() => Promise<void>) | null,
  antesDeMeta: null as (() => Promise<void>) | null,
}));

// El store corre SQL real sobre el esquema real (node:sqlite) detrás de la API de cliente.ts.
vi.mock("@/db/cliente", () => ({
  consultar: async (sql: string, params?: unknown[]) => h.bd!.consultar(sql, params),
  lote: async (s: Parameters<BasePrueba["aplicar"]>[0]) => {
    await h.antesDeLote?.();
    h.bd!.aplicar(s);
  },
  leerMeta: async () => {
    await h.antesDeMeta?.();
    return Object.fromEntries(
      h
        .bd!.consultar<{ clave: string; valor: string | null }>("SELECT clave, valor FROM meta")
        .map((f) => [f.clave, f.valor ?? ""]),
    );
  },
}));

const revision = () =>
  Number(h.bd!.consultar<{ valor: string }>("SELECT valor FROM meta WHERE clave = 'data_revision'")[0].valor);

function nuevo() {
  setActivePinia(createPinia());
  return useOrganizacion();
}

/** Crea una unidad y devuelve su id (falla el test si no se pudo). */
async function unidad(s: ReturnType<typeof nuevo>, nombre: string, parent_id: string | null = null) {
  const r = await s.crearUnidad({ tipo_id: TIPO_AREA, nombre, parent_id });
  if (!r.ok || !r.id) throw new Error("no se creó la unidad");
  return r.id;
}

async function persona(s: ReturnType<typeof nuevo>, nombre: string, correo: string | null = null) {
  const r = await s.crearTrabajador({ nombre, correo });
  if (!r.ok || !r.id) throw new Error("no se creó la persona");
  return r.id;
}

/** Crea un puesto (con un cargo nuevo si no se indica) y devuelve su id. */
async function puesto(s: ReturnType<typeof nuevo>, unidad_id: string, cargo_id?: string) {
  if (!cargo_id) {
    const c = await s.crearValor("cargos", `Cargo ${s.catalogos.cargos.length + 1}`);
    if (!c.ok) throw new Error("no se creó el cargo");
    cargo_id = c.id;
  }
  const r = await s.crearPuesto({ unidad_id, cargo_id });
  if (!r.ok || !r.id) throw new Error("no se creó el puesto");
  return r.id;
}

beforeEach(() => {
  h.bd = abrirBasePrueba();
  h.antesDeLote = null;
  h.antesDeMeta = null;
});
afterEach(() => vi.useRealTimers());

describe("unidades", () => {
  it("crea una raíz y una hija", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    const r = await s.crearUnidad({ tipo_id: TIPO_AREA, nombre: "Hija", parent_id: raiz });
    expect(r.ok).toBe(true);
    expect(s.unidades).toHaveLength(2);
    expect(s.raices.map((u) => u.id)).toEqual([raiz]);
    expect(s.vacia).toBe(false);
  });

  it("rechaza mover una unidad dentro de su propia rama sin escribir", async () => {
    const s = nuevo();
    const padre = await unidad(s, "Padre");
    const hija = await unidad(s, "Hija", padre);
    const antes = revision();
    const r = await s.moverUnidad(padre, hija);
    expect(r).toEqual({ ok: false, mensaje: "No se puede mover una unidad dentro de su propia rama." });
    expect(revision()).toBe(antes);
  });

  it("al eliminar deja hijos y puestos en el superior, y deshacer los devuelve", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    const media = await unidad(s, "Media", raiz);
    const hija = await unidad(s, "Hija", media);
    const p = await puesto(s, media);

    expect((await s.eliminarUnidad(media)).ok).toBe(true);
    expect(s.porId.has(media)).toBe(false);
    expect(s.porId.get(hija)?.parent_id).toBe(raiz);
    expect(s.puestos.find((x) => x.id === p)?.unidad_id).toBe(raiz);
    expect(s.ultimoBorrado).toMatchObject({ tipo: "unidad", id: media });

    expect((await s.deshacer()).ok).toBe(true);
    expect(s.porId.get(media)).toBeDefined();
    expect(s.porId.get(hija)?.parent_id).toBe(media);
    expect(s.puestos.find((x) => x.id === p)?.unidad_id).toBe(media);
    expect(s.ultimoBorrado).toBeNull();
  });

  it("rechaza eliminar una raíz con contenido antes de escribir", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    await unidad(s, "Hija", raiz);
    const antes = revision();
    const r = await s.eliminarUnidad(raiz);
    expect(r).toEqual({
      ok: false,
      mensaje: "No se puede eliminar la unidad raíz mientras tenga contenido.",
    });
    expect(revision()).toBe(antes);
    expect(s.unidades).toHaveLength(2);
  });

  it("rechaza eliminar una raíz que solo tiene puestos", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    await puesto(s, raiz);
    expect((await s.eliminarUnidad(raiz)).ok).toBe(false);
  });

  it("permite eliminar una raíz vacía y queda vacía la organización", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    expect((await s.eliminarUnidad(raiz)).ok).toBe(true);
    expect(s.vacia).toBe(true);
  });
});

describe("trabajadores", () => {
  it("traduce el error de correo repetido y deja el store intacto", async () => {
    const s = nuevo();
    await persona(s, "Ana", "ana@x.cl");
    const r = await s.crearTrabajador({ nombre: "Otra", correo: " ANA@x.cl " });
    expect(r).toEqual({ ok: false, mensaje: "Ya existe una persona con ese correo." });
    expect(s.trabajadores).toHaveLength(1);
    expect(s.error).toBe("Ya existe una persona con ese correo.");
  });

  it("deshacer no hace nada una vez vencido", async () => {
    const s = nuevo();
    const ana = await persona(s, "Ana");
    vi.useFakeTimers({ toFake: ["Date"] });
    await s.eliminarTrabajador(ana);
    expect(s.trabajadores).toHaveLength(0);
    const antes = revision();
    vi.setSystemTime(Date.now() + 8_001);
    const r = await s.deshacer();
    expect(r.ok).toBe(false);
    expect(revision()).toBe(antes);
    expect(s.trabajadores).toHaveLength(0);
  });

  it("deshacer informa si el correo se reutilizó mientras estaba borrado", async () => {
    const s = nuevo();
    const ana = await persona(s, "Ana", "ana@x.cl");
    await s.eliminarTrabajador(ana);
    await persona(s, "Ana bis", "ana@x.cl");
    const r = await s.deshacer();
    expect(r).toEqual({ ok: false, mensaje: "Ya existe una persona con ese correo." });
    expect(s.trabajadores).toHaveLength(1);
  });
});

describe("puestos y asignaciones", () => {
  // Una persona borrada no debe dejar asignaciones vigentes ocultas que bloqueen el puesto.
  async function puestoConPersonaBorrada(tipo: "titular" | "reemplazo") {
    const s = nuevo();
    const p = await puesto(s, await unidad(s, "Raíz"));
    const ana = await persona(s, "Ana");
    vi.useFakeTimers({ toFake: ["Date"] });
    await (tipo === "titular"
      ? s.asignarTitular(p, ana, "2026-03-01")
      : s.registrarReemplazo(p, ana, "2026-03-01"));
    await s.eliminarTrabajador(ana);
    vi.setSystemTime(Date.now() + 8_001); // vence el deshacer
    return { s, p, beto: await persona(s, "Beto") };
  }

  it("tras borrar a la persona del reemplazo vigente, se puede registrar otro reemplazo", async () => {
    const { s, p, beto } = await puestoConPersonaBorrada("reemplazo");
    expect(await s.registrarReemplazo(p, beto, "2026-04-01")).toEqual({ ok: true, id: expect.any(String) });
    expect(s.asignaciones.map((a) => a.trabajador_id)).toEqual([beto]);
  });

  it("tras borrar al titular vigente, se asigna otro titular aunque empiece antes", async () => {
    const { s, p, beto } = await puestoConPersonaBorrada("titular");
    expect((await s.asignarTitular(p, beto, "2026-01-01")).ok).toBe(true);
    expect(s.asignaciones).toEqual([expect.objectContaining({ trabajador_id: beto, hasta: null })]);
  });

  it("deshacer el borrado de una persona devuelve sus asignaciones vigentes", async () => {
    const s = nuevo();
    const p = await puesto(s, await unidad(s, "Raíz"));
    const ana = await persona(s, "Ana");
    await s.asignarTitular(p, ana, "2026-01-01");
    await s.eliminarTrabajador(ana);
    expect(s.asignaciones).toEqual([]);
    expect((await s.deshacer()).ok).toBe(true);
    expect(s.asignaciones).toEqual([
      expect.objectContaining({ trabajador_id: ana, tipo: "titular", hasta: null }),
    ]);
  });

  it("asignar un titular nuevo cierra el anterior y deja el historial", async () => {
    const s = nuevo();
    const p = await puesto(s, await unidad(s, "Raíz"));
    const ana = await persona(s, "Ana");
    const beto = await persona(s, "Beto");
    expect((await s.asignarTitular(p, ana, "2024-01-01")).ok).toBe(true);
    expect((await s.asignarTitular(p, beto, "2026-03-01")).ok).toBe(true);
    expect(s.asignaciones.map((a) => [a.trabajador_id, a.hasta])).toEqual([
      [ana, "2026-03-01"],
      [beto, null],
    ]);
  });

  it("un segundo reemplazo vigente se rechaza con el mensaje traducido; terminar el primero lo permite", async () => {
    const s = nuevo();
    const p = await puesto(s, await unidad(s, "Raíz"));
    const ana = await persona(s, "Ana");
    const r1 = await s.registrarReemplazo(p, ana, "2026-01-01");
    if (!r1.ok || !r1.id) throw new Error("no se registró");
    expect(await s.registrarReemplazo(p, ana, "2026-02-01")).toEqual({
      ok: false,
      mensaje: "Ese puesto ya tiene una asignación vigente de ese tipo.",
    });
    expect((await s.terminarAsignacion(r1.id, "2026-01-31", "Vuelve el titular")).ok).toBe(true);
    expect(s.asignaciones[0]).toMatchObject({ hasta: "2026-01-31", motivo: "Vuelve el titular" });
    expect((await s.registrarReemplazo(p, ana, "2026-02-01", "2026-02-28")).ok).toBe(true);
  });

  it("terminar antes del inicio devuelve ok: false con el mensaje", async () => {
    const s = nuevo();
    const p = await puesto(s, await unidad(s, "Raíz"));
    const r = await s.asignarTitular(p, await persona(s, "Ana"), "2026-01-01");
    expect(await s.terminarAsignacion(r.ok ? r.id! : "", "2025-12-31")).toEqual({
      ok: false,
      mensaje: "La fecha de término no puede ser anterior a la de inicio.",
    });
  });

  it("asignarNuevaPersona crea a la persona y la asigna en un solo lote", async () => {
    const s = nuevo();
    const p = await puesto(s, await unidad(s, "Raíz"));
    const antes = revision();
    const r = await s.asignarNuevaPersona(p, "titular", "Ana Rojas", "2026-01-01");
    expect(r).toEqual({ ok: true, id: expect.any(String) });
    expect(revision()).toBe(antes + 1);
    expect(s.trabajadores.map((w) => w.nombre)).toEqual(["Ana Rojas"]);
    expect(s.asignaciones).toEqual([
      expect.objectContaining({ trabajador_id: r.ok && r.id, tipo: "titular" }),
    ]);
    expect((await s.asignarNuevaPersona(p, "reemplazo", "Beto", "2026-02-01")).ok).toBe(true);
    expect(s.asignaciones.map((a) => a.tipo)).toEqual(["titular", "reemplazo"]);
    // Un reemplazo queda vigente (hasta NULL) hasta "Terminar asignación".
    expect(vigentesPorPuesto(s.asignaciones).get(p)?.reemplazo).toMatchObject({ hasta: null });
  });

  it("asignarNuevaPersona que falla no deja a la persona creada", async () => {
    const s = nuevo();
    const p = await puesto(s, await unidad(s, "Raíz"));
    await s.asignarTitular(p, await persona(s, "Ana"), "2026-05-01");
    const r = await s.asignarNuevaPersona(p, "titular", "Beto", "2026-01-01"); // antes del inicio del titular
    expect(r.ok).toBe(false);
    expect(s.trabajadores.map((w) => w.nombre)).toEqual(["Ana"]);
  });

  it("edita y elimina un puesto; deshacer lo devuelve con su historial", async () => {
    const s = nuevo();
    const p = await puesto(s, await unidad(s, "Raíz"));
    await s.asignarTitular(p, await persona(s, "Ana"), "2026-01-01");
    expect((await s.editarPuesto(p, { descripcion: "Turno noche" })).ok).toBe(true);
    expect(s.puestos[0].descripcion).toBe("Turno noche");
    expect((await s.eliminarPuesto(p)).ok).toBe(true);
    expect(s.puestos).toEqual([]);
    expect(s.asignaciones).toEqual([]);
    expect(s.ultimoBorrado).toMatchObject({ tipo: "puesto", id: p });
    expect((await s.deshacer()).ok).toBe(true);
    expect(s.puestos).toHaveLength(1);
    expect(s.asignaciones).toHaveLength(1);
  });

  it("asignarJefe fija el puesto de jefatura de la unidad", async () => {
    const s = nuevo();
    const u = await unidad(s, "Raíz");
    const p = await puesto(s, u);
    await s.asignarJefe(u, p);
    expect(s.porId.get(u)?.jefe_puesto_id).toBe(p);
  });

  it("usos de un cargo cuenta puestos; los demás mantenedores, personas", async () => {
    const s = nuevo();
    const u = await unidad(s, "Raíz");
    const cargo = await s.crearValor("cargos", "Analista");
    if (!cargo.ok) throw new Error("no se creó");
    await puesto(s, u, cargo.id);
    await puesto(s, u, cargo.id);
    const sede = await s.crearValor("sedes", "Norte");
    if (!sede.ok) throw new Error("no se creó");
    await s.crearTrabajador({ nombre: "Ana", sede_id: sede.id });
    expect(s.usos("cargos", cargo.id)).toBe(2);
    expect(s.usos("sedes", sede.id)).toBe(1);
  });

  it("carga los tipos de unidad sembrados; usos de un tipo cuenta unidades", async () => {
    const s = nuevo();
    await s.cargar();
    expect(s.activos("tipos_unidad").map((v) => v.nombre)).toEqual(["Gerencia", "Área", "Subárea", "Otra"]);
    await unidad(s, "A");
    await unidad(s, "B");
    expect(s.usos("tipos_unidad", TIPO_AREA)).toBe(2);
    expect(s.usos("tipos_unidad", TIPO_GERENCIA)).toBe(0);
  });
});

describe("cargarEjemplo", () => {
  it("crea una organización de muestra en un solo lote", async () => {
    const s = nuevo();
    const antes = revision();
    const r = await s.cargarEjemplo();
    expect(r).toEqual({ ok: true });
    expect(revision()).toBe(antes + 1);
    expect(s.unidades.length).toBeGreaterThanOrEqual(10);
    expect(s.conexiones.length).toBeGreaterThanOrEqual(1);
    const titulares = s.asignaciones.filter((a) => a.tipo === "titular");
    const conTitular = new Set(titulares.filter((a) => a.hasta === null).map((a) => a.puesto_id));
    expect(s.puestos.some((p) => !conTitular.has(p.id))).toBe(true); // una vacante
    expect(s.asignaciones.some((a) => a.tipo === "reemplazo" && a.hasta === null)).toBe(true);
    const veces = new Map<string, number>();
    for (const a of titulares) veces.set(a.puesto_id, (veces.get(a.puesto_id) ?? 0) + 1);
    expect(Math.max(...veces.values())).toBeGreaterThanOrEqual(2); // historial de titulares
    expect(s.etiquetas.length).toBeGreaterThanOrEqual(3);
    for (const tabla of ["cargos", "tipos_contrato", "sedes", "jornadas"] as const)
      expect(s.activos(tabla).length).toBeGreaterThan(0);
    // Un tipo agregado como dato, entre Gerencia y Área, y usado por alguna unidad.
    expect(s.activos("tipos_unidad").map((v) => v.nombre)).toEqual([
      "Gerencia",
      "Superintendencia",
      "Área",
      "Subárea",
      "Otra",
    ]);
    const sup = s.activos("tipos_unidad")[1].id;
    expect(s.usos("tipos_unidad", sup)).toBeGreaterThan(0);
    expect(s.org.nombre).toBe("Compañía Demo");
    expect(s.unidades.some((u) => u.jefe_puesto_id)).toBe(true);
    // Marcas en las gerencias y la superintendencia, para probar «Colorear por».
    const conMarca = s.unidades.filter((u) => u.marca_color && u.marca_codigo);
    expect(conMarca.some((u) => u.tipo_id === TIPO_GERENCIA)).toBe(true);
    expect(conMarca.some((u) => u.tipo_id === sup)).toBe(true);
    // Leyendas de puestos, asignadas a algunos puestos y no a todos.
    expect(s.leyendasActivas.length).toBeGreaterThanOrEqual(2);
    const conLeyenda = s.puestos.filter((p) => p.leyenda_id);
    expect(conLeyenda.length).toBeGreaterThan(0);
    expect(conLeyenda.length).toBeLessThan(s.puestos.length);
    expect(new Set(conLeyenda.map((p) => p.leyenda_id)).size).toBeGreaterThanOrEqual(2);
  });
});

describe("leyendas de puestos", () => {
  async function leyenda(s: ReturnType<typeof nuevo>, nombre = "Crítico", color = "#be123c") {
    const r = await s.crearLeyenda({ nombre, color });
    if (!r.ok) throw new Error("no se creó la leyenda");
    return r.id;
  }

  it("crea con el color en minúsculas y las ordena", async () => {
    const s = nuevo();
    const a = await leyenda(s, " Crítico ", "#BE123C");
    const b = await leyenda(s, "En sucesión", "#b45309");
    expect(s.leyendasActivas.map((l) => [l.id, l.nombre, l.color])).toEqual([
      [a, "Crítico", "#be123c"],
      [b, "En sucesión", "#b45309"],
    ]);
    await s.moverLeyenda(b, 0);
    expect(s.leyendasActivas.map((l) => l.id)).toEqual([b, a]);
  });

  it("rechaza un color inválido o un nombre vacío sin escribir", async () => {
    const s = nuevo();
    const antes = revision();
    expect(await s.crearLeyenda({ nombre: "X", color: "rojo" })).toEqual({
      ok: false,
      mensaje: "El color debe tener el formato #rrggbb (por ejemplo, #be123c).",
    });
    expect(await s.crearLeyenda({ nombre: "  ", color: "#be123c" })).toEqual({
      ok: false,
      mensaje: "Escribe un nombre.",
    });
    const a = await leyenda(s);
    expect((await s.editarLeyenda(a, { color: "#zzz" })).ok).toBe(false);
    expect(revision()).toBe(antes + 1); // solo la creación válida
  });

  it("no crea una entrada activa repetida y devuelve la existente", async () => {
    const s = nuevo();
    const a = await leyenda(s, "En sucesión");
    const r = await s.crearLeyenda({ nombre: "en  SUCESION", color: "#0f766e" });
    expect(r).toEqual({ ok: false, mensaje: "Ya existe «En sucesión» en la lista.", existente: a });
    await s.desactivarLeyenda(a);
    expect((await s.crearLeyenda({ nombre: "en sucesion", color: "#0f766e" })).ok).toBe(true);
  });

  it("crear y asignar a un puesto es un solo lote", async () => {
    const s = nuevo();
    const p = await puesto(s, await unidad(s, "Raíz"));
    const antes = revision();
    const r = await s.crearLeyenda({ nombre: "Crítico", color: "#be123c" }, p);
    if (!r.ok) throw new Error("no se creó");
    expect(revision()).toBe(antes + 1);
    expect(s.puestos[0].leyenda_id).toBe(r.id);
  });

  it("edita color y descripción, renombra y desactiva; el puesto conserva la entrada", async () => {
    const s = nuevo();
    const a = await leyenda(s);
    const p = await puesto(s, await unidad(s, "Raíz"));
    await s.asignarLeyenda(p, a);
    await s.editarLeyenda(a, { color: "#0F766E", descripcion: "Clave para la operación" });
    await s.renombrarLeyenda(a, "Muy crítico");
    expect(s.leyendas[0]).toMatchObject({
      nombre: "Muy crítico",
      color: "#0f766e",
      descripcion: "Clave para la operación",
    });
    expect((await s.renombrarLeyenda(a, " ")).ok).toBe(false);
    await s.desactivarLeyenda(a);
    expect(s.leyendasActivas).toEqual([]);
    expect(s.leyendas).toHaveLength(1);
    expect(s.puestos[0].leyenda_id).toBe(a);
    await s.reactivarLeyenda(a);
    expect(s.leyendasActivas).toHaveLength(1);
  });

  it("renombrar a un nombre que ya existe da un error traducido", async () => {
    const s = nuevo();
    await leyenda(s, "Critico");
    const b = await leyenda(s, "Clave", "#0f766e");
    expect(await s.renombrarLeyenda(b, " CRITICO ")).toEqual({
      ok: false,
      mensaje: "Ese valor ya existe en la lista.",
    });
  });

  describe("copiar y pegar estilo", () => {
    it("no se puede pegar si no se copió nada", async () => {
      const s = nuevo();
      const p = await puesto(s, await unidad(s, "Raíz"));
      expect(s.puedePegarEstilo).toBe(false);
      const antes = revision();
      expect((await s.pegarEstilo(p)).ok).toBe(false);
      expect(revision()).toBe(antes);
    });

    it("pega la misma entrada en otro puesto", async () => {
      const s = nuevo();
      const u = await unidad(s, "Raíz");
      const [a, b] = [await puesto(s, u), await puesto(s, u)];
      const l = await leyenda(s);
      await s.asignarLeyenda(a, l);
      expect(s.copiarEstilo(a)).toEqual({ ok: true });
      expect(s.puedePegarEstilo).toBe(true);
      expect((await s.pegarEstilo(b)).ok).toBe(true);
      expect(s.puestos.find((x) => x.id === b)?.leyenda_id).toBe(l);
      expect(s.puedePegarEstilo).toBe(true); // se puede pegar en varios puestos
    });

    it("copiar un puesto sin estilo y pegar lo deja sin estilo", async () => {
      const s = nuevo();
      const u = await unidad(s, "Raíz");
      const [a, b] = [await puesto(s, u), await puesto(s, u)];
      await s.asignarLeyenda(b, await leyenda(s));
      s.copiarEstilo(a);
      expect(s.puedePegarEstilo).toBe(true);
      await s.pegarEstilo(b);
      expect(s.puestos.find((x) => x.id === b)?.leyenda_id).toBeNull();
    });

    it("si la entrada copiada se desactiva, ya no se puede pegar", async () => {
      const s = nuevo();
      const u = await unidad(s, "Raíz");
      const [a, b] = [await puesto(s, u), await puesto(s, u)];
      const l = await leyenda(s);
      await s.asignarLeyenda(a, l);
      s.copiarEstilo(a);
      await s.desactivarLeyenda(l);
      expect(s.puedePegarEstilo).toBe(false);
      expect((await s.pegarEstilo(b)).ok).toBe(false);
      expect(s.puestos.find((x) => x.id === b)?.leyenda_id).toBeNull();
    });

    it("copiar un puesto que no existe falla y no pisa lo copiado", async () => {
      const s = nuevo();
      const u = await unidad(s, "Raíz");
      const a = await puesto(s, u);
      s.copiarEstilo(a);
      expect(s.copiarEstilo("no-existe").ok).toBe(false);
      expect(s.puedePegarEstilo).toBe(true);
    });
  });
});

describe("mantenedores", () => {
  it("no crea un valor activo repetido y devuelve el existente", async () => {
    const s = nuevo();
    const a = await s.crearValor("cargos", "Analista de compras");
    if (!a.ok) throw new Error("no se creó");
    const antes = revision();
    const r = await s.crearValor("cargos", "analista  de Compras");
    expect(r).toEqual({
      ok: false,
      mensaje: "Ya existe «Analista de compras» en la lista.",
      existente: a.id,
    });
    expect(revision()).toBe(antes);
  });

  it("crea uno nuevo si el existente está desactivado", async () => {
    const s = nuevo();
    const a = await s.crearValor("cargos", "Analista de compras");
    if (!a.ok) throw new Error("no se creó");
    await s.desactivarValor("cargos", a.id);
    const r = await s.crearValor("cargos", "analista  de Compras");
    expect(r.ok).toBe(true);
    expect(s.activos("cargos")).toHaveLength(1);
    expect(s.catalogos.cargos).toHaveLength(2);
  });

  it("un cargo desactivado en uso se conserva en el puesto y sigue contando", async () => {
    const s = nuevo();
    const cargo = await s.crearValor("cargos", "Analista");
    if (!cargo.ok) throw new Error("no se creó");
    const u = await unidad(s, "Raíz");
    const r = await s.crearPuesto({ unidad_id: u, cargo_id: cargo.id });
    if (!r.ok) throw new Error("no se creó");
    await s.desactivarValor("cargos", cargo.id);
    expect(s.puestos[0].cargo_id).toBe(cargo.id);
    expect(s.activos("cargos").map((v) => v.id)).not.toContain(cargo.id);
    expect(s.usos("cargos", cargo.id)).toBe(1);
  });

  it("activos ordena por orden y luego por nombre", async () => {
    const s = nuevo();
    const b = await s.crearValor("sedes", "Sur");
    const a = await s.crearValor("sedes", "Norte");
    if (!a.ok || !b.ok) throw new Error("no se creó");
    expect(s.activos("sedes").map((v) => v.nombre)).toEqual(["Sur", "Norte"]);
    await s.moverValor("sedes", a.id, 0);
    await s.moverValor("sedes", b.id, 0);
    expect(s.activos("sedes").map((v) => v.nombre)).toEqual(["Norte", "Sur"]);
  });
});

describe("organización, etiquetas y conexiones", () => {
  it("guarda el nombre y el logo de la organización", async () => {
    const s = nuevo();
    expect((await s.guardarOrg("Acme", "data:image/png;base64,AAAA")).ok).toBe(true);
    expect(s.org).toEqual({ nombre: "Acme", logo: "data:image/png;base64,AAAA" });
    await s.guardarOrg("Acme", null);
    expect(s.org.logo).toBeNull();
  });

  it("etiqueta y quita etiquetas, crea y elimina conexiones", async () => {
    const s = nuevo();
    const a = await unidad(s, "A");
    const b = await unidad(s, "B");
    const e = await s.crearEtiqueta("Crítica", "#c2410c");
    if (!e.ok || !e.id) throw new Error("no se creó");
    await s.etiquetar(a, e.id);
    expect(s.unidadEtiquetas).toEqual([{ unidad_id: a, etiqueta_id: e.id }]);
    await s.quitarEtiqueta(a, e.id);
    expect(s.unidadEtiquetas).toHaveLength(0);
    const c = await s.crearConexion(a, b, "Apoyo");
    if (!c.ok || !c.id) throw new Error("no se creó");
    expect(s.conexiones).toHaveLength(1);
    await s.eliminarConexion(c.id);
    expect(s.conexiones).toHaveLength(0);
  });
});

describe("etiqueta nueva para una unidad", () => {
  it("la crea y se la asigna en un solo lote", async () => {
    const s = nuevo();
    const a = await unidad(s, "A");
    const antes = revision();
    const r = await s.crearEtiqueta("Crítica", "#C2410C", a);
    expect(r.ok).toBe(true);
    expect(revision()).toBe(antes + 1);
    expect(s.etiquetas.map((e) => [e.nombre, e.color])).toEqual([["Crítica", "#c2410c"]]);
    expect(s.unidadEtiquetas).toEqual([{ unidad_id: a, etiqueta_id: (r as { id: string }).id }]);
  });

  it("si el nombre ya existe no duplica y sugiere la existente", async () => {
    const s = nuevo();
    const a = await unidad(s, "A");
    const e = await s.crearEtiqueta("Crítica", "#c2410c");
    const r = await s.crearEtiqueta("  crítica ", "#2563eb", a);
    expect(r).toMatchObject({ ok: false, existente: (e as { id: string }).id });
    expect(s.etiquetas).toHaveLength(1);
    expect(s.unidadEtiquetas).toHaveLength(0);
  });

  it("rechaza un nombre vacío o un color mal formado", async () => {
    const s = nuevo();
    expect((await s.crearEtiqueta("  ", "#c2410c")).ok).toBe(false);
    expect((await s.crearEtiqueta("X", "rojo")).ok).toBe(false);
    expect(s.etiquetas).toHaveLength(0);
  });
});

describe("concurrencia", () => {
  it("guardando sigue activo hasta que terminan todas las escrituras superpuestas", async () => {
    const s = nuevo();
    const liberar: (() => void)[] = [];
    h.antesDeLote = () => new Promise<void>((resolver) => liberar.push(resolver));
    const p1 = s.crearUnidad({ tipo_id: TIPO_AREA, nombre: "A", parent_id: null });
    const p2 = s.crearUnidad({ tipo_id: TIPO_AREA, nombre: "B", parent_id: null });
    expect(s.guardando).toBe(true);
    liberar[0]();
    await p1;
    expect(s.guardando).toBe(true);
    liberar[1]();
    await p2;
    expect(s.guardando).toBe(false);
  });

  it("una recarga lenta no pisa el resultado de una más reciente", async () => {
    const s = nuevo();
    let liberar!: () => void;
    h.antesDeMeta = () => {
      h.antesDeMeta = null;
      return new Promise<void>((resolver) => (liberar = resolver));
    };
    const vieja = s.cargar(); // foto sin unidades, queda pausada
    h.bd!.aplicar(U.crearUnidad({ tipo_id: TIPO_AREA, nombre: "Nueva", parent_id: null }).sentencias);
    await s.cargar(); // foto con la unidad
    expect(s.unidades).toHaveLength(1);
    liberar();
    await vieja;
    expect(s.unidades).toHaveLength(1);
  });
});

describe("errores", () => {
  it("el siguiente éxito limpia el error de un rechazo previo", async () => {
    const s = nuevo();
    const padre = await unidad(s, "Padre");
    const hija = await unidad(s, "Hija", padre);
    await s.moverUnidad(padre, hija);
    expect(s.error).not.toBeNull();
    expect((await s.crearUnidad({ tipo_id: TIPO_AREA, nombre: "Otra", parent_id: null })).ok).toBe(true);
    expect(s.error).toBeNull();
  });

  it("el siguiente éxito limpia el error de una escritura fallida", async () => {
    const s = nuevo();
    await persona(s, "Ana", "ana@x.cl");
    await s.crearTrabajador({ nombre: "Otra", correo: "ana@x.cl" });
    expect(s.error).not.toBeNull();
    expect((await s.cargar()).ok).toBe(true);
    expect(s.error).toBeNull();
  });
});

describe("nombre vacío en mantenedores", () => {
  it("crearValor y renombrarValor piden un nombre sin escribir", async () => {
    const s = nuevo();
    const a = await s.crearValor("cargos", "Analista");
    if (!a.ok) throw new Error("no se creó");
    const antes = revision();
    const esperado = { ok: false, mensaje: "Escribe un nombre." };
    expect(await s.crearValor("cargos", "")).toEqual(esperado);
    expect(await s.crearValor("cargos", "   ")).toEqual(esperado);
    expect(await s.renombrarValor("cargos", a.id, " ")).toEqual(esperado);
    expect(revision()).toBe(antes);
    expect(s.catalogos.cargos[0].nombre).toBe("Analista");
    expect(s.error).toBe("Escribe un nombre.");
  });
});

describe("árboles y subárboles guardados", () => {
  it("crearArbol crea una raíz", async () => {
    const s = nuevo();
    const r = await s.crearArbol("Nuevo", TIPO_GERENCIA);
    expect(r.ok).toBe(true);
    expect(s.raices.map((u) => u.nombre)).toEqual(["Nuevo"]);
  });

  it("guarda, renombra, mueve y quita un subárbol", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    const hija = await unidad(s, "Hija", raiz);
    const r = await s.guardarSubarbol(hija);
    expect(r.ok).toBe(true);
    expect(s.subarboles).toEqual([{ id: expect.any(String), unidad_id: hija, nombre: null, orden: 1 }]);
    const id = s.subarboles[0].id;
    await s.renombrarSubarbol(id, "Mi rama");
    await s.moverSubarbol(id, 3);
    expect(s.subarboles[0]).toMatchObject({ nombre: "Mi rama", orden: 3 });
    await s.quitarSubarbol(id);
    expect(s.subarboles).toEqual([]);
  });

  it("guardar dos veces la misma rama devuelve ok: false con el mensaje", async () => {
    const s = nuevo();
    const hija = await unidad(s, "Hija", await unidad(s, "Raíz"));
    await s.guardarSubarbol(hija);
    const r = await s.guardarSubarbol(hija);
    expect(r).toEqual({ ok: false, mensaje: "Esa rama ya está guardada en Árboles." });
    expect(s.subarboles).toHaveLength(1);
  });

  it("el subárbol de una unidad eliminada no aparece y vuelve al deshacer", async () => {
    const s = nuevo();
    const hija = await unidad(s, "Hija", await unidad(s, "Raíz"));
    await s.guardarSubarbol(hija);
    await s.eliminarUnidad(hija);
    expect(s.subarboles).toEqual([]);
    await s.deshacer();
    expect(s.subarboles).toHaveLength(1);
  });
});

describe("vistas guardadas", () => {
  it("guarda, renombra y elimina una vista; deshacer la devuelve", async () => {
    const s = nuevo();
    const r = await s.guardarVista(null, " Compacta ", { densidad: "compacta" });
    expect(r.ok).toBe(true);
    expect(s.vistas).toEqual([
      { id: r.ok ? r.id : "", arbol_id: null, nombre: "Compacta", config: '{"densidad":"compacta"}' },
    ]);
    const id = s.vistas[0].id;
    expect((await s.renombrarVista(id, "Densa")).ok).toBe(true);
    expect(s.vistas[0].nombre).toBe("Densa");
    expect((await s.eliminarVista(id)).ok).toBe(true);
    expect(s.vistas).toEqual([]);
    expect((await s.deshacer()).ok).toBe(true);
    expect(s.vistas.map((v) => v.nombre)).toEqual(["Densa"]);
  });

  it("un nombre vacío o repetido en el mismo árbol devuelve el mensaje y no escribe", async () => {
    const s = nuevo();
    await s.guardarVista(null, "Una", {});
    const antes = revision();
    expect(await s.guardarVista(null, "   ", {})).toEqual({ ok: false, mensaje: "Escribe un nombre." });
    expect(revision()).toBe(antes);
    expect(await s.guardarVista(null, " UNA ", {})).toEqual({
      ok: false,
      mensaje: "Ya hay una vista con ese nombre en este árbol.",
    });
    const otra = await s.guardarVista(null, "Otra", {});
    expect(await s.renombrarVista(otra.ok ? otra.id! : "", "una")).toMatchObject({ ok: false });
    expect(s.vistas.map((v) => v.nombre)).toEqual(["Otra", "Una"]);
  });

  it("el mismo nombre vale en otro árbol; quitar el subárbol oculta sus vistas", async () => {
    const s = nuevo();
    const hija = await unidad(s, "Hija", await unidad(s, "Raíz"));
    await s.guardarSubarbol(hija);
    const arbol = s.subarboles[0].id;
    await s.guardarVista(null, "Compacta", {});
    expect((await s.guardarVista(arbol, "Compacta", {})).ok).toBe(true);
    expect(s.vistas).toHaveLength(2);
    await s.quitarSubarbol(arbol);
    expect(s.vistas.map((v) => v.arbol_id)).toEqual([null]);
  });
});

describe("organigrama a una fecha", () => {
  /** Enero: se crean raíz, rama, puesto y persona; marzo: la rama y la persona se eliminan y llega otro titular. */
  async function historia() {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 0, 10, 12));
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    const rama = await unidad(s, "Rama", raiz);
    const p = await puesto(s, rama);
    const ana = await persona(s, "Ana");
    const beto = await persona(s, "Beto");
    await s.asignarTitular(p, ana, "2026-01-10");
    vi.setSystemTime(new Date(2026, 2, 10, 12));
    await s.asignarTitular(p, beto, "2026-03-10");
    await s.eliminarUnidad(rama);
    await s.eliminarTrabajador(ana);
    return { s, raiz, rama, p, ana, beto };
  }

  it("sin fecha, enFecha es lo vivo de hoy y fechaVista es null", async () => {
    const { s, raiz, p, beto } = await historia();
    expect(s.fechaVista).toBeNull();
    expect(s.enFecha.unidades.map((u) => u.id)).toEqual([raiz]);
    expect(s.enFecha.vigentes.get(p)?.titular?.trabajador_id).toBe(beto);
  });

  it("verAFecha carga lo eliminado solo mientras se ve y no toca los arreglos vivos", async () => {
    const { s, raiz, rama, p, ana } = await historia();
    expect((await s.verAFecha("2026-02-01")).ok).toBe(true);
    expect(s.fechaVista).toBe("2026-02-01");
    expect(s.enFecha.unidades.map((u) => u.id).sort()).toEqual([raiz, rama].sort());
    expect(s.enFecha.vigentes.get(p)?.titular?.trabajador_id).toBe(ana);
    expect(s.enFecha.trabajadores.map((w) => w.nombre).sort()).toEqual(["Ana", "Beto"]);
    expect(s.unidades.map((u) => u.id)).toEqual([raiz]); // lo vivo no se mezcla
    expect(s.trabajadores.map((w) => w.nombre)).toEqual(["Beto"]);

    await s.verAFecha(null);
    expect(s.fechaVista).toBeNull();
    expect(s.enFecha.unidades.map((u) => u.id)).toEqual([raiz]);
  });

  it("cambiar de fecha cambia el titular y una fecha anterior a la creación oculta todo", async () => {
    const { s, p, beto } = await historia();
    await s.verAFecha("2026-02-01");
    await s.verAFecha("2026-03-10");
    expect(s.enFecha.vigentes.get(p)?.titular?.trabajador_id).toBe(beto);
    await s.verAFecha("2025-12-31");
    expect(s.enFecha.unidades).toEqual([]);
    expect(s.enFecha.puestos).toEqual([]);
  });

  it("al escribir mientras se ve una fecha, lo histórico también se recarga", async () => {
    const { s, beto } = await historia();
    await s.verAFecha("2026-03-10");
    await s.editarTrabajador(beto, { nombre: "Beto R." });
    expect(s.enFecha.trabajadores.some((w) => w.nombre === "Beto R.")).toBe(true);
  });
});

describe("mantenedores: usos por tabla, orden y último tipo", () => {
  it("cada tabla cuenta lo suyo: cargos y leyendas, puestos; contrato, sede y jornada, personas; tipos, unidades", async () => {
    const s = nuevo();
    const u = await unidad(s, "Raíz");
    const leyenda = await s.crearLeyenda({ nombre: "Crítico", color: "#be123c" });
    const contrato = await s.crearValor("tipos_contrato", "Indefinido");
    const jornada = await s.crearValor("jornadas", "Completa");
    if (!leyenda.ok || !contrato.ok || !jornada.ok) throw new Error("no se creó");
    const p1 = await puesto(s, u);
    await puesto(s, u);
    await s.asignarLeyenda(p1, leyenda.id);
    await s.crearTrabajador({ nombre: "Ana", tipo_contrato_id: contrato.id, jornada_id: jornada.id });
    await s.crearTrabajador({ nombre: "Beto", tipo_contrato_id: contrato.id });
    expect(s.usos("leyendas", leyenda.id)).toBe(1);
    expect(s.usos("tipos_contrato", contrato.id)).toBe(2);
    expect(s.usos("jornadas", jornada.id)).toBe(1);
  });

  it("los usos no cuentan lo eliminado", async () => {
    const s = nuevo();
    const u = await unidad(s, "Raíz");
    const leyenda = await s.crearLeyenda({ nombre: "Crítico", color: "#be123c" });
    if (!leyenda.ok) throw new Error("no se creó");
    const p = await puesto(s, u);
    await s.asignarLeyenda(p, leyenda.id);
    await s.eliminarPuesto(p);
    expect(s.usos("leyendas", leyenda.id)).toBe(0);
  });

  it("no desactiva el último tipo de unidad activo", async () => {
    const s = nuevo();
    await s.cargar();
    for (const t of [TIPO_GERENCIA, TIPO_AREA, TIPO_SUBAREA])
      expect((await s.desactivarValor("tipos_unidad", t)).ok).toBe(true);
    const antes = revision();
    const r = await s.desactivarValor("tipos_unidad", TIPO_OTRA);
    expect(r).toEqual({ ok: false, mensaje: "Debe quedar al menos un tipo de unidad activo." });
    expect(revision()).toBe(antes);
    expect(s.activos("tipos_unidad").map((v) => v.id)).toEqual([TIPO_OTRA]);
    expect((await s.reactivarValor("tipos_unidad", TIPO_AREA)).ok).toBe(true);
    expect((await s.desactivarValor("tipos_unidad", TIPO_OTRA)).ok).toBe(true); // ya hay otro activo
  });

  it("ordenar reescribe el orden de catálogos y leyendas en un solo lote", async () => {
    const s = nuevo();
    const a = await s.crearValor("sedes", "Norte");
    const b = await s.crearValor("sedes", "Sur");
    const c = await s.crearValor("sedes", "Este");
    if (!a.ok || !b.ok || !c.ok) throw new Error("no se creó");
    const antes = revision();
    expect((await s.ordenar("sedes", [c.id, a.id, b.id])).ok).toBe(true);
    expect(revision()).toBe(antes + 1);
    expect(s.activos("sedes").map((v) => v.nombre)).toEqual(["Este", "Norte", "Sur"]);
    const l1 = await s.crearLeyenda({ nombre: "A", color: "#be123c" });
    const l2 = await s.crearLeyenda({ nombre: "B", color: "#be123c" });
    if (!l1.ok || !l2.ok) throw new Error("no se creó");
    await s.ordenar("leyendas", [l2.id, l1.id]);
    expect(s.leyendasActivas.map((l) => l.nombre)).toEqual(["B", "A"]);
  });

  it("ordenar sin cambios no escribe", async () => {
    const s = nuevo();
    const a = await s.crearValor("sedes", "Norte");
    if (!a.ok) throw new Error("no se creó");
    await s.ordenar("sedes", [a.id]);
    const antes = revision();
    expect((await s.ordenar("sedes", [a.id])).ok).toBe(true);
    expect(revision()).toBe(antes);
  });
});

describe("crearOrganizacion", () => {
  afterEach(() => cambiarIdioma("es"));

  it("guarda el nombre y crea la raíz con el primer tipo activo, en un solo lote", async () => {
    const s = nuevo();
    await s.cargar();
    const antes = revision();
    const r = await s.crearOrganizacion("  Acme ", " Gerencia General ");
    expect(r.ok).toBe(true);
    expect(revision()).toBe(antes + 1);
    expect(s.org.nombre).toBe("Acme");
    expect(s.unidades).toHaveLength(1);
    expect(s.unidades[0]).toMatchObject({
      nombre: "Gerencia General",
      tipo_id: TIPO_GERENCIA,
      parent_id: null,
    });
    expect(s.activos("tipos_unidad")[0].nombre).toBe("Gerencia");
  });

  it("el tipo de la raíz es el primero del orden, no el sembrado", async () => {
    const s = nuevo();
    const t = await s.crearValor("tipos_unidad", "Holding");
    if (!t.ok) throw new Error("no se creó");
    await s.ordenar("tipos_unidad", [t.id, TIPO_GERENCIA, TIPO_AREA, TIPO_SUBAREA, TIPO_OTRA]);
    await s.crearOrganizacion("Acme", "Matriz");
    expect(s.unidades[0].tipo_id).toBe(t.id);
  });

  it("rechaza nombres vacíos sin escribir", async () => {
    const s = nuevo();
    await s.cargar();
    const antes = revision();
    expect((await s.crearOrganizacion(" ", "Raíz")).ok).toBe(false);
    expect((await s.crearOrganizacion("Acme", " ")).ok).toBe(false);
    expect(revision()).toBe(antes);
  });

  it("con la interfaz en inglés renombra los tipos sembrados sin uso", async () => {
    cambiarIdioma("en");
    const s = nuevo();
    await s.cargar();
    await s.crearOrganizacion("Acme", "Head office");
    expect(s.activos("tipos_unidad").map((v) => v.nombre)).toEqual([
      "Management",
      "Area",
      "Sub-area",
      "Other",
    ]);
  });
});

describe("cargarEjemplo en inglés", () => {
  afterEach(() => cambiarIdioma("es"));

  it("escribe los textos de la demostración en inglés, con los tipos sembrados renombrados", async () => {
    cambiarIdioma("en");
    const s = nuevo();
    await s.cargar(); // la app carga la base al abrir; de ahí salen los tipos sembrados
    expect((await s.cargarEjemplo()).ok).toBe(true);
    expect(s.org.nombre).toBe("Demo Company");
    expect(s.unidades.map((u) => u.nombre)).toContain("General Management");
    expect(s.unidades.some((u) => u.nombre === "Gerencia General")).toBe(false);
    expect(s.activos("tipos_unidad").map((v) => v.nombre)).toEqual([
      "Management",
      "Superintendency",
      "Area",
      "Sub-area",
      "Other",
    ]);
    expect(s.activos("cargos").map((v) => v.nombre)).toContain("Analyst");
    expect(s.leyendasActivas.map((l) => l.nombre)).toContain("Critical");
    expect(s.etiquetas.map((e) => e.nombre)).toContain("Strategic");
    expect(s.conexiones[0].etiqueta).toBe("Spare parts supply");
    expect(s.usos("tipos_unidad", TIPO_GERENCIA)).toBeGreaterThan(0);
  });
});

describe("selección múltiple", () => {
  /** Raíz › {A › {A1, A2}, B, C}; los ids por clave. */
  async function arbol() {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    const A = await unidad(s, "A", raiz);
    const A1 = await unidad(s, "A1", A);
    const A2 = await unidad(s, "A2", A);
    const B = await unidad(s, "B", raiz);
    const C = await unidad(s, "C", raiz);
    return { s, raiz, A, A1, A2, B, C };
  }
  const padre = (s: ReturnType<typeof nuevo>, id: string) => s.porId.get(id)?.parent_id;

  describe("moverUnidades", () => {
    it("mueve solo las cimas, en un solo lote: las descendientes viajan con su rama", async () => {
      const { s, A, A1, B, C } = await arbol();
      const antes = revision();
      const r = await s.moverUnidades([A, A1, B], C);
      expect(r.ok).toBe(true);
      expect(revision()).toBe(antes + 1);
      expect(padre(s, A)).toBe(C);
      expect(padre(s, B)).toBe(C);
      expect(padre(s, A1)).toBe(A); // no se tocó
    });

    it("a la raíz (sin superior) también", async () => {
      const { s, A } = await arbol();
      expect((await s.moverUnidades([A], null)).ok).toBe(true);
      expect(padre(s, A)).toBeNull();
    });

    it("rechaza un destino que cuelga de una seleccionada, sin escribir nada", async () => {
      const { s, A, A1, B } = await arbol();
      const antes = revision();
      const r = await s.moverUnidades([B, A], A1);
      expect(r).toEqual({ ok: false, mensaje: "No se puede mover una unidad dentro de su propia rama." });
      expect(revision()).toBe(antes);
      expect(padre(s, B)).not.toBe(A1);
    });

    it("rechaza mover una unidad bajo sí misma", async () => {
      const { s, B, C } = await arbol();
      expect((await s.moverUnidades([B, C], C)).ok).toBe(false);
    });

    it("las que ya están bajo el destino no se escriben; si no queda ninguna, no hay lote", async () => {
      const { s, raiz, A, B } = await arbol();
      const antes = revision();
      expect((await s.moverUnidades([A, B], raiz)).ok).toBe(true);
      expect(revision()).toBe(antes);
    });

    it("en la vista a una fecha no escribe", async () => {
      const { s, A, B } = await arbol();
      await s.verAFecha("2026-01-01");
      const antes = revision();
      const r = await s.moverUnidades([A], B);
      expect(r.ok).toBe(false);
      expect(revision()).toBe(antes);
    });
  });

  describe("eliminarUnidades", () => {
    it("elimina varias en un lote: su contenido pasa al superior y un solo Deshacer lo devuelve todo", async () => {
      const { s, raiz, A, A1, B } = await arbol();
      const p = await puesto(s, B);
      const antes = revision();
      const r = await s.eliminarUnidades([A, B]);
      expect(r).toEqual({ ok: true, eliminadas: 2, omitidas: 0 });
      expect(revision()).toBe(antes + 1);
      expect(s.porId.has(A) || s.porId.has(B)).toBe(false);
      expect(padre(s, A1)).toBe(raiz);
      expect(s.puestos.find((x) => x.id === p)?.unidad_id).toBe(raiz);
      expect(s.ultimoBorrado).toMatchObject({ tipo: "unidades" });

      const d = revision();
      expect((await s.deshacer()).ok).toBe(true);
      expect(revision()).toBe(d + 1); // un solo Deshacer, un solo lote
      expect(s.porId.has(A) && s.porId.has(B)).toBe(true);
      expect(padre(s, A1)).toBe(A);
      expect(s.puestos.find((x) => x.id === p)?.unidad_id).toBe(B);
      expect(s.ultimoBorrado).toBeNull();
    });

    it("una y su subunidad a la vez: el contenido sube al primer superior que queda y Deshacer lo reconstruye", async () => {
      const { s, raiz, A, A1, A2 } = await arbol();
      const hijaDeA1 = await unidad(s, "A11", A1);
      const p = await puesto(s, A1);
      expect((await s.eliminarUnidades([A, A1])).ok).toBe(true);
      expect(padre(s, hijaDeA1)).toBe(raiz);
      expect(padre(s, A2)).toBe(raiz);
      expect(s.puestos.find((x) => x.id === p)?.unidad_id).toBe(raiz);

      expect((await s.deshacer()).ok).toBe(true);
      expect(padre(s, hijaDeA1)).toBe(A1);
      expect(padre(s, A1)).toBe(A);
      expect(padre(s, A2)).toBe(A);
      expect(s.puestos.find((x) => x.id === p)?.unidad_id).toBe(A1);
    });

    it("una raíz con contenido se omite y se informa; las demás se eliminan", async () => {
      const { s, raiz, B } = await arbol();
      const r = await s.eliminarUnidades([raiz, B]);
      expect(r).toEqual({ ok: true, eliminadas: 1, omitidas: 1 });
      expect(s.porId.has(raiz)).toBe(true);
      expect(s.porId.has(B)).toBe(false);
    });

    it("si ninguna se puede eliminar, falla con el mensaje y no escribe", async () => {
      const { s, raiz } = await arbol();
      const antes = revision();
      const r = await s.eliminarUnidades([raiz]);
      expect(r).toEqual({
        ok: false,
        mensaje: "No se puede eliminar la unidad raíz mientras tenga contenido.",
      });
      expect(revision()).toBe(antes);
      expect(s.ultimoBorrado).toBeNull();
    });

    it("deshacer vencido no hace nada", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { s, A, B } = await arbol();
      await s.eliminarUnidades([A, B]);
      vi.setSystemTime(Date.now() + 9000);
      expect((await s.deshacer()).ok).toBe(false);
      expect(s.porId.has(A)).toBe(false);
    });

    it("en la vista a una fecha no escribe", async () => {
      const { s, B } = await arbol();
      await s.verAFecha("2026-01-01");
      const antes = revision();
      expect((await s.eliminarUnidades([B])).ok).toBe(false);
      expect(revision()).toBe(antes);
    });
  });

  describe("etiquetar varias", () => {
    it("agrega una etiqueta existente a todas en un lote, saltando las que ya la tienen", async () => {
      const { s, A, B, C } = await arbol();
      const e = await s.crearEtiqueta("Crítica", "#c2410c", A);
      if (!e.ok) throw new Error("no se creó");
      const antes = revision();
      expect((await s.etiquetarUnidades([A, B, C], e.id)).ok).toBe(true);
      expect(revision()).toBe(antes + 1);
      expect(
        s.unidadEtiquetas
          .filter((x) => x.etiqueta_id === e.id)
          .map((x) => x.unidad_id)
          .sort(),
      ).toEqual([A, B, C].sort());
    });

    it("si todas ya la tienen no escribe", async () => {
      const { s, A } = await arbol();
      const e = await s.crearEtiqueta("Crítica", "#c2410c", A);
      if (!e.ok) throw new Error("no se creó");
      const antes = revision();
      expect((await s.etiquetarUnidades([A], e.id)).ok).toBe(true);
      expect(revision()).toBe(antes);
    });

    it("una etiqueta nueva se crea y se asigna a todas en un solo lote", async () => {
      const { s, A, B, C } = await arbol();
      const antes = revision();
      const r = await s.crearEtiqueta("Turnos", "#2563eb", [A, B, C]);
      expect(r.ok).toBe(true);
      expect(revision()).toBe(antes + 1);
      expect(s.unidadEtiquetas).toHaveLength(3);
    });

    it("en la vista a una fecha no escribe", async () => {
      const { s, A } = await arbol();
      const e = await s.crearEtiqueta("Crítica", "#c2410c");
      if (!e.ok) throw new Error("no se creó");
      await s.verAFecha("2026-01-01");
      const antes = revision();
      expect((await s.etiquetarUnidades([A], e.id)).ok).toBe(false);
      expect((await s.crearEtiqueta("Otra", "#2563eb", [A])).ok).toBe(false);
      expect(revision()).toBe(antes);
    });
  });
});

describe("duplicar rama", () => {
  afterEach(() => cambiarIdioma("es"));

  it("copia la rama en un solo lote, con «(copia)» solo en la raíz, y devuelve el id de la copia", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    const A = await unidad(s, "A", raiz);
    await unidad(s, "A1", A);
    const p = await puesto(s, A);
    await s.asignarJefe(A, p);
    await s.asignarTitular(p, await persona(s, "Ana"), "2026-01-01");
    const antes = revision();
    const r = await s.duplicarRama(A);
    expect(r.ok).toBe(true);
    expect(revision()).toBe(antes + 1);
    expect(s.unidades.map((u) => u.nombre).sort()).toEqual(["A", "A (copia)", "A1", "A1", "Raíz"]);
    const copia = s.porId.get((r as { id: string }).id)!;
    expect(copia.parent_id).toBe(raiz);
    expect(s.puestos).toHaveLength(2);
    expect(copia.jefe_puesto_id).not.toBe(p);
    expect(s.asignaciones).toHaveLength(1); // la copia nace vacante
  });

  it("el nombre de la copia sigue el idioma de la interfaz", async () => {
    cambiarIdioma("en");
    const s = nuevo();
    const A = await unidad(s, "A");
    await s.duplicarRama(A);
    expect(s.unidades.map((u) => u.nombre).sort()).toEqual(["A", "A (copy)"]);
  });

  it("una unidad que ya no existe falla sin escribir", async () => {
    const s = nuevo();
    await s.cargar();
    const antes = revision();
    expect((await s.duplicarRama("fantasma")).ok).toBe(false);
    expect(revision()).toBe(antes);
  });

  it("en la vista a una fecha no escribe", async () => {
    const s = nuevo();
    const A = await unidad(s, "A");
    await s.verAFecha("2026-01-01");
    const antes = revision();
    expect((await s.duplicarRama(A)).ok).toBe(false);
    expect(revision()).toBe(antes);
    expect(s.unidades).toHaveLength(1);
  });
});
