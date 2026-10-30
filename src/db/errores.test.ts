import { describe, it, expect } from "vitest";
import { traducirError } from "./errores";
import { abrirBasePrueba } from "@/db/prueba/sqlite";
import { crearUnidad } from "@/db/repos/unidades";
import { crearTrabajador } from "@/db/repos/trabajadores";
import { crearEtiqueta, etiquetarUnidad } from "@/db/repos/etiquetas";
import { guardarSubarbol } from "@/db/repos/subarboles";
import { guardarVista } from "@/db/repos/vistas";
import { crearValor } from "@/db/repos/catalogos";
import { crearPuesto } from "@/db/repos/puestos";
import { crearLeyenda } from "@/db/repos/leyendas";
import { asignarTitular, registrarReemplazo, terminarAsignacion } from "@/db/repos/asignaciones";
import { TIPO_GERENCIA } from "@/db/tipos";

describe("traducirError", () => {
  it.each([
    ["UNIQUE constraint failed: index 'ux_trabajadores_correo'", "Ya existe una persona con ese correo."],
    ["UNIQUE constraint failed: index 'ux_etiquetas_nombre'", "Ya existe una etiqueta con ese nombre."],
    [
      "UNIQUE constraint failed: unidad_etiquetas.unidad_id, unidad_etiquetas.etiqueta_id",
      "La unidad ya tiene esa etiqueta.",
    ],
    ["UNIQUE constraint failed: index 'ux_cargos_nombre'", "Ese valor ya existe en la lista."],
    ["UNIQUE constraint failed: index 'ux_tipos_contrato_nombre'", "Ese valor ya existe en la lista."],
    ["UNIQUE constraint failed: index 'ux_sedes_nombre'", "Ese valor ya existe en la lista."],
    ["UNIQUE constraint failed: index 'ux_jornadas_nombre'", "Ese valor ya existe en la lista."],
    ["UNIQUE constraint failed: index 'ux_tipos_unidad_nombre'", "Ese valor ya existe en la lista."],
    ["UNIQUE constraint failed: index 'ux_leyendas_nombre'", "Ese valor ya existe en la lista."],
    [
      "CHECK constraint failed: color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'",
      "El color debe tener el formato #rrggbb (por ejemplo, #be123c).",
    ],
    ["NOT NULL constraint failed: trabajadores.nombre", "Falta el nombre de la persona."],
    [
      "UNIQUE constraint failed: asignaciones.puesto_id",
      "Ese puesto ya tiene una asignación vigente de ese tipo.",
    ],
    [
      "CHECK constraint failed: hasta IS NULL OR hasta >= desde",
      "La fecha de término no puede ser anterior a la de inicio.",
    ],
    ["CHECK constraint failed: origen_id <> destino_id", "Una unidad no puede conectarse consigo misma."],
    ["FOREIGN KEY constraint failed", "La unidad o persona relacionada ya no existe."],
  ])("traduce %s", (texto, esperado) => {
    expect(traducirError(texto)).toBe(esperado);
  });

  it("acepta un Error con el texto de SQLite", () => {
    expect(traducirError(new Error("UNIQUE constraint failed: index 'ux_sedes_nombre'"))).toBe(
      "Ese valor ya existe en la lista.",
    );
  });

  it("traduce los errores reales que produce SQLite con el esquema", () => {
    const bd = abrirBasePrueba();
    const unidad = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "Operaciones" });
    bd.aplicar(unidad.sentencias);
    bd.aplicar(crearTrabajador({ nombre: "Ana", correo: "ana@empresa.cl" }).sentencias);
    const capturar = (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        return traducirError(e);
      }
      throw new Error("se esperaba un error de SQLite");
    };

    const correoDuplicado = capturar(() =>
      bd.aplicar(crearTrabajador({ nombre: "Ana 2", correo: " ANA@empresa.cl " }).sentencias),
    );
    expect(correoDuplicado).toBe("Ya existe una persona con ese correo.");

    const etiqueta = crearEtiqueta("Crítica", "#C8743F");
    bd.aplicar(etiqueta.sentencias);
    bd.aplicar(etiquetarUnidad(unidad.id, etiqueta.id));
    const etiquetaDuplicada = capturar(() => bd.aplicar(etiquetarUnidad(unidad.id, etiqueta.id)));
    expect(etiquetaDuplicada).toBe("La unidad ya tiene esa etiqueta.");

    bd.aplicar(guardarSubarbol(unidad.id).sentencias);
    const ramaDuplicada = capturar(() => bd.aplicar(guardarSubarbol(unidad.id).sentencias));
    expect(ramaDuplicada).toBe("Esa rama ya está guardada en Árboles.");

    bd.aplicar(guardarVista(null, "Compacta", {}).sentencias);
    const vistaDuplicada = capturar(() => bd.aplicar(guardarVista(null, " COMPACTA ", {}).sentencias));
    expect(vistaDuplicada).toBe("Ya hay una vista con ese nombre en este árbol.");

    const tipoDuplicado = capturar(() => bd.aplicar(crearValor("tipos_unidad", " gerencia ").sentencias));
    expect(tipoDuplicado).toBe("Ese valor ya existe en la lista.");

    const sinNombre = capturar(() => bd.aplicar(crearTrabajador({ nombre: null as never }).sentencias));
    expect(sinNombre).toBe("Falta el nombre de la persona.");

    const cargo = crearValor("cargos", "Analista");
    const puesto = crearPuesto({ unidad_id: unidad.id, cargo_id: cargo.id });
    const beto = crearTrabajador({ nombre: "Beto" });
    bd.aplicar([cargo, puesto, beto].flatMap((x) => x.sentencias));
    bd.aplicar(registrarReemplazo(puesto.id, beto.id, "2026-01-01").sentencias);
    const reemplazoDuplicado = capturar(() =>
      bd.aplicar(registrarReemplazo(puesto.id, beto.id, "2026-02-01").sentencias),
    );
    expect(reemplazoDuplicado).toBe("Ese puesto ya tiene una asignación vigente de ese tipo.");

    const titular = asignarTitular(puesto.id, beto.id, "2026-03-01");
    bd.aplicar(titular.sentencias);
    const fechas = capturar(() => bd.aplicar(terminarAsignacion(titular.id, "2026-02-28")));
    expect(fechas).toBe("La fecha de término no puede ser anterior a la de inicio.");
    // Un titular nuevo anterior al vigente cerraría la vigente antes de su inicio.
    const titularAnterior = capturar(() =>
      bd.aplicar(asignarTitular(puesto.id, beto.id, "2026-01-15").sentencias),
    );
    expect(titularAnterior).toBe("La fecha de término no puede ser anterior a la de inicio.");

    bd.aplicar(crearLeyenda({ nombre: "Critico", color: "#be123c" }).sentencias);
    const leyendaDuplicada = capturar(() =>
      bd.aplicar(crearLeyenda({ nombre: " CRITICO ", color: "#0f766e" }).sentencias),
    );
    expect(leyendaDuplicada).toBe("Ese valor ya existe en la lista.");
    const colorMalo = capturar(() => bd.aplicar(crearLeyenda({ nombre: "Otro", color: "rojo" }).sentencias));
    expect(colorMalo).toBe("El color debe tener el formato #rrggbb (por ejemplo, #be123c).");
  });

  it("no confunde el CHECK de nombre de un catálogo con el de la persona", () => {
    const texto = "CHECK constraint failed: length(trim(nombre)) > 0";
    expect(traducirError(texto)).toBe(texto);
  });

  it("devuelve tal cual un texto desconocido, sin ocultarlo", () => {
    expect(traducirError("disk I/O error")).toBe("disk I/O error");
    expect(traducirError(new Error("database is locked"))).toBe("database is locked");
  });

  it("convierte cualquier otro valor con String", () => {
    expect(traducirError(42)).toBe("42");
  });
});
