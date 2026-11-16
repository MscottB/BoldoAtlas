// «Exportar sus datos»: lo que la app guarda de una persona, en dos hojas (Datos y Puestos). Sin foto.
import type { Trabajador, TablaCatalogo, ValorCatalogo } from "@/db/tipos";
import { fechaExcel, type Hoja, type Traducir } from "./libro";

/** Una asignación suya, con los nombres ya resueltos (puede ser de un puesto o una unidad ya eliminados). */
export interface AsignacionHistorica {
  unidad: string | null;
  cargo: string | null;
  tipo: "titular" | "reemplazo";
  desde: string;
  hasta: string | null;
  motivo: string | null;
}

export type Catalogos = Record<
  Extract<TablaCatalogo, "tipos_contrato" | "sedes" | "jornadas">,
  ValorCatalogo[]
>;

export function hojasPersona(
  p: Trabajador & { notas: string | null },
  asignaciones: AsignacionHistorica[],
  nombres: Catalogos,
  t: Traducir,
): Hoja[] {
  const de = (lista: ValorCatalogo[], id: string | null) => lista.find((v) => v.id === id)?.nombre ?? null;
  const campo = (c: string, valor: string | null) => [t(`ficha.${c}`), valor];
  return [
    {
      nombre: t("excel.persona.datos"),
      columnas: [t("excel.persona.campo"), t("excel.persona.valor")],
      filas: [
        campo("nombre", p.nombre),
        campo("correo", p.correo),
        campo("telefono", p.telefono),
        campo("tipoContrato", de(nombres.tipos_contrato, p.tipo_contrato_id)),
        campo("sede", de(nombres.sedes, p.sede_id)),
        campo("jornada", de(nombres.jornadas, p.jornada_id)),
        campo("notas", p.notas),
      ],
    },
    {
      nombre: t("excel.persona.puestos"),
      columnas: ["unidad", "cargo", "tipo", "desde", "hasta", "motivo"].map((c) => t(`excel.persona.${c}`)),
      filas: asignaciones.map((a) => [
        a.unidad,
        a.cargo,
        t(`puesto.tipo.${a.tipo}`),
        fechaExcel(a.desde),
        a.hasta ? fechaExcel(a.hasta) : null,
        a.motivo,
      ]),
    },
  ];
}
