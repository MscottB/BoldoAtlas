import { describe, expect, it } from "vitest";
import type { Trabajador, Unidad } from "../../db/tipos";
import { creaCiclo, descendientes, dotacion, gerenciaYArea, hijos, indexar, ruta, rutaTexto } from "./jerarquia";

type ConBorrado<T> = T & { deleted_at?: string | null };

function u(id: string, tipo: Unidad["tipo"], nombre: string, parent_id: string | null, orden = 0): ConBorrado<Unidad> {
  return { id, tipo, nombre, descripcion: null, parent_id, jefe_id: null, orden };
}

function t(id: string, unidad_id: string, estado: Trabajador["estado"] = "activo"): ConBorrado<Trabajador> {
  return {
    id, estado, nombre: estado === "activo" ? id : null, correo: null, telefono: null, cargo_id: null,
    tipo_contrato_id: null, sede_id: null, jornada_id: null, unidad_id, foto_png: null, notas: null,
  };
}

// GG › Operaciones › Mantención › {Mecánica, Eléctrica}; GG › Finanzas (+ una unidad borrada).
const unidades: ConBorrado<Unidad>[] = [
  u("gg", "otra", "Gerencia General", null),
  u("finanzas", "gerencia", "Finanzas", "gg", 1),
  u("operaciones", "gerencia", "Operaciones", "gg", 0),
  u("mantencion", "area", "Mantención", "operaciones"),
  u("mecanica", "subarea", "Mecánica", "mantencion"),
  u("electrica", "subarea", "Eléctrica", "mantencion"),
  { ...u("borrada", "subarea", "Borrada", "mantencion"), deleted_at: "2026-01-01T00:00:00.000Z" },
];

// 8 trabajadores, 2 vacantes. Rama de Mantención: 5 activos + 1 vacante.
const trabajadores: ConBorrado<Trabajador>[] = [
  t("t1", "gg"),
  t("t2", "finanzas", "vacante"),
  t("t3", "mantencion"),
  t("t4", "mecanica"),
  t("t5", "mecanica"),
  t("t6", "mecanica", "vacante"),
  t("t7", "electrica"),
  t("t8", "electrica"),
];

describe("jerarquía", () => {
  it("indexar indexa por id", () => {
    expect(indexar(unidades).get("mecanica")?.nombre).toBe("Mecánica");
  });

  it("hijos ordena por orden y luego nombre, e ignora borradas", () => {
    expect(hijos(unidades, "gg").map((x) => x.id)).toEqual(["operaciones", "finanzas"]);
    expect(hijos(unidades, "mantencion").map((x) => x.id)).toEqual(["electrica", "mecanica"]);
  });

  it("ruta y rutaTexto van de la raíz a la unidad", () => {
    expect(ruta(unidades, "mecanica").map((x) => x.id)).toEqual(["gg", "operaciones", "mantencion", "mecanica"]);
    expect(rutaTexto(unidades, "mecanica")).toBe("Gerencia General › Operaciones › Mantención › Mecánica");
  });

  it("descendientes no incluye la propia unidad ni las borradas", () => {
    expect(descendientes(unidades, "operaciones")).toEqual(new Set(["mantencion", "mecanica", "electrica"]));
  });

  it("creaCiclo detecta mover bajo sí misma o bajo un descendiente", () => {
    expect(creaCiclo(unidades, "operaciones", "mecanica")).toBe(true);
    expect(creaCiclo(unidades, "mecanica", "finanzas")).toBe(false);
    expect(creaCiclo(unidades, "x", "x")).toBe(true);
    expect(creaCiclo(unidades, "gg", null)).toBe(false);
  });

  it("dotacion cuenta activos directos, activos de la rama y vacantes de la rama", () => {
    expect(dotacion(unidades, trabajadores, "mantencion")).toEqual({ directa: 1, total: 5, vacantes: 1 });
    expect(dotacion(unidades, trabajadores, "gg")).toEqual({ directa: 1, total: 6, vacantes: 2 });
  });

  it("dotacion ignora trabajadores borrados", () => {
    const conBorrado = [...trabajadores, { ...t("t9", "mantencion"), deleted_at: "2026-01-01T00:00:00.000Z" }];
    expect(dotacion(unidades, conBorrado, "mantencion")).toEqual({ directa: 1, total: 5, vacantes: 1 });
  });

  it("gerenciaYArea deriva gerencia, área y subárea de los ancestros", () => {
    expect(gerenciaYArea(unidades, "mecanica")).toEqual({ gerencia: "Operaciones", area: "Mantención", subarea: "Mecánica" });
    expect(gerenciaYArea(unidades, "finanzas")).toEqual({ gerencia: "Finanzas", area: null, subarea: null });
  });
});
