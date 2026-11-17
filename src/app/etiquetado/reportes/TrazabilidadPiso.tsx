"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

// Mapa de trazabilidad de las "Rondas de piso": el detalle, por persona y
// por orden, de en qué fase/rol estuvo cada quien según las rondas que el
// dueño fue registrando (muestreo de trabajo), con todos los filtros para
// poder revisarlo a fin de mes. Vive aparte de "Productividad" — ese
// término mide otra cosa (unidades/hora por mesa en etq_movimientos) y no
// se toca aquí.

type Fase = { id: string; nombre: string; color_slot: number };
type Rol = { id: string; fase_id: string; nombre: string };
type Persona = { id: string; nombre: string };
type OrdenRef = { id: string; numero_etq: string; cliente_nombre: string | null; fecha: string | null; concluida_en: string | null };
type Equipo = { id: string; nombre: string; persona_ids: string[] };

type FilaDetalle = {
  id: string;
  rondaId: string;
  fecha: string;
  hora: string;
  horaISO: string;
  ordenId: string;
  ordenNumero: string;
  ordenCliente: string;
  personaId: string;
  personaNombre: string;
  faseId: string | null;
  faseNombre: string;
  faseColorSlot: number;
  rolId: string | null;
  rolNombre: string;
  interrumpido: boolean;
  motivo: string | null;
  ausenteDesde: string | null;
  ausenteHasta: string | null;
  avance: number;
  unidades: number | null;
  equipoId: string | null;
  equipoNombre: string | null;
  equipoMiembros: string[];
};

type FilaAgrupada = FilaDetalle & { esEquipo: boolean; miembrosLabel: string };

// Minutos entre dos horas "HH:MM" o "HH:MM:SS" (mismo día). Negativo o
// inválido se trata como 0 — no se espera una ausencia que cruce medianoche.
function minutosEntreHoras(desde: string | null, hasta: string | null) {
  if (!desde || !hasta) return 0;
  const [h1, m1] = desde.split(":").map(Number);
  const [h2, m2] = hasta.split(":").map(Number);
  if ([h1, m1, h2, m2].some((n) => Number.isNaN(n))) return 0;
  const mins = h2 * 60 + m2 - (h1 * 60 + m1);
  return mins > 0 ? mins : 0;
}

