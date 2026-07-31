"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { X } from "lucide-react";

type TipoEspacio = "deposito_aduanero_publico" | "bodega_simple";

const espacioLabel: Record<TipoEspacio, string> = {
  deposito_aduanero_publico: "Depósito Aduanero Público",
  bodega_simple: "Bodega Simple",
};

type PosicionMapa = { id: string; codigo_posicion: string; ocupado: boolean };
type NivelMapa = { id: string; numero_nivel: number; posiciones_nivel: PosicionMapa[] };
type RackMapa = {
  id: string;
  codigo: string;
  descripcion: string | null;
  tipo_espacio: string;
  niveles_rack: NivelMapa[];
};

type DetalleUbicacion = {
  cantidad: number;
  posiciones_nivel: { codigo_posicion: string; niveles_rack: { numero_nivel: number } | null } | null;
  ordenes_dap: { numero_dap: string; cdas: { clientes: { nombre: string } | null } | null } | null;
};

export function MapaDeposito() {
  const supabase = createClient();

  const [racks, setRacks] = useState<RackMapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEspacio, setFiltroEspacio] = useState<TipoEspacio | "todos">("todos");

  const [rackDetalle, setRackDetalle] = useState<RackMapa | null>(null);
  const [detalleUbicaciones, setDetalleUbicaciones] = useState<DetalleUbicacion[]>([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("racks")
      .select("id, codigo, descripcion, tipo_espacio, niveles_rack(id, numero_nivel, posiciones_nivel(id, codigo_posicion, ocupado))")
      .order("codigo");
    setRacks((data as unknown as RackMapa[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function abrirDetalle(rack: RackMapa) {
    setRackDetalle(rack);
    const idsPosiciones = rack.niveles_rack.flatMap((n) => n.posiciones_nivel.map((p) => p.id));
    if (idsPosiciones.length === 0) {
      setDetalleUbicaciones([]);
      return;
    }
    const { data } = await supabase
      .from("ubicaciones_carga")
      .select("cantidad, posiciones_nivel(codigo_posicion, niveles_rack(numero_nivel)), ordenes_dap(numero_dap, cdas(clientes(nombre)))")
      .in("posicion_id", idsPosiciones);
    setDetalleUbicaciones((data as unknown as DetalleUbicacion[]) ?? []);
  }

  function statsRack(rack: RackMapa) {
    const posiciones = rack.niveles_rack.flatMap((n) => n.posiciones_nivel);
    const total = posiciones.length;
    const ocupadas = posiciones.filter((p) => p.ocupado).length;
    const pct = total > 0 ? Math.round((ocupadas / total) * 100) : 0;
    return { total, ocupadas, libres: total - ocupadas, pct };
  }

  const racksFiltrados = racks.filter(
    (r) => filtroEspacio === "todos" || r.tipo_espacio === filtroEspacio
  );

  return (
    <div>
      <div className="flex gap-2 mb-4.5">
        {(["todos", "deposito_aduanero_publico", "bodega_simple"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltroEspacio(f)}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-lg ${
              filtroEspacio === f ? "bg-accent/[0.18] text-[#c4b8ff]" : "card text-text-dim"
            }`}
          >
            {f === "todos" ? "Todos" : espacioLabel[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[13px] text-text-faint">Cargando mapa…</p>
      ) : racksFiltrados.length === 0 ? (
        <p className="text-[13px] text-text-faint">
          No hay racks {filtroEspacio !== "todos" ? `en ${espacioLabel[filtroEspacio]}` : "todavía"}.
          Créalos en la pestaña Gestión.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {racksFiltrados.map((rack) => {
            const s = statsRack(rack);
            const colorPct =
              s.pct >= 90 ? "text-[#fca5a5]" : s.pct >= 60 ? "text-[#fbbf24]" : "text-[#6ee7b7]";
            return (
              <button
                key={rack.id}
                onClick={() => abrirDetalle(rack)}
                className="card p-4 text-left hover:border-border-2 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[14px] font-semibold">{rack.codigo}</span>
                  <span className={`text-[15px] font-bold ${colorPct}`}>{s.pct}%</span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    rack.tipo_espacio === "bodega_simple"
                      ? "bg-amber/[0.14] text-[#fbbf24]"
                      : "bg-accent/[0.18] text-[#c4b8ff]"
                  }`}
                >
                  {rack.tipo_espacio === "bodega_simple" ? "Bodega" : "Depósito"}
                </span>

                {/* mini-mapa de posiciones */}
                <div className="flex flex-wrap gap-1 mt-3">
                  {rack.niveles_rack
                    .flatMap((n) => n.posiciones_nivel)
                    .slice(0, 24)
                    .map((p) => (
                      <span
                        key={p.id}
                        className={`w-3.5 h-3.5 rounded-sm ${
                          p.ocupado ? "bg-accent-2/70" : "bg-green/40"
                        }`}
                      />
                    ))}
                  {s.total === 0 && (
                    <span className="text-[11px] text-text-faint">Sin posiciones</span>
                  )}
                </div>

                <div className="flex gap-3 mt-3 text-[11px] text-text-faint">
                  <span>{s.ocupadas} ocup.</span>
                  <span>{s.libres} libres</span>
                  <span>{s.total} total</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Modal de detalle del rack */}
      {rackDetalle && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-[560px] p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setRackDetalle(null)}
              className="absolute top-4 right-4 text-text-faint hover:text-text"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <h2 className="text-[17px] font-semibold mb-0.5">{rackDetalle.codigo}</h2>
            <p className="text-[12px] text-text-faint mb-4">
              {espacioLabel[rackDetalle.tipo_espacio as TipoEspacio]}
              {rackDetalle.descripcion ? ` · ${rackDetalle.descripcion}` : ""}
            </p>

            {/* Vista por niveles */}
            <div className="flex flex-col gap-3 mb-5">
              {rackDetalle.niveles_rack.map((n) => {
                const ocup = n.posiciones_nivel.filter((p) => p.ocupado).length;
                return (
                  <div key={n.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11.5px] font-semibold text-text-dim">
                        Nivel {n.numero_nivel}
                      </span>
                      <span className="text-[11px] text-text-faint">
                        {ocup}/{n.posiciones_nivel.length} ocupadas
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {n.posiciones_nivel.map((p) => (
                        <span
                          key={p.id}
                          title={p.codigo_posicion}
                          className={`w-9 h-9 rounded-lg border flex items-center justify-center text-[9px] ${
                            p.ocupado
                              ? "bg-accent/[0.22] border-accent-2/40 text-[#c4b8ff]"
                              : "bg-green/[0.10] border-green/25 text-[#6ee7b7]"
                          }`}
                        >
                          {p.codigo_posicion}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Qué hay guardado */}
            <p className="text-[11.5px] font-semibold text-text-dim mb-2">Carga en este rack</p>
            {detalleUbicaciones.length === 0 ? (
              <p className="text-[12px] text-text-faint">Sin carga asignada.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {detalleUbicaciones.map((u, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between card px-3 py-2 text-[12px]"
                  >
                    <div>
                      <span className="text-text">{u.ordenes_dap?.numero_dap ?? "—"}</span>
                      <span className="text-text-faint">
                        {" "}
                        · {u.ordenes_dap?.cdas?.clientes?.nombre ?? "—"}
                      </span>
                    </div>
                    <div className="text-text-dim">
                      N{u.posiciones_nivel?.niveles_rack?.numero_nivel} ·{" "}
                      {u.posiciones_nivel?.codigo_posicion} ·{" "}
                      <b className="text-text">{u.cantidad.toLocaleString("es-EC")}</b>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
