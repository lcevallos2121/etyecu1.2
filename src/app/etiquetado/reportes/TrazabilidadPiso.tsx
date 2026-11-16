"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

// Mapa de trazabilidad de las "Rondas de piso": el detalle, por persona y
// por orden, de en qué fase/rol estuvo cada quien según las rondas que el
// dueño fue registrando (muestreo de trabajo), con todos los filtros para
// poder revisarlo a fin de mes. Vive aparte de "Productividad" — ese
// término mide otra cosa (unidades/hora por mesa en etq_movimientos) y no
// se toca aquí.

type Fase = { id: string; nombre: string; color_slot: number };
type Rol = { id: string; fase_id: string; nombre: string };
type Persona = { id: string; nombre: string };
type OrdenRef = { id: string; numero_etq: string; cliente_nombre: string | null };
type Equipo = { id: string; nombre: string; persona_ids: string[] };

type FilaDetalle = {
  id: string;
  rondaId: string;
  fecha: string;
  hora: string;
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
  avance: number;
  equipoId: string | null;
  equipoNombre: string | null;
  equipoMiembros: string[];
};

type FilaAgrupada = FilaDetalle & { esEquipo: boolean; miembrosLabel: string };

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

const INPUT = { background: "var(--card-2)", border: "1px solid var(--border-2)", color: "var(--text)", fontSize: 16 };
const PAGINA = 15;

export default function TrazabilidadPiso() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [fases, setFases] = useState<Fase[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [ordenesRef, setOrdenesRef] = useState<OrdenRef[]>([]);
  const [filas, setFilas] = useState<FilaDetalle[]>([]);

  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoyStr());
  const [fPersona, setFPersona] = useState("");
  const [fOrden, setFOrden] = useState("");
  const [fFase, setFFase] = useState("");
  const [fRol, setFRol] = useState("");
  const [fEstado, setFEstado] = useState<"todas" | "trabajando" | "interrumpido">("todas");
  const [pagina, setPagina] = useState(1);

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
        avance: number;
      }[] = [];
      if (rondaIds.length) {
        const { data } = await supabase
          .from("rondas_observaciones")
          .select("id, ronda_id, persona_id, orden_id, fase_id, rol_id, equipo_id, interrumpido, motivo, avance")
          .in("ronda_id", rondaIds);
        obsData = data ?? [];
      }

      const ordenIds = Array.from(new Set(obsData.map((o) => o.orden_id)));
      const { data: ordenesData } = ordenIds.length
        ? await supabase.from("etq_ordenes").select("id, numero_etq, cliente_nombre").in("id", ordenIds)
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
          avance: o.avance,
          equipoId: o.equipo_id,
          equipoNombre: equipo?.nombre ?? null,
          equipoMiembros: equipo ? equipo.persona_ids.map((pid) => personasPorId.get(pid)?.nombre ?? "?") : [],
        };
      });
      filasArmadas.sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? 1 : -1));

      setFases((fasesRes.data as Fase[]) ?? []);
      setRoles((rolesRes.data as Rol[]) ?? []);
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
  }, [fPersona, fOrden, fFase, fRol, fEstado, desde, hasta]);

  const filtradas = useMemo(() => {
    return filas.filter((f) => {
      if (fPersona && f.personaId !== fPersona) return false;
      if (fOrden && f.ordenId !== fOrden) return false;
      if (fFase && f.faseId !== fFase) return false;
      if (fRol && f.rolId !== fRol) return false;
      if (fEstado === "trabajando" && f.interrumpido) return false;
      if (fEstado === "interrumpido" && !f.interrumpido) return false;
      return true;
    });
  }, [filas, fPersona, fOrden, fFase, fRol, fEstado]);

  // Varias personas que se marcaron juntas como equipo (misma ronda +
  // mismo equipo_id) se muestran como UNA sola fila en el detalle, con los
  // nombres de todo el equipo, en vez de una fila repetida por persona.
  const filasAgrupadas = useMemo(() => {
    const grupos = new Map<string, FilaAgrupada>();
    const orden: string[] = [];
    filtradas.forEach((f) => {
      const clave = f.equipoId ? `${f.rondaId}|${f.equipoId}` : `solo|${f.id}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          ...f,
          esEquipo: !!f.equipoId,
          miembrosLabel: f.equipoId ? (f.equipoMiembros.length ? f.equipoMiembros.join(", ") : f.personaNombre) : f.personaNombre,
        });
        orden.push(clave);
      }
    });
    return orden.map((k) => grupos.get(k)!);
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
            <select value={fOrden} onChange={(e) => setFOrden(e.target.value)} className="rounded-lg px-2.5 py-1.5" style={{ ...INPUT, maxWidth: 190 }}>
              <option value="">Todas</option>
              {ordenesRef.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.numero_etq}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Persona</label>
            <select value={fPersona} onChange={(e) => setFPersona(e.target.value)} className="rounded-lg px-2.5 py-1.5" style={{ ...INPUT, maxWidth: 160 }}>
              <option value="">Todas</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Fase</label>
            <select
              value={fFase}
              onChange={(e) => {
                setFFase(e.target.value);
                setFRol("");
              }}
              className="rounded-lg px-2.5 py-1.5"
              style={{ ...INPUT, maxWidth: 150 }}
            >
              <option value="">Todas</option>
              {fases.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Rol</label>
            <select value={fRol} onChange={(e) => setFRol(e.target.value)} className="rounded-lg px-2.5 py-1.5" style={{ ...INPUT, maxWidth: 170 }}>
              <option value="">Todos</option>
              {rolesDeFaseFiltro.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10.5px] text-text-faint block mb-1">Estado</label>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value as typeof fEstado)} className="rounded-lg px-2.5 py-1.5" style={{ ...INPUT, maxWidth: 150 }}>
              <option value="todas">Todas</option>
              <option value="trabajando">Trabajando</option>
              <option value="interrumpido">Interrumpido</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
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
            <div className="grid grid-cols-[80px_60px_110px_1fr_130px_130px_1fr_60px] gap-3 px-4 py-2.5 text-[10.5px] uppercase tracking-wide text-text-faint border-b border-border">
              <span>Fecha</span>
              <span>Hora</span>
              <span>Orden</span>
              <span>Persona</span>
              <span>Fase</span>
              <span>Rol</span>
              <span>Estado</span>
              <span className="text-right">Avance</span>
            </div>
            {visibles.map((f) => (
              <div
                key={f.id}
                className="grid grid-cols-[80px_60px_110px_1fr_130px_130px_1fr_60px] gap-3 px-4 py-2.5 items-center border-b border-border last:border-b-0 text-[12px]"
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
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold" style={{ color: "var(--green)" }}>
                    Trabajando
                  </span>
                )}
                <span className="text-right tabular-nums text-text-dim">{f.avance || "—"}</span>
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
      )}
    </div>
  );
}
