import { describe, expect, it } from "vitest";
import type { Trabajador } from "@/db/tipos";
import { a, p, u } from "./fixture";
import { TIPO_AREA } from "@/db/tipos";
import { cambiosPorDia, diaConCambios, type Cambio } from "./cambios";
import type { Historico } from "./jerarquia";

// Instante ISO (UTC) de una hora local: a las 23:30 el UTC ya es otro día en Chile; el día debe ser el local.
const local = (anio: number, mes: number, dia: number, hora = 9) =>
  new Date(anio, mes - 1, dia, hora, 30).toISOString();
const t = (id: string, nombre: string): Trabajador => ({
  id,
  nombre,
  correo: null,
  telefono: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  foto_png: null,
  notas: null,
});
const cargos = [{ id: "cargo", nombre: "Gerente" }];
const tipos = (cs: Cambio[] | undefined) => (cs ?? []).map((c) => c.tipo);

describe("cambios por día", () => {
  const fin = { ...u("fin", TIPO_AREA, "Finanzas", null), created_at: local(2026, 3, 2, 23) };
  const log = {
    ...u("log", TIPO_AREA, "Logística", null),
    created_at: local(2026, 3, 2),
    deleted_at: local(2026, 5, 1),
  };
  const pf = { ...p("pf", "fin"), created_at: local(2026, 3, 2) };
  const pl = { ...p("pl", "log"), created_at: local(2026, 3, 2), deleted_at: local(2026, 4, 10) };
  const h: Historico = {
    unidades: [fin, log],
    puestos: [pf, pl],
    asignaciones: [
      { ...a("a1", "pf", "ana", "titular", "2026-04-01"), desde: "2026-03-03" },
      { ...a("a2", "pf", "beto"), desde: "2026-04-01" }, // relevo de Ana
      { ...a("a3", "pf", "caro", "reemplazo", "2026-04-20"), desde: "2026-04-15" },
      { ...a("a4", "pf", "dani"), desde: "2026-04-15", deleted_at: local(2026, 4, 15) }, // borrada ese día: no cuenta
    ],
    trabajadores: [t("ana", "Ana Rojas"), t("beto", "Beto"), t("caro", "Caro"), t("dani", "Dani")],
  };
  const m = cambiosPorDia(h, cargos);

  it("unidades y puestos creados o eliminados, en el día local", () => {
    expect(tipos(m.get("2026-03-02"))).toEqual(["unidadCreada", "unidadCreada", "puestoCreado", "puestoCreado"]);
    expect(m.get("2026-03-02")![0]).toMatchObject({ unidad: "Finanzas", unidadId: "fin" }); // 23:30 local sigue siendo el 2
    expect(m.get("2026-04-10")).toEqual([
      { tipo: "puestoEliminado", unidadId: "log", unidad: "Logística", cargo: "Gerente" },
    ]);
    expect(tipos(m.get("2026-05-01"))).toEqual(["unidadEliminada"]);
  });

  it("asignaciones que empiezan y terminan, con nombre, cargo y unidad", () => {
    expect(m.get("2026-03-03")).toEqual([
      { tipo: "asumio", unidadId: "fin", unidad: "Finanzas", cargo: "Gerente", persona: "Ana Rojas" },
    ]);
    expect(tipos(m.get("2026-04-15"))).toEqual(["empezoReemplazo"]);
    expect(m.get("2026-04-20")).toEqual([
      { tipo: "terminoReemplazo", unidadId: "fin", unidad: "Finanzas", cargo: "Gerente", persona: "Caro" },
    ]);
  });

  it("un titular que sale y otro que entra el mismo día en el mismo puesto es un relevo", () => {
    expect(m.get("2026-04-01")).toEqual([
      {
        tipo: "relevo",
        unidadId: "fin",
        unidad: "Finanzas",
        cargo: "Gerente",
        persona: "Beto",
        anterior: "Ana Rojas",
      },
    ]);
  });

  it("sin pareja no hay relevo", () => {
    const solo = cambiosPorDia(
      { ...h, asignaciones: [{ ...a("x", "pf", "ana", "titular", "2026-06-01"), desde: "2026-05-01" }] },
      cargos,
    );
    expect(tipos(solo.get("2026-06-01"))).toEqual(["dejo"]);
  });

  it("una asignación abierta que se elimina (al eliminar a la persona) termina el día de la baja", () => {
    const borrada = cambiosPorDia(
      { ...h, asignaciones: [{ ...a("x", "pf", "ana"), desde: "2026-05-02", deleted_at: local(2026, 6, 3, 23) }] },
      cargos,
    );
    expect(tipos(borrada.get("2026-05-02"))).toEqual(["asumio"]);
    expect(tipos(borrada.get("2026-06-03"))).toEqual(["dejo"]);
  });

  it("aguanta 10.000 personas y 2.000 unidades en una pasada", () => {
    const us = Array.from({ length: 2000 }, (_, i) => ({
      ...u(`u${i}`, TIPO_AREA, `U${i}`, null),
      created_at: local(2020, 1, 1 + (i % 28)),
    }));
    const ps = Array.from({ length: 10000 }, (_, i) => ({ ...p(`p${i}`, `u${i % 2000}`), created_at: local(2020, 2, 1) }));
    const as = Array.from({ length: 10000 }, (_, i) => ({
      ...a(`a${i}`, `p${i}`, `t${i}`, "titular", i % 2 ? "2024-01-01" : null),
      desde: `2021-0${1 + (i % 9)}-15`,
    }));
    const ts = Array.from({ length: 10000 }, (_, i) => t(`t${i}`, `P${i}`));
    const inicio = performance.now();
    const grande = cambiosPorDia({ unidades: us, puestos: ps, asignaciones: as, trabajadores: ts }, cargos);
    expect(performance.now() - inicio).toBeLessThan(1000);
    expect(grande.get("2024-01-01")).toHaveLength(5000);
  });
});

describe("día con cambios más cercano", () => {
  const dias = ["1899-12-31", "2026-01-05", "2026-03-01", "2026-03-10", "2099-01-01"];
  it("busca hacia atrás y adelante dentro del rango", () => {
    expect(diaConCambios(dias, "2026-03-01", 1, "1900-01-01", "2026-10-31")).toBe("2026-03-10");
    expect(diaConCambios(dias, "2026-03-01", -1, "1900-01-01", "2026-10-31")).toBe("2026-01-05");
    expect(diaConCambios(dias, "2026-03-10", 1, "1900-01-01", "2026-10-31")).toBeNull(); // 2099 está fuera
    expect(diaConCambios(dias, "2026-01-05", -1, "1900-01-01", "2026-10-31")).toBeNull(); // 1899 está fuera
  });
});