const COLOR_SLOTS: Record<number, string> = {
  1: "#5b9bf0",
  2: "var(--amber)",
  3: "#2dd4bf",
  4: "var(--accent)",
  5: "#f472b6",
  6: "#a3e635",
};
function colorSlot(slot: number) {
  return COLOR_SLOTS[slot] ?? COLOR_SLOTS[1];
}
function primerDiaDelMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function hoyStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sumarDias(fecha: string, dias: number) {
  const d = new Date(fecha + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return dStr(d);
}
// Lista de días (YYYY-MM-DD) entre desde y hasta, ambos inclusive.
function rangoDeDias(desde: string, hasta: string) {
  const out: string[] = [];
  let d = desde;
  let guard = 0;
  while (d <= hasta && guard < 1000) {
    out.push(d);
    d = sumarDias(d, 1);
    guard++;
  }
  return out;
}

const INPUT = { background: "var(--card-2)", border: "1px solid var(--border-2)", color: "var(--text)", fontSize: 16 };
const PAGINA = 15;

// Reemplaza el <select> nativo (cuyo panel de opciones el navegador pinta
// feo y sin límite de alto) por un desplegable propio, angosto, con scroll
// interno y resaltado de la opción elegida, consistente con el resto del
// tema oscuro.
function SelectBonito({
  value,
  onChange,
  options,
  maxWidth,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  maxWidth?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function alHacerClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClick);
    return () => document.removeEventListener("mousedown", alHacerClick);
  }, []);
  const actual = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "";

  return (
    <div ref={ref} className="relative" style={{ width: maxWidth, maxWidth }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-left truncate"
        style={{ ...INPUT, fontSize: 13 }}
      >
        <span className="truncate">{actual}</span>
        <span className="text-text-faint shrink-0" style={{ fontSize: 9 }}>
          {abierto ? "▲" : "▼"}
        </span>
      </button>
      {abierto && (
        <div
          className="absolute z-30 mt-1 rounded-lg overflow-hidden shadow-lg"
          style={{ background: "var(--card)", border: "1px solid var(--border-2)", minWidth: "100%", width: "max-content", maxWidth: 260 }}
        >
          <div className="max-h-56 overflow-y-auto py-1">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setAbierto(false);
                }}
                className="w-full text-left px-3 py-1.5 text-[12.5px] truncate"
                style={{
                  background: value === o.value ? "color-mix(in srgb, var(--accent-2) 16%, transparent)" : "transparent",
                  color: value === o.value ? "var(--accent-2)" : "var(--text)",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Paginador({ pagina, totalPaginas, onChange }: { pagina: number; totalPaginas: number; onChange: (p: number) => void }) {
  if (totalPaginas <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border">
      <button
        disabled={pagina <= 1}
        onClick={() => onChange(pagina - 1)}
        className="btn-secondary text-[11.5px] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
      >
        ‹ Anterior
      </button>
      <span className="text-[11px] text-text-dim">
        Página {pagina} de {totalPaginas}
      </span>
      <button
        disabled={pagina >= totalPaginas}
        onClick={() => onChange(pagina + 1)}
        className="btn-secondary text-[11.5px] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
      >
        Siguiente ›
      </button>
    </div>
  );
}

export default function TrazabilidadPiso() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [fases, setFases] = useState<Fase[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [ordenesRef, setOrdenesRef] = useState<OrdenRef[]>([]);
  const [filas, setFilas] = useState<FilaDetalle[]>([]);

  const [vista, setVista] = useState<"detalle" | "estadisticas" | "comparativa">("detalle");
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoyStr());
  const [fPersona, setFPersona] = useState("");
  const [fEquipo, setFEquipo] = useState("");
  const [fOrden, setFOrden] = useState("");
  const [fFase, setFFase] = useState("");
  const [fRol, setFRol] = useState("");
  const [fEstado, setFEstado] = useState<"todas" | "trabajando" | "interrumpido">("todas");
  const [pagina, setPagina] = useState(1);

  function aplicarPreset(preset: "mes" | "3meses" | "anio" | "anioAnterior") {
    const hoy = new Date();
    if (preset === "mes") {
      setDesde(primerDiaDelMes());
      setHasta(hoyStr());
    } else if (preset === "3meses") {
      setDesde(sumarDias(hoyStr(), -90));
      setHasta(hoyStr());
    } else if (preset === "anio") {
      setDesde(`${hoy.getFullYear()}-01-01`);
      setHasta(hoyStr());
    } else {
      setDesde(`${hoy.getFullYear() - 1}-01-01`);
      setHasta(`${hoy.getFullYear() - 1}-12-31`);
    }
  }

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setLoading(true);
      const [fasesRes, rolesRes, equiposRes, personasRes] = await Promise.all([
        supabase.from("rondas_fases").select("id, nombre, color_slot"),
        supabase.from("rondas_roles").select("id, fase_id, nombre"),
        supabase.from("rondas_equipos").select("id, nombre, persona_ids"),
        supabase.from("rondas_personas").select("id, nombre"),
      ]);

      const { data: rondasData } = await supabase
        .from("rondas")
        .select("id, fecha, hora")
        .gte("fecha", desde)
        .lte("fecha", hasta);
      const rondaIds = (rondasData ?? []).map((r: { id: string }) => r.id);
      const rondaPorId = new Map((rondasData ?? []).map((r: { id: string; fecha: string; hora: string }) => [r.id, r]));

      let obsData: {
        id: string;
        ronda_id: string;
        persona_id: string;
        orden_id: string;
        fase_id: string | null;
        rol_id: string | null;
        equipo_id: string | null;
        interrumpido: boolean;
        motivo: string | null;
        ausente_desde: string | null;
        ausente_hasta: string | null;
        avance: number;
        unidades: number | null;
      }[] = [];
      if (rondaIds.length) {
        const { data } = await supabase
          .from("rondas_observaciones")
          .select(
            "id, ronda_id, persona_id, orden_id, fase_id, rol_id, equipo_id, interrumpido, motivo, ausente_desde, ausente_hasta, avance, unidades"
          )
          .in("ronda_id", rondaIds);
        obsData = data ?? [];
      }

      const ordenIds = Array.from(new Set(obsData.map((o) => o.orden_id)));
      const { data: ordenesData } = ordenIds.length
        ? await supabase.from("etq_ordenes").select("id, numero_etq, cliente_nombre, fecha, concluida_en").in("id", ordenIds)
        : { data: [] as OrdenRef[] };

      if (cancelado) return;

      const fasesPorId = new Map(((fasesRes.data as Fase[]) ?? []).map((f) => [f.id, f]));
      const rolesPorId = new Map(((rolesRes.data as Rol[]) ?? []).map((r) => [r.id, r]));
      const equiposPorId = new Map(((equiposRes.data as Equipo[]) ?? []).map((e) => [e.id, e]));
      const personasPorId = new Map(((personasRes.data as Persona[]) ?? []).map((p) => [p.id, p]));
      const ordenesPorId = new Map(((ordenesData as OrdenRef[]) ?? []).map((o) => [o.id, o]));

      const filasArmadas: FilaDetalle[] = obsData.map((o) => {
        const ronda = rondaPorId.get(o.ronda_id) as { fecha: string; hora: string } | undefined;
        const fase = o.fase_id ? fasesPorId.get(o.fase_id) : undefined;
        const rol = o.rol_id ? rolesPorId.get(o.rol_id) : undefined;
        const persona = personasPorId.get(o.persona_id);
        const orden = ordenesPorId.get(o.orden_id);
        const equipo = o.equipo_id ? equiposPorId.get(o.equipo_id) : undefined;
        return {
          id: o.id,
          rondaId: o.ronda_id,
          fecha: ronda?.fecha ?? "",
          hora: ronda?.hora ? new Date(ronda.hora).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" }) : "",
          horaISO: ronda?.hora ?? "",
          ordenId: o.orden_id,
          ordenNumero: orden?.numero_etq ?? "(orden eliminada)",
          ordenCliente: orden?.cliente_nombre ?? "",
          personaId: o.persona_id,
          personaNombre: persona?.nombre ?? "(persona eliminada)",
          faseId: o.fase_id,
          faseNombre: fase?.nombre ?? (o.interrumpido ? "" : "(fase eliminada)"),
          faseColorSlot: fase?.color_slot ?? 1,
          rolId: o.rol_id,
          rolNombre: rol?.nombre ?? "",
          interrumpido: o.interrumpido,
          motivo: o.motivo,
          ausenteDesde: o.ausente_desde,
          ausenteHasta: o.ausente_hasta,
          avance: o.avance,
          unidades: o.unidades,
          equipoId: o.equipo_id,
          equipoNombre: equipo?.nombre ?? null,
          equipoMiembros: equipo ? equipo.persona_ids.map((pid) => personasPorId.get(pid)?.nombre ?? "?") : [],
        };
      });
      filasArmadas.sort((a, b) => (a.horaISO < b.horaISO ? 1 : -1));

      setFases((fasesRes.data as Fase[]) ?? []);
      setRoles((rolesRes.data as Rol[]) ?? []);
      setEquipos((equiposRes.data as Equipo[]) ?? []);
      setPersonas((personasRes.data as Persona[]) ?? []);
      setOrdenesRef((ordenesData as OrdenRef[]) ?? []);
      setFilas(filasArmadas);
      setLoading(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [supabase, desde, hasta]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- vuelve a página 1 cuando cambia un filtro, no un ciclo de sincronización
    setPagina(1);
  }, [fPersona, fEquipo, fOrden, fFase, fRol, fEstado, desde, hasta]);

  const filtradas = useMemo(() => {
    return filas.filter((f) => {
      if (fPersona && f.personaId !== fPersona) return false;
      if (fEquipo && f.equipoId !== fEquipo) return false;
      if (fOrden && f.ordenId !== fOrden) return false;
      if (fFase && f.faseId !== fFase) return false;
      if (fRol && f.rolId !== fRol) return false;
      if (fEstado === "trabajando" && f.interrumpido) return false;
      if (fEstado === "interrumpido" && !f.interrumpido) return false;
      return true;
    });
  }, [filas, fPersona, fEquipo, fOrden, fFase, fRol, fEstado]);

  // Varias personas que se marcaron juntas como equipo (misma ronda +
  // mismo equipo_id) se muestran como UNA sola fila en el detalle, con los
  // nombres de todo el equipo, en vez de una fila repetida por persona. Si
  // el equipo tuvo roles distintos por persona (ej. costura: Costurera +
  // Ayudante de costura), se combinan en vez de quedarse solo con el rol
  // de la primera fila encontrada.
  const filasAgrupadas = useMemo(() => {
    const grupos = new Map<string, FilaAgrupada>();
    const rolesPorGrupo = new Map<string, Set<string>>();
    const detallePorGrupo = new Map<string, string[]>();
    const orden: string[] = [];
    filtradas.forEach((f) => {
      const clave = f.equipoId ? `${f.rondaId}|${f.equipoId}` : `solo|${f.id}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          ...f,
          esEquipo: !!f.equipoId,
          miembrosLabel: f.equipoId ? (f.equipoMiembros.length ? f.equipoMiembros.join(", ") : f.personaNombre) : f.personaNombre,
        });
        rolesPorGrupo.set(clave, new Set());
        detallePorGrupo.set(clave, []);
        orden.push(clave);
      }
      if (!f.interrumpido && f.rolNombre) {
        rolesPorGrupo.get(clave)!.add(f.rolNombre);
        detallePorGrupo.get(clave)!.push(`${f.personaNombre} (${f.rolNombre})`);
      } else if (f.equipoId) {
        detallePorGrupo.get(clave)!.push(f.personaNombre);
      }
    });
    return orden.map((clave) => {
      const base = grupos.get(clave)!;
      const roles = rolesPorGrupo.get(clave)!;
      const detalle = detallePorGrupo.get(clave)!;
      if (!base.esEquipo || roles.size <= 1) return base;
      return { ...base, rolNombre: Array.from(roles).join(" + "), miembrosLabel: detalle.join(", ") };
    });
  }, [filtradas]);

  const rolesDeFaseFiltro = fFase ? roles.filter((r) => r.fase_id === fFase) : roles;

  const resumenPorPersona = useMemo(() => {
    const porPersona = new Map<string, { nombre: string; total: number; porFase: Map<string, number>; interrumpido: number }>();
    filtradas.forEach((f) => {
      const entry = porPersona.get(f.personaId) ?? { nombre: f.personaNombre, total: 0, porFase: new Map(), interrumpido: 0 };
      entry.total += 1;
      if (f.interrumpido) {
        entry.interrumpido += 1;
      } else if (f.faseId) {
        entry.porFase.set(f.faseId, (entry.porFase.get(f.faseId) ?? 0) + 1);
      }
      porPersona.set(f.personaId, entry);
    });
    return Array.from(porPersona.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [filtradas]);

  const kpis = {
    observaciones: filtradas.length,
    rondas: new Set(filtradas.map((f) => f.fecha + f.hora)).size,
    personas: new Set(filtradas.map((f) => f.personaId)).size,
    pctInterrumpido: filtradas.length > 0 ? Math.round((filtradas.filter((f) => f.interrumpido).length / filtradas.length) * 100) : 0,
  };

  const totalPaginas = Math.max(1, Math.ceil(filasAgrupadas.length / PAGINA));
  const visibles = filasAgrupadas.slice((pagina - 1) * PAGINA, pagina * PAGINA);

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-3">
        <p className="text-[11.5px] text-text-faint mb-3">
          Detalle de las <b>Rondas de piso</b> (muestreo de trabajo): quién estuvo en qué fase y qué rol, por orden, con las interrupciones
          anotadas. Es independiente de &quot;Productividad&quot; — ese otro número mide unidades por hora en mesa, este mide cómo se reparte
          el tiempo del personal entre fases.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(
            [
              ["mes", "Este mes"],
              ["3meses", "Últimos 3 meses"],
              ["anio", "Este año"],
              ["anioAnterior", "Año anterior"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => aplicarPreset(key)}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full"
              style={{ background: "var(--card-2)", border: "1px solid var(--border-2)", color: "var(--text-dim)" }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg px-2.5 py-1.5" style={INPUT} />
          </div>
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg px-2.5 py-1.5" style={INPUT} />
          </div>
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Orden</label>
            <SelectBonito
              value={fOrden}
              onChange={setFOrden}
              options={[{ value: "", label: "Todas" }, ...ordenesRef.map((o) => ({ value: o.id, label: o.numero_etq }))]}
              maxWidth={190}
            />
          </div>
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Persona</label>
            <SelectBonito
              value={fPersona}
              onChange={setFPersona}
              options={[{ value: "", label: "Todas" }, ...personas.map((p) => ({ value: p.id, label: p.nombre }))]}
              maxWidth={160}
            />
          </div>
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Equipo</label>
            <SelectBonito
              value={fEquipo}
              onChange={setFEquipo}
              options={[{ value: "", label: "Todos" }, ...equipos.map((e) => ({ value: e.id, label: e.nombre }))]}
              maxWidth={160}
            />
          </div>
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Fase</label>
            <SelectBonito
              value={fFase}
              onChange={(v) => {
                setFFase(v);
                setFRol("");
              }}
              options={[{ value: "", label: "Todas" }, ...fases.map((f) => ({ value: f.id, label: f.nombre }))]}
              maxWidth={150}
            />
          </div>
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Rol</label>
            <SelectBonito
              value={fRol}
              onChange={setFRol}
              options={[{ value: "", label: "Todos" }, ...rolesDeFaseFiltro.map((r) => ({ value: r.id, label: r.nombre }))]}
              maxWidth={170}
            />
          </div>
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Estado</label>
            <SelectBonito
              value={fEstado}
              onChange={(v) => setFEstado(v as "todas" | "trabajando" | "interrumpido")}
              options={[
                { value: "todas", label: "Todas" },
                { value: "trabajando", label: "Trabajando" },
                { value: "interrumpido", label: "Interrumpido" },
              ]}
              maxWidth={150}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["detalle", "Detalle"],
            ["estadisticas", "Estadísticas (fluctuación)"],
            ["comparativa", "Comparativa y ranking"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setVista(key)}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-lg ${
              vista === key ? "bg-accent/[0.18] text-[#c4b8ff]" : "card text-text-dim"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {vista === "estadisticas" && (
        <EstadisticasFluctuacion
          filas={filas}
          fPersona={fPersona}
          fEquipo={fEquipo}
          fOrden={fOrden}
          fFase={fFase}
          fRol={fRol}
          personas={personas}
          equipos={equipos}
          ordenesRef={ordenesRef}
          desde={desde}
          hasta={hasta}
          setDesde={setDesde}
          setHasta={setHasta}
        />
      )}

      {vista === "comparativa" && (
        <ComparativaEquipos filas={filas} fases={fases} roles={roles} fOrden={fOrden} fFase={fFase} fRol={fRol} />
      )}

      {vista === "detalle" &&
        (loading ? (
        <p className="text-[12.5px] text-text-faint text-center py-6">Cargando trazabilidad…</p>
      ) : filtradas.length === 0 ? (
        <p className="text-[12.5px] text-text-faint text-center py-6">No hay rondas registradas para estos filtros.</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 max-[640px]:grid-cols-2">
            <div className="card p-3">
              <p className="text-[10px] text-text-faint uppercase tracking-wide">Observaciones</p>
              <p className="text-[20px] font-bold">{kpis.observaciones}</p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] text-text-faint uppercase tracking-wide">Rondas</p>
              <p className="text-[20px] font-bold">{kpis.rondas}</p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] text-text-faint uppercase tracking-wide">Personas distintas</p>
              <p className="text-[20px] font-bold">{kpis.personas}</p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] text-text-faint uppercase tracking-wide">% interrumpido</p>
              <p className="text-[20px] font-bold" style={{ color: kpis.pctInterrumpido > 20 ? "var(--red)" : "var(--text)" }}>
                {kpis.pctInterrumpido}%
              </p>
            </div>
          </div>

          <div className="card p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-text-faint mb-3">Por persona</p>
            <div className="flex flex-col gap-2.5">
              {resumenPorPersona.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <span className="w-[110px] shrink-0 text-[12.5px] font-medium truncate">{p.nombre}</span>
                  <div className="flex-1 flex h-4 rounded overflow-hidden min-w-0" style={{ background: "var(--card-2)" }}>
                    {Array.from(p.porFase.entries()).map(([faseId, n]) => {
                      const fase = fases.find((f) => f.id === faseId);
                      const pct = (n / p.total) * 100;
                      return <span key={faseId} title={fase?.nombre} style={{ width: pct + "%", background: colorSlot(fase?.color_slot ?? 1) }} />;
                    })}
                    {p.interrumpido > 0 && <span style={{ width: (p.interrumpido / p.total) * 100 + "%", background: "var(--red)" }} />}
                  </div>
                  <span className="w-[80px] shrink-0 text-right text-[11.5px] text-text-dim tabular-nums">{p.total} obs.</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2.5 mt-3">
              {fases.map((f) => (
                <span key={f.id} className="flex items-center gap-1.5 text-[11px] text-text-dim">
                  <span className="w-2 h-2 rounded-[3px]" style={{ background: colorSlot(f.color_slot) }} />
                  {f.nombre}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-[11px] text-text-dim">
                <span className="w-2 h-2 rounded-[3px]" style={{ background: "var(--red)" }} />
                Interrumpido
              </span>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="grid grid-cols-[80px_60px_110px_1fr_130px_130px_1fr_60px_70px] gap-3 px-4 py-2.5 text-[10.5px] uppercase tracking-wide text-text-faint border-b border-border">
              <span>Fecha</span>
              <span>Hora</span>
              <span>Orden</span>
              <span>Persona</span>
              <span>Fase</span>
              <span>Rol</span>
              <span>Estado</span>
              <span className="text-right">Cajas</span>
              <span className="text-right">Unidades</span>
            </div>
            {visibles.map((f) => (
              <div
                key={f.id}
                className="grid grid-cols-[80px_60px_110px_1fr_130px_130px_1fr_60px_70px] gap-3 px-4 py-2.5 items-center border-b border-border last:border-b-0 text-[12px]"
              >
                <span className="text-text-dim">{f.fecha.slice(5)}</span>
                <span className="text-text-dim tabular-nums">{f.hora}</span>
                <span className="font-medium truncate" title={f.ordenCliente}>
                  {f.ordenNumero}
                </span>
                <span className="truncate" title={f.esEquipo ? f.miembrosLabel : undefined}>
                  {f.esEquipo ? `👥 ${f.equipoNombre}` : f.personaNombre}
                  {f.esEquipo && <span className="text-text-faint"> ({f.equipoMiembros.length})</span>}
                </span>
                <span className="truncate" style={{ color: f.interrumpido ? "var(--text-dim)" : colorSlot(f.faseColorSlot) }}>
                  {f.interrumpido ? "—" : f.faseNombre}
                </span>
                <span className="text-text-dim truncate">{f.interrumpido ? "—" : f.rolNombre || "—"}</span>
                {f.interrumpido ? (
                  <span className="truncate text-[11px] font-semibold" style={{ color: "var(--red)" }} title={f.motivo ?? ""}>
                    Interrumpido: {f.motivo}
                    {f.ausenteDesde && f.ausenteHasta && ` (${f.ausenteDesde.slice(0, 5)}–${f.ausenteHasta.slice(0, 5)})`}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold" style={{ color: "var(--green)" }}>
                    Trabajando
                  </span>
                )}
                <span className="text-right tabular-nums text-text-dim">{f.avance || "—"}</span>
                <span className="text-right tabular-nums text-text-dim">{f.unidades ?? "—"}</span>
              </div>
            ))}
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-2">
              <button
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
                className="btn-secondary text-[12px] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
              >
                ‹ Anterior
              </button>
              <span className="text-[11.5px] text-text-dim">
                Página {pagina} de {totalPaginas}
              </span>
              <button
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => p + 1)}
                className="btn-secondary text-[12px] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
              >
                Siguiente ›
              </button>
            </div>
          )}
        </>
        ))}
    </div>
  );
}

// Fluctuación día por día de cuánto avanzó una persona o un equipo (suma
// de "cajas/lotes avanzados" de sus observaciones sin interrumpir), en
// todas las órdenes del período filtrado o, si se elige una orden
// puntual, acotado exactamente a su ciclo de vida: desde el primer
// movimiento registrado hasta que se concluyó (botón "Concluir orden" en
// la orden — concluida_en). Si todavía no se concluyó, se usa hoy.
function EstadisticasFluctuacion({
  filas,
  fPersona,
  fEquipo,
  fOrden,
  fFase,
  fRol,
  personas,
  equipos,
  ordenesRef,
  desde,
  hasta,
  setDesde,
  setHasta,
}: {
  filas: FilaDetalle[];
  fPersona: string;
  fEquipo: string;
  fOrden: string;
  fFase: string;
  fRol: string;
  personas: Persona[];
  equipos: Equipo[];
  ordenesRef: OrdenRef[];
  desde: string;
  hasta: string;
  setDesde: (v: string) => void;
  setHasta: (v: string) => void;
}) {
  const sujeto = useMemo(() => {
    if (fEquipo) return { tipo: "equipo" as const, id: fEquipo, nombre: equipos.find((e) => e.id === fEquipo)?.nombre ?? "" };
    if (fPersona) return { tipo: "persona" as const, id: fPersona, nombre: personas.find((p) => p.id === fPersona)?.nombre ?? "" };
    return null;
  }, [fEquipo, fPersona, equipos, personas]);

  const ordenSel = fOrden ? ordenesRef.find((o) => o.id === fOrden) : undefined;

  const limites = useMemo(() => {
    if (ordenSel) {
      const fechasOrden = filas.filter((f) => f.ordenId === fOrden).map((f) => f.fecha).filter(Boolean);
      const inicio = fechasOrden.length ? fechasOrden.reduce((a, b) => (b < a ? b : a)) : ordenSel.fecha ?? desde;
      const fin = ordenSel.concluida_en ? ordenSel.concluida_en.slice(0, 10) : hoyStr();
      return { inicio, fin, concluidaEn: ordenSel.concluida_en ? ordenSel.concluida_en.slice(0, 10) : null };
    }
    return { inicio: desde, fin: hasta, concluidaEn: null as string | null };
  }, [ordenSel, filas, fOrden, desde, hasta]);

  const fueraDeRango = ordenSel && (limites.inicio < desde || limites.fin > hasta);

  const [metrica, setMetrica] = useState<"cajas" | "unidades">("cajas");

  // Cajas y unidades se registran como TOTAL ACUMULADO DEL DÍA (lo que
  // dicen en cada vuelta tal cual, "vamos 20"), no un delta desde la
  // ronda anterior — por eso aquí se toma el valor MÁS ALTO del día por
  // cada combinación día+orden+fase (no se suman las vueltas), y recién
  // esos máximos se suman entre sí si hubo más de una orden/fase ese día.
  const serie = useMemo(() => {
    if (!sujeto) return [];
    const dias = rangoDeDias(limites.inicio, limites.fin);
    type Dia = {
      avance: number;
      unidades: number;
      obs: number;
      interrumpido: number;
      minAusente: number;
      minHora: string | null;
      maxHora: string | null;
    };
    const porDia = new Map<string, Dia>();
    dias.forEach((d) => porDia.set(d, { avance: 0, unidades: 0, obs: 0, interrumpido: 0, minAusente: 0, minHora: null, maxHora: null }));

    const grupos = new Map<string, { avanceMax: number; unidadesMax: number; minHora: string; maxHora: string }>();
    filas.forEach((f) => {
      const dia = porDia.get(f.fecha);
      if (!dia) return;
      if (fOrden && f.ordenId !== fOrden) return;
      if (fFase && f.faseId !== fFase) return;
      if (fRol && f.rolId !== fRol) return;
      if (sujeto.tipo === "equipo" && f.equipoId !== sujeto.id) return;
      if (sujeto.tipo === "persona" && f.personaId !== sujeto.id) return;

      dia.obs += 1;
      if (f.interrumpido) {
        dia.interrumpido += 1;
        dia.minAusente += minutosEntreHoras(f.ausenteDesde, f.ausenteHasta);
        return;
      }
      const claveGrupo = `${f.fecha}|${f.ordenId}|${f.faseId ?? ""}`;
      const g = grupos.get(claveGrupo) ?? { avanceMax: 0, unidadesMax: 0, minHora: f.horaISO, maxHora: f.horaISO };
      g.avanceMax = Math.max(g.avanceMax, f.avance || 0);
      g.unidadesMax = Math.max(g.unidadesMax, f.unidades ?? 0);
      if (f.horaISO && f.horaISO < g.minHora) g.minHora = f.horaISO;
      if (f.horaISO && f.horaISO > g.maxHora) g.maxHora = f.horaISO;
      grupos.set(claveGrupo, g);
    });

    grupos.forEach((g, clave) => {
      const fecha = clave.split("|")[0];
      const dia = porDia.get(fecha);
      if (!dia) return;
      dia.avance += g.avanceMax;
      dia.unidades += g.unidadesMax;
      if (!dia.minHora || g.minHora < dia.minHora) dia.minHora = g.minHora;
      if (!dia.maxHora || g.maxHora > dia.maxHora) dia.maxHora = g.maxHora;
    });

    return dias.map((d) => {
      const dia = porDia.get(d)!;
      const minutos =
        dia.minHora && dia.maxHora && dia.minHora !== dia.maxHora
          ? Math.round((new Date(dia.maxHora).getTime() - new Date(dia.minHora).getTime()) / 60000)
          : 0;
      const ritmo = minutos > 0 && dia.unidades > 0 ? Math.round((dia.unidades / minutos) * 100) / 100 : null;
      return {
        dia: d,
        diaLabel: d.slice(5),
        avance: dia.avance,
        unidades: dia.unidades,
        obs: dia.obs,
        interrumpido: dia.interrumpido,
        minAusente: dia.minAusente,
        minutos,
        ritmo,
      };
    });
  }, [sujeto, limites, filas, fOrden, fFase, fRol]);

  const totalAvance = serie.reduce((a, d) => a + d.avance, 0);
  const totalUnidades = serie.reduce((a, d) => a + d.unidades, 0);
  const diasConTrabajo = serie.filter((d) => d.obs > 0).length;
  const promedioPorDiaActivo = diasConTrabajo > 0 ? Math.round((totalAvance / diasConTrabajo) * 10) / 10 : 0;
  const diasConRitmo = serie.filter((d) => d.ritmo !== null);
  const ritmoPromedio =
    diasConRitmo.length > 0 ? Math.round((diasConRitmo.reduce((a, d) => a + (d.ritmo ?? 0), 0) / diasConRitmo.length) * 100) / 100 : null;
  const totalMinAusente = serie.reduce((a, d) => a + d.minAusente, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-3 flex flex-wrap items-center gap-2 justify-between">
        <p className="text-[11.5px] text-text-faint">
          Fluctuación de cuánto avanzó <b>una persona o un equipo</b> día por día. Elige a quién en el filtro &quot;Persona&quot; o
          &quot;Equipo&quot; de arriba; si además eliges una &quot;Orden&quot;, se acota exactamente desde que empezó hasta que se concluyó
          (o hoy, si sigue abierta).
        </p>
      </div>

      {!sujeto ? (
        <p className="text-[12.5px] text-text-faint text-center py-8">
          Elige una persona o un equipo en los filtros de arriba para ver su fluctuación.
        </p>
      ) : (
        <>
          {fueraDeRango && (
            <div className="card p-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "var(--amber)" }}>
              <p className="text-[12px] text-text-dim">
                La orden {ordenSel?.numero_etq} va del {limites.inicio.slice(5)} al {limites.fin.slice(5)}, fuera del rango de fechas
                elegido arriba ({desde.slice(5)} a {hasta.slice(5)}).
              </p>
              <button
                onClick={() => {
                  setDesde(limites.inicio);
                  setHasta(limites.fin);
                }}
                className="btn-secondary text-[11.5px] font-semibold px-3 py-1.5 rounded-lg shrink-0"
              >
                Ajustar fechas a esta orden
              </button>
            </div>
          )}

          <div className="grid grid-cols-6 gap-3 max-[900px]:grid-cols-3 max-[480px]:grid-cols-2">
            <div className="card p-3">
              <p className="text-[10px] text-text-faint uppercase tracking-wide">
                {sujeto.tipo === "equipo" ? "Equipo" : "Persona"}
              </p>
              <p className="text-[16px] font-bold truncate">{sujeto.tipo === "equipo" ? `👥 ${sujeto.nombre}` : sujeto.nombre}</p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] text-text-faint uppercase tracking-wide">Cajas del período</p>
              <p className="text-[20px] font-bold">{totalAvance}</p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] text-text-faint uppercase tracking-wide">Unidades del período</p>
              <p className="text-[20px] font-bold">{totalUnidades || "—"}</p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] text-text-faint uppercase tracking-wide">Promedio cajas/día activo</p>
              <p className="text-[20px] font-bold">{promedioPorDiaActivo}</p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] text-text-faint uppercase tracking-wide">Ritmo promedio</p>
              <p className="text-[20px] font-bold">{ritmoPromedio !== null ? `${ritmoPromedio} u/min` : "—"}</p>
            </div>
            <div className="card p-3">
              <p className="text-[10px] text-text-faint uppercase tracking-wide">Minutos ausente (período)</p>
              <p className="text-[20px] font-bold" style={{ color: totalMinAusente > 0 ? "var(--red)" : "var(--text)" }}>
                {totalMinAusente || "—"}
              </p>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-text-faint">
                {metrica === "cajas" ? "Cajas" : "Unidades"} por día — {limites.inicio.slice(5)} al {limites.fin.slice(5)}
                {ordenSel && !ordenSel.concluida_en && " (orden todavía abierta)"}
              </p>
              <div className="flex gap-1.5">
                {(["cajas", "unidades"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetrica(m)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                    style={
                      metrica === m
                        ? { background: "var(--accent)", color: "#fff" }
                        : { background: "var(--card-2)", border: "1px solid var(--border-2)", color: "var(--text-dim)" }
                    }
                  >
                    {m === "cajas" ? "Cajas" : "Unidades"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={serie} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="diaLabel" tick={{ fill: "var(--text-dim)", fontSize: 10.5 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "var(--text-dim)", fontSize: 10.5 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border-2)", borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(v) => "Día " + v}
                  />
                  <Bar dataKey={metrica} fill="var(--accent)" radius={[3, 3, 0, 0]} />
                  {limites.concluidaEn && (
                    <ReferenceLine x={limites.concluidaEn.slice(5)} stroke="var(--green)" label={{ value: "Concluida", fill: "var(--green)", fontSize: 10.5 }} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="grid grid-cols-[80px_1fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-2.5 text-[10.5px] uppercase tracking-wide text-text-faint border-b border-border">
              <span>Día</span>
              <span className="text-right">Cajas</span>
              <span className="text-right">Unidades</span>
              <span className="text-right">Ritmo (u/min)</span>
              <span className="text-right">Observaciones</span>
              <span className="text-right">Interrumpido</span>
              <span className="text-right">Min. ausente</span>
            </div>
            {serie.map((d) => (
              <div
                key={d.dia}
                className="grid grid-cols-[80px_1fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-2 items-center border-b border-border last:border-b-0 text-[12px]"
              >
                <span className="text-text-dim">{d.diaLabel}</span>
                <span className="text-right font-semibold tabular-nums">{d.avance || "—"}</span>
                <span className="text-right font-semibold tabular-nums">{d.unidades || "—"}</span>
                <span className="text-right text-text-dim tabular-nums">{d.ritmo !== null ? d.ritmo : "—"}</span>
                <span className="text-right text-text-dim tabular-nums">{d.obs || "—"}</span>
                <span className="text-right tabular-nums" style={{ color: d.interrumpido > 0 ? "var(--red)" : "var(--text-faint)" }}>
                  {d.interrumpido || "—"}
                </span>
                <span className="text-right tabular-nums" style={{ color: d.minAusente > 0 ? "var(--red)" : "var(--text-faint)" }}>
                  {d.minAusente || "—"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Compara, para un mismo proceso (fase y, opcionalmente, rol), cómo
// rindieron distintas personas o distintas composiciones de equipo en
// distintos días: cajas, unidades, minutos y ritmo (u/min) por instancia,
// más un ranking individual, un ranking de equipos (por composición exacta
// de integrantes) y una sugerencia automática de con quién/qué equipo se
// avanza más rápido, según el historial registrado.
type ColCampo = "fecha" | "ordenNumero" | "quienNombre" | "rolesLabel";
type OrdenCampo = ColCampo | "avance" | "unidades" | "minutos" | "ritmo";

type Instancia = {
  key: string;
  fecha: string;
  ordenNumero: string;
  faseNombre: string;
  esEquipo: boolean;
  quienId: string;
  quienNombre: string;
  miembros: string[];
  rolesLabel: string;
  avance: number;
  unidades: number;
  minutos: number;
  ritmo: number | null;
};

type RankingFila = {
  id: string;
  nombre: string;
  miembros: string[];
  dias: number;
  muestras: number;
  avanceTotal: number;
  unidadesTotal: number;
  ritmoPromedio: number | null;
};

function construirRanking(instancias: Instancia[], soloEquipo: boolean): RankingFila[] {
  const grupos = new Map<
    string,
    { nombre: string; miembros: string[]; ritmos: number[]; dias: Set<string>; avanceTotal: number; unidadesTotal: number }
  >();
  instancias
    .filter((i) => i.esEquipo === soloEquipo)
    .forEach((i) => {
      const g = grupos.get(i.quienId) ?? {
        nombre: i.quienNombre,
        miembros: i.miembros,
        ritmos: [] as number[],
        dias: new Set<string>(),
        avanceTotal: 0,
        unidadesTotal: 0,
      };
      if (i.ritmo !== null) g.ritmos.push(i.ritmo);
      g.dias.add(i.fecha);
      g.avanceTotal += i.avance;
      g.unidadesTotal += i.unidades;
      grupos.set(i.quienId, g);
    });
  return Array.from(grupos.entries())
    .map(([id, g]) => ({
      id,
      nombre: g.nombre,
      miembros: g.miembros,
      dias: g.dias.size,
      muestras: g.ritmos.length,
      avanceTotal: g.avanceTotal,
      unidadesTotal: g.unidadesTotal,
      ritmoPromedio: g.ritmos.length ? Math.round((g.ritmos.reduce((a, b) => a + b, 0) / g.ritmos.length) * 100) / 100 : null,
    }))
    .sort((a, b) => (b.ritmoPromedio ?? -1) - (a.ritmoPromedio ?? -1));
}

const PAGINA_RANKING = 6;

function TablaRanking({ titulo, filas, vacio }: { titulo: string; filas: RankingFila[]; vacio: string }) {
  const [pagina, setPagina] = useState(1);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- vuelve a página 1 cuando cambia el ranking (nuevo filtro de fase/rol/orden), no un ciclo de sincronización
    setPagina(1);
  }, [filas]);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / PAGINA_RANKING));
  const visibles = filas.slice((pagina - 1) * PAGINA_RANKING, pagina * PAGINA_RANKING);

  return (
    <div className="card overflow-hidden flex-1 min-w-[280px]">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-text-faint px-4 pt-3 pb-2">
        {titulo} {filas.length > 0 && <span className="text-text-faint font-normal">({filas.length})</span>}
      </p>
      {filas.length === 0 ? (
        <p className="text-[11.5px] text-text-faint px-4 pb-4">{vacio}</p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_70px_60px_70px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wide text-text-faint border-b border-border border-t">
            <span>Quién</span>
            <span className="text-right">Ritmo</span>
            <span className="text-right">Días</span>
            <span className="text-right">Unidades</span>
          </div>
          {visibles.map((f, i) => {
            const puestoGlobal = (pagina - 1) * PAGINA_RANKING + i;
            return (
              <div
                key={f.id}
                className="grid grid-cols-[1fr_70px_60px_70px] gap-2 px-4 py-2 items-center border-b border-border last:border-b-0 text-[12px]"
              >
                <span className="truncate font-medium" title={f.miembros.join(", ")}>
                  {puestoGlobal === 0 && f.ritmoPromedio !== null && "🏆 "}
                  {f.nombre}
                </span>
                <span
                  className="text-right tabular-nums"
                  style={{ color: puestoGlobal === 0 && f.ritmoPromedio !== null ? "var(--green)" : "var(--text)" }}
                >
                  {f.ritmoPromedio !== null ? `${f.ritmoPromedio} u/min` : "—"}
                </span>
                <span className="text-right text-text-dim tabular-nums">{f.dias}</span>
                <span className="text-right text-text-dim tabular-nums">{f.unidadesTotal || "—"}</span>
              </div>
            );
          })}
          <Paginador pagina={pagina} totalPaginas={totalPaginas} onChange={setPagina} />
        </>
      )}
    </div>
  );
}

// Cabecera de columna "a la Excel": click en el texto ordena asc/desc por
// esa columna; el botón ⏷ (solo en columnas con `filtro`) abre un panel con
// checkboxes de los valores únicos presentes, para mostrar solo lo que se
// quiere ver.
function Encabezado({
  label,
  campo,
  ordenCol,
  setOrdenCol,
  align = "left",
  filtro,
}: {
  label: string;
  campo: OrdenCampo;
  ordenCol: { campo: OrdenCampo; dir: "asc" | "desc" };
  setOrdenCol: (v: { campo: OrdenCampo; dir: "asc" | "desc" }) => void;
  align?: "left" | "right";
  filtro?: { valores: string[]; seleccionado: Set<string> | null; onChange: (s: Set<string> | null) => void; etiqueta?: (v: string) => string };
}) {
  const activo = ordenCol.campo === campo;
  const [panelAbierto, setPanelAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function alHacerClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPanelAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClick);
    return () => document.removeEventListener("mousedown", alHacerClick);
  }, []);
  const filtroActivo = !!filtro && filtro.seleccionado !== null && filtro.seleccionado.size < filtro.valores.length;

  return (
    <div ref={ref} className={`relative flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
      <button
        type="button"
        onClick={() => setOrdenCol({ campo, dir: activo && ordenCol.dir === "desc" ? "asc" : "desc" })}
        className="flex items-center gap-0.5 shrink-0"
        style={{ color: activo ? "var(--accent-2)" : "var(--text-faint)" }}
      >
        {label}
        {activo && <span style={{ fontSize: 8 }}>{ordenCol.dir === "desc" ? "▼" : "▲"}</span>}
      </button>
      {filtro && (
        <button type="button" onClick={() => setPanelAbierto((v) => !v)} style={{ color: filtroActivo ? "var(--accent-2)" : "var(--text-faint)" }}>
          <span style={{ fontSize: 8 }}>⏷</span>
        </button>
      )}
      {filtro && panelAbierto && (
        <div
          className="absolute z-30 top-full mt-1 rounded-lg overflow-hidden shadow-lg normal-case"
          style={{ background: "var(--card)", border: "1px solid var(--border-2)", width: 190, ...(align === "right" ? { right: 0 } : { left: 0 }) }}
        >
          <div className="flex justify-between px-2 py-1.5 border-b border-border">
            <button type="button" className="text-[10px] font-semibold" style={{ color: "var(--accent-2)" }} onClick={() => filtro.onChange(null)}>
              Todos
            </button>
            <button type="button" className="text-[10px] font-semibold text-text-faint" onClick={() => filtro.onChange(new Set())}>
              Ninguno
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtro.valores.map((v) => {
              const checked = filtro.seleccionado === null || filtro.seleccionado.has(v);
              return (
                <label key={v} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] cursor-pointer hover:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const base = filtro.seleccionado === null ? new Set(filtro.valores) : new Set(filtro.seleccionado);
                      if (checked) base.delete(v);
                      else base.add(v);
                      filtro.onChange(base.size === filtro.valores.length ? null : base);
                    }}
                  />
                  <span className="truncate">{filtro.etiqueta ? filtro.etiqueta(v) : v}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ComparativaEquipos({
  filas,
  fases,
  roles,
  fOrden,
  fFase,
  fRol,
}: {
  filas: FilaDetalle[];
  fases: Fase[];
  roles: Rol[];
  fOrden: string;
  fFase: string;
  fRol: string;
}) {
  const faseNombreSel = fases.find((f) => f.id === fFase)?.nombre ?? "";
  const rolNombreSel = roles.find((r) => r.id === fRol)?.nombre ?? "";

  const instancias = useMemo(() => {
    if (!fFase) return [] as Instancia[];
    type Grupo = {
      fecha: string;
      ordenNumero: string;
      faseNombre: string;
      esEquipo: boolean;
      quienId: string;
      quienNombre: string;
      miembros: string[];
      roles: Set<string>;
      avanceMax: number;
      unidadesMax: number;
      minHora: string;
      maxHora: string;
    };
    const grupos = new Map<string, Grupo>();
    filas.forEach((f) => {
      if (f.interrumpido) return;
      if (f.faseId !== fFase) return;
      if (fRol && f.rolId !== fRol) return;
      if (fOrden && f.ordenId !== fOrden) return;
      const quienId = f.equipoId ?? f.personaId;
      const clave = `${f.fecha}|${f.ordenId}|${f.faseId}|${quienId}`;
      const g =
        grupos.get(clave) ??
        ({
          fecha: f.fecha,
          ordenNumero: f.ordenNumero,
          faseNombre: f.faseNombre,
          esEquipo: !!f.equipoId,
          quienId,
          quienNombre: f.equipoId ? f.equipoNombre ?? "Equipo" : f.personaNombre,
          miembros: f.equipoId ? f.equipoMiembros : [f.personaNombre],
          roles: new Set<string>(),
          avanceMax: 0,
          unidadesMax: 0,
          minHora: f.horaISO,
          maxHora: f.horaISO,
        } as Grupo);
      g.avanceMax = Math.max(g.avanceMax, f.avance || 0);
      g.unidadesMax = Math.max(g.unidadesMax, f.unidades ?? 0);
      if (f.horaISO && f.horaISO < g.minHora) g.minHora = f.horaISO;
      if (f.horaISO && f.horaISO > g.maxHora) g.maxHora = f.horaISO;
      if (f.rolNombre) g.roles.add(f.rolNombre);
      grupos.set(clave, g);
    });
    return Array.from(grupos.entries())
      .map(([clave, g]) => {
        const minutos = g.minHora !== g.maxHora ? Math.round((new Date(g.maxHora).getTime() - new Date(g.minHora).getTime()) / 60000) : 0;
        const ritmo = minutos > 0 && g.unidadesMax > 0 ? Math.round((g.unidadesMax / minutos) * 100) / 100 : null;
        return {
          key: clave,
          fecha: g.fecha,
          ordenNumero: g.ordenNumero,
          faseNombre: g.faseNombre,
          esEquipo: g.esEquipo,
          quienId: g.quienId,
          quienNombre: g.quienNombre,
          miembros: g.miembros,
          rolesLabel: Array.from(g.roles).join(" + "),
          avance: g.avanceMax,
          unidades: g.unidadesMax,
          minutos,
          ritmo,
        };
      })
      .sort((a, b) => (b.ritmo ?? -1) - (a.ritmo ?? -1));
  }, [filas, fFase, fRol, fOrden]);

  const rankingIndividual = useMemo(() => construirRanking(instancias, false), [instancias]);
  const rankingEquipos = useMemo(() => construirRanking(instancias, true), [instancias]);

  // Filtros "a la Excel" por columna (checkboxes de valores únicos) y
  // orden/paginación de la tabla "Comparativa por día" — para que no se
  // vaya de largo cuando el período tiene muchas instancias.
  const PAGINA_COMPARATIVA = 15;
  const [colFiltros, setColFiltros] = useState<Record<ColCampo, Set<string> | null>>({
    fecha: null,
    ordenNumero: null,
    quienNombre: null,
    rolesLabel: null,
  });
  const [ordenCol, setOrdenCol] = useState<{ campo: OrdenCampo; dir: "asc" | "desc" }>({ campo: "ritmo", dir: "desc" });
  const [paginaComparativa, setPaginaComparativa] = useState(1);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- limpia filtros de columna al cambiar de proceso (fase/rol/orden), no un ciclo de sincronización
    setColFiltros({ fecha: null, ordenNumero: null, quienNombre: null, rolesLabel: null });
    setOrdenCol({ campo: "ritmo", dir: "desc" });
    setPaginaComparativa(1);
  }, [fFase, fRol, fOrden]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- vuelve a página 1 cuando cambia un filtro de columna o el orden, no un ciclo de sincronización
    setPaginaComparativa(1);
  }, [colFiltros, ordenCol]);

  const valoresFecha = useMemo(() => Array.from(new Set(instancias.map((i) => i.fecha))).sort(), [instancias]);
  const valoresOrden = useMemo(() => Array.from(new Set(instancias.map((i) => i.ordenNumero))).sort(), [instancias]);
  const valoresQuien = useMemo(() => Array.from(new Set(instancias.map((i) => i.quienNombre))).sort(), [instancias]);
  const valoresRol = useMemo(() => Array.from(new Set(instancias.map((i) => i.rolesLabel))).sort(), [instancias]);

  const instanciasFiltradas = useMemo(() => {
    let out = instancias;
    if (colFiltros.fecha) out = out.filter((i) => colFiltros.fecha!.has(i.fecha));
    if (colFiltros.ordenNumero) out = out.filter((i) => colFiltros.ordenNumero!.has(i.ordenNumero));
    if (colFiltros.quienNombre) out = out.filter((i) => colFiltros.quienNombre!.has(i.quienNombre));
    if (colFiltros.rolesLabel) out = out.filter((i) => colFiltros.rolesLabel!.has(i.rolesLabel));
    const dir = ordenCol.dir === "asc" ? 1 : -1;
    const campo = ordenCol.campo;
    return [...out].sort((a, b) => {
      const va = a[campo];
      const vb = b[campo];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [instancias, colFiltros, ordenCol]);

  const totalPaginasComparativa = Math.max(1, Math.ceil(instanciasFiltradas.length / PAGINA_COMPARATIVA));
  const visiblesComparativa = instanciasFiltradas.slice(
    (paginaComparativa - 1) * PAGINA_COMPARATIVA,
    paginaComparativa * PAGINA_COMPARATIVA
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-3">
        <p className="text-[11.5px] text-text-faint">
          Compara el <b>mismo proceso</b> (fase y, si quieres, rol) entre días y entre personas/equipos distintos: cuánto avanzó, en
          cuántos minutos y a qué ritmo (unidades por minuto) — para ver con quién o con qué combinación de equipo se avanza más rápido.
          Elige la <b>Fase</b> (y opcionalmente el <b>Rol</b>) en los filtros de arriba.
        </p>
      </div>

      {!fFase ? (
        <p className="text-[12.5px] text-text-faint text-center py-8">
          Elige una fase arriba (ej. &quot;Etiquetado&quot;) — y opcionalmente un rol (ej. &quot;Termofijador&quot;) — para ver la
          comparativa de ese proceso.
        </p>
      ) : instancias.length === 0 ? (
        <p className="text-[12.5px] text-text-faint text-center py-8">
          No hay observaciones de {faseNombreSel}
          {rolNombreSel && ` · ${rolNombreSel}`} sin interrupción en el rango de fechas elegido.
        </p>
      ) : (
        <>
          <div className="card p-4" style={{ border: "1px solid var(--accent-2)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-2">
              Sugerencia del sistema — {faseNombreSel}
              {rolNombreSel && ` · ${rolNombreSel}`}
            </p>
            <p className="text-[13px] leading-relaxed">
              {rankingEquipos[0]?.ritmoPromedio !== null && rankingEquipos[0] ? (
                <>
                  El <b>equipo más rápido</b> registrado es <b>👥 {rankingEquipos[0].miembros.join(" + ")}</b>, con un ritmo promedio de{" "}
                  <b>{rankingEquipos[0].ritmoPromedio} u/min</b> (basado en {rankingEquipos[0].dias} día
                  {rankingEquipos[0].dias === 1 ? "" : "s"}).{" "}
                </>
              ) : (
                "Todavía no hay suficientes rondas con equipos y unidades registradas para sugerir la mejor combinación. "
              )}
              {rankingIndividual[0]?.ritmoPromedio !== null && rankingIndividual[0] ? (
                <>
                  La <b>persona individual más rápida</b> es <b>{rankingIndividual[0].nombre}</b>, con{" "}
                  <b>{rankingIndividual[0].ritmoPromedio} u/min</b>.
                </>
              ) : (
                "Todavía no hay suficientes observaciones individuales con unidades para un top individual."
              )}
            </p>
            <p className="text-[10.5px] text-text-faint mt-2">
              El ritmo se calcula con el campo &quot;Unidades&quot; (opcional) de las rondas — si no se registran unidades, esa instancia
              no entra en el promedio de ritmo, aunque sí cuenta para las cajas totales.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <TablaRanking titulo="🏆 Top individual" filas={rankingIndividual} vacio="Nadie trabajó este proceso de forma individual todavía." />
            <TablaRanking titulo="🏆 Top equipos (por composición)" filas={rankingEquipos} vacio="Ningún equipo trabajó este proceso todavía." />
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between flex-wrap gap-2 px-4 pt-3 pb-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-text-faint">
                Comparativa por día <span className="text-text-faint font-normal">({instanciasFiltradas.length})</span>
              </p>
              <p className="text-[10.5px] text-text-faint">Click en un título para ordenar · ⏷ para filtrar esa columna</p>
            </div>
            <div className="grid grid-cols-[70px_90px_1fr_130px_55px_70px_60px_70px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wide text-text-faint border-b border-border border-t">
              <Encabezado
                label="Fecha"
                campo="fecha"
                ordenCol={ordenCol}
                setOrdenCol={setOrdenCol}
                filtro={{
                  valores: valoresFecha,
                  seleccionado: colFiltros.fecha,
                  onChange: (s) => setColFiltros((c) => ({ ...c, fecha: s })),
                  etiqueta: (v) => v.slice(5),
                }}
              />
              <Encabezado
                label="Orden"
                campo="ordenNumero"
                ordenCol={ordenCol}
                setOrdenCol={setOrdenCol}
                filtro={{ valores: valoresOrden, seleccionado: colFiltros.ordenNumero, onChange: (s) => setColFiltros((c) => ({ ...c, ordenNumero: s })) }}
              />
              <Encabezado
                label="Quién"
                campo="quienNombre"
                ordenCol={ordenCol}
                setOrdenCol={setOrdenCol}
                filtro={{ valores: valoresQuien, seleccionado: colFiltros.quienNombre, onChange: (s) => setColFiltros((c) => ({ ...c, quienNombre: s })) }}
              />
              <Encabezado
                label="Rol(es)"
                campo="rolesLabel"
                ordenCol={ordenCol}
                setOrdenCol={setOrdenCol}
                filtro={{
                  valores: valoresRol,
                  seleccionado: colFiltros.rolesLabel,
                  onChange: (s) => setColFiltros((c) => ({ ...c, rolesLabel: s })),
                  etiqueta: (v) => v || "(Sin rol)",
                }}
              />
              <Encabezado label="Cajas" campo="avance" ordenCol={ordenCol} setOrdenCol={setOrdenCol} align="right" />
              <Encabezado label="Unidades" campo="unidades" ordenCol={ordenCol} setOrdenCol={setOrdenCol} align="right" />
              <Encabezado label="Min." campo="minutos" ordenCol={ordenCol} setOrdenCol={setOrdenCol} align="right" />
              <Encabezado label="Ritmo" campo="ritmo" ordenCol={ordenCol} setOrdenCol={setOrdenCol} align="right" />
            </div>
            {visiblesComparativa.length === 0 ? (
              <p className="text-[12px] text-text-faint text-center py-6">Ningún resultado con estos filtros de columna.</p>
            ) : (
              visiblesComparativa.map((i) => (
                <div
                  key={i.key}
                  className="grid grid-cols-[70px_90px_1fr_130px_55px_70px_60px_70px] gap-2 px-4 py-2 items-center border-b border-border last:border-b-0 text-[12px]"
                >
                  <span className="text-text-dim">{i.fecha.slice(5)}</span>
                  <span className="font-medium truncate">{i.ordenNumero}</span>
                  <span className="truncate" title={i.miembros.join(", ")}>
                    {i.esEquipo ? `👥 ${i.quienNombre}` : i.quienNombre}
                  </span>
                  <span className="text-text-dim truncate" title={i.rolesLabel}>
                    {i.rolesLabel || "—"}
                  </span>
                  <span className="text-right tabular-nums">{i.avance || "—"}</span>
                  <span className="text-right tabular-nums">{i.unidades || "—"}</span>
                  <span className="text-right text-text-dim tabular-nums">{i.minutos || "—"}</span>
                  <span className="text-right font-semibold tabular-nums" style={{ color: i.ritmo !== null ? "var(--accent-2)" : "var(--text-faint)" }}>
                    {i.ritmo !== null ? i.ritmo : "—"}
                  </span>
                </div>
              ))
            )}
            <Paginador pagina={paginaComparativa} totalPaginas={totalPaginasComparativa} onChange={setPaginaComparativa} />
          </div>
        </>
      )}
    </div>
  );
}
