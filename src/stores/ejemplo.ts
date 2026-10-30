import type { Idioma } from "@/i18n";

// Textos de la organización de demostración, según el idioma de la interfaz. Son datos que se guardan en la base:
// por eso van aquí y no en los diccionarios de la interfaz. Los nombres de las personas y los códigos de marca no cambian.
export interface TextosEjemplo {
  organizacion: string;
  /** En el orden en que el ejemplo los referencia por posición: gerente, jefe, analista, técnico. */
  cargos: string[];
  tiposContrato: string[];
  sedes: string[];
  jornadas: string[];
  tipoUnidad: string;
  unidades: Record<
    "gg" | "op" | "ma" | "me" | "el" | "pr" | "fi" | "co" | "cm" | "pe" | "se" | "re" | "ca",
    string
  >;
  leyendas: Record<"critico" | "sucesion" | "potencial", { nombre: string; descripcion: string | null }>;
  etiquetas: Record<"critica" | "turnos" | "estrategica", string>;
  conexion: string;
}

export const EJEMPLO: Record<Idioma, TextosEjemplo> = {
  es: {
    organizacion: "Compañía Demo",
    cargos: ["Gerente", "Jefe de área", "Analista", "Técnico"],
    tiposContrato: ["Indefinido", "Plazo fijo", "Honorarios"],
    sedes: ["Casa matriz", "Planta Norte"],
    jornadas: ["Completa", "Turnos 4x3"],
    tipoUnidad: "Superintendencia",
    unidades: {
      gg: "Gerencia General",
      op: "Operaciones",
      ma: "Mantención",
      me: "Mecánica",
      el: "Eléctrica",
      pr: "Producción",
      fi: "Finanzas",
      co: "Contabilidad",
      cm: "Compras",
      pe: "Personas",
      se: "Selección",
      re: "Remuneraciones",
      ca: "Capacitación",
    },
    leyendas: {
      critico: { nombre: "Crítico", descripcion: "No puede quedar vacante ni sin reemplazo" },
      sucesion: { nombre: "En sucesión", descripcion: "Hay un plan de sucesión en marcha" },
      potencial: { nombre: "Alto potencial", descripcion: null },
    },
    etiquetas: { critica: "Crítica", turnos: "Turno 24×7", estrategica: "Estratégica" },
    conexion: "Abastecimiento de repuestos",
  },
  en: {
    organizacion: "Demo Company",
    cargos: ["Manager", "Area head", "Analyst", "Technician"],
    tiposContrato: ["Permanent", "Fixed term", "Contractor"],
    sedes: ["Head office", "North plant"],
    jornadas: ["Full time", "4x3 shifts"],
    tipoUnidad: "Superintendency",
    unidades: {
      gg: "General Management",
      op: "Operations",
      ma: "Maintenance",
      me: "Mechanical",
      el: "Electrical",
      pr: "Production",
      fi: "Finance",
      co: "Accounting",
      cm: "Purchasing",
      pe: "People",
      se: "Recruitment",
      re: "Payroll",
      ca: "Training",
    },
    leyendas: {
      critico: { nombre: "Critical", descripcion: "Cannot be left vacant or without cover" },
      sucesion: { nombre: "In succession", descripcion: "A succession plan is under way" },
      potencial: { nombre: "High potential", descripcion: null },
    },
    etiquetas: { critica: "Critical", turnos: "24×7 shifts", estrategica: "Strategic" },
    conexion: "Spare parts supply",
  },
};
