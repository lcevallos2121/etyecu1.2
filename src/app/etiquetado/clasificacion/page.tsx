"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Trash2, Printer, Layers } from "lucide-react";
import { ConfirmModal, Toast } from "@/components/Feedback";

export const dynamic = "force-dynamic";

type EtqOrden = {
  id: string;
  numero_etq: string;
  cliente_nombre: string | null;
};

type FilaClasificacion = {
  id: string;
  orden_id: string;
  tipo_agrupacion: "tienda" | "codigo";
  valor: string;
  palet: string;
  rango_cajas: string;
  total_cajas: number;
  orden_fila: number;
};

export default function ClasificacionCargaPage() {
  const supabase = createClient();

  const [ordenes, setOrdenes] = useState<EtqOrden[]>([]);
  const [ordenSeleccionadaId, setOrdenSeleccionadaId] = useState("");
  const [filas, setFilas] = useState<FilaClasificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<string | null>(null);

  const [fTipo, setFTipo] = useState<"tienda" | "codigo">("tienda");
  const [fValor, setFValor] = useState("");
  const [fPalet, setFPalet] = useState("");
  const [fRango, setFRango] = useState("");
  const [fTotal, setFTotal] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargarOrdenes = useCallback(async () => {
    const { data } = await supabase
      .from("etq_ordenes")
      .select("id, numero_etq, cliente_nombre")
      .order("numero_etq");
    setOrdenes(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarOrdenes();
  }, [cargarOrdenes]);

  const cargarFilas = useCallback(
    async (ordenId: string) => {
      if (!ordenId) {
        setFilas([]);
        return;
      }
      const { data } = await supabase
        .from("etq_clasificacion_carga")
        .select("*")
        .eq("orden_id", ordenId)
        .order("orden_fila");
      setFilas((data as FilaClasificacion[]) ?? []);
    },
    [supabase]
  );

  useEffect(() => {
    cargarFilas(ordenSeleccionadaId);
  }, [ordenSeleccionadaId, cargarFilas]);

  async function agregarFila() {
    if (!ordenSeleccionadaId) {
      setErrorMsg("Selecciona una orden primero.");
      return;
    }
    if (!fValor.trim() || !fPalet.trim() || !fRango.trim()) {
      setErrorMsg("Completa Tienda/Código, Palet y Rango de cajas.");
      return;
    }
    setGuardando(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("etq_clasificacion_carga").insert({
        orden_id: ordenSeleccionadaId,
        tipo_agrupacion: fTipo,
        valor: fValor.trim().toUpperCase(),
        palet: fPalet.trim(),
        rango_cajas: fRango.trim(),
        total_cajas: Number(fTotal) || 0,
        orden_fila: filas.length,
      });
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      setFPalet("");
      setFRango("");
      setFTotal("");
      cargarFilas(ordenSeleccionadaId);
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    await supabase.from("etq_clasificacion_carga").delete().eq("id", aEliminar);
    setAEliminar(null);
    setToast("Fila eliminada.");
    cargarFilas(ordenSeleccionadaId);
  }

  const filasAgrupadas = useMemo(() => {
    const grupos = new Map<string, FilaClasificacion[]>();
    filas.forEach((f) => {
      const clave = `${f.tipo_agrupacion}:${f.valor}`;
      const actual = grupos.get(clave) ?? [];
      actual.push(f);
      grupos.set(clave, actual);
    });
    return Array.from(grupos.entries())
      .map(([, items]) => ({
        tipo: items[0].tipo_agrupacion,
        valor: items[0].valor,
        filas: items,
        totalCajas: items.reduce((a, f) => a + Number(f.total_cajas || 0), 0),
      }))
      .sort((a, b) => a.valor.localeCompare(b.valor));
  }, [filas]);

  const totalGeneralCajas = filas.reduce((a, f) => a + Number(f.total_cajas || 0), 0);
  const ordenActual = ordenes.find((o) => o.id === ordenSeleccionadaId);

  function imprimir() {
    if (filas.length === 0) {
      setErrorMsg("No hay filas capturadas para imprimir.");
      return;
    }
    setTimeout(() => window.print(), 100);
  }

  return (
    <div className="flex min-h-screen">
      <div className="print:hidden">
        <Sidebar activePath="/etiquetado/clasificacion" />
      </div>
      <main className="flex-1 min-w-0 print:hidden">
        <Topbar />
        <div className="px-6.5 pt-5.5 pb-10 max-w-[1100px]">
          <div className="flex items-center gap-2 mb-0.5">
            <Layers size={19} className="text-accent" />
            <h1 className="text-[21px] font-semibold">Clasificación de carga</h1>
          </div>
          <p className="text-[12.5px] text-text-faint mb-5">
            Paso previo al inventario: registra rápidamente qué tienda o código va en cada palet,
            para entregar la hoja al equipo que hace el conteo.
          </p>

          <div className="card p-3 mb-4">
            <label className="text-[11px] text-text-faint block mb-1">Orden de etiquetado</label>
            <select
              value={ordenSeleccionadaId}
              onChange={(e) => setOrdenSeleccionadaId(e.target.value)}
              className="card px-3 py-2 text-[12.5px] outline-none min-w-[340px]"
            >
              <option value="">Selecciona una orden…</option>
              {ordenes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.numero_etq} · {o.cliente_nombre ?? "—"}
                </option>
              ))}
            </select>
          </div>

          {!ordenSeleccionadaId ? (
            <div className="card p-8 text-center">
              <p className="text-[13px] text-text-faint">
                Elige una orden para empezar a clasificar su carga.
              </p>
            </div>
          ) : (
            <>
              <div className="card p-4 mb-4">
                <p className="text-[12.5px] font-semibold mb-3">Agregar fila</p>
                {errorMsg && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                    {errorMsg}
                  </div>
                )}
                <div className="grid grid-cols-6 gap-2 items-end">
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">Tipo</label>
                    <select
                      value={fTipo}
                      onChange={(e) => setFTipo(e.target.value as "tienda" | "codigo")}
                      className="w-full card px-2.5 py-2 text-[12.5px] outline-none"
                    >
                      <option value="tienda">Tienda</option>
                      <option value="codigo">Código</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">
                      {fTipo === "tienda" ? "Tienda" : "Código"}
                    </label>
                    <input
                      value={fValor}
                      onChange={(e) => setFValor(e.target.value)}
                      placeholder={fTipo === "tienda" ? "Ej. LUMA" : "Ej. A1"}
                      className="w-full card px-2.5 py-2 text-[12.5px] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">Palet</label>
                    <input
                      value={fPalet}
                      onChange={(e) => setFPalet(e.target.value)}
                      placeholder="Ej. 1"
                      className="w-full card px-2.5 py-2 text-[12.5px] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">
                      Rango de cajas
                    </label>
                    <input
                      value={fRango}
                      onChange={(e) => setFRango(e.target.value)}
                      placeholder="Ej. 1-15"
                      onKeyDown={(e) => e.key === "Enter" && agregarFila()}
                      className="w-full card px-2.5 py-2 text-[12.5px] outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">
                      Total cajas
                    </label>
                    <input
                      value={fTotal}
                      onChange={(e) => setFTotal(e.target.value)}
                      type="number"
                      placeholder="Ej. 25"
                      onKeyDown={(e) => e.key === "Enter" && agregarFila()}
                      className="w-full card px-2.5 py-2 text-[12.5px] outline-none"
                    />
                  </div>
                  <button
                    onClick={agregarFila}
                    disabled={guardando}
                    className="btn-primary flex items-center justify-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
                  >
                    <Plus size={14} /> {guardando ? "…" : "Agregar"}
                  </button>
                </div>
              </div>

              {loading ? (
                <p className="text-[12.5px] text-text-faint">Cargando…</p>
              ) : filasAgrupadas.length === 0 ? (
                <div className="card p-8 text-center">
                  <p className="text-[13px] text-text-faint">
                    Todavía no hay filas capturadas para esta orden.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12.5px] text-text-dim">
                      {filasAgrupadas.length} {filasAgrupadas.length === 1 ? "grupo" : "grupos"} ·{" "}
                      {filas.length} {filas.length === 1 ? "fila" : "filas"} · Total:{" "}
                      <span className="font-semibold text-text">{totalGeneralCajas} cajas</span>
                    </p>
                    <button
                      onClick={imprimir}
                      className="btn-secondary flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                    >
                      <Printer size={13} /> Generar PDF
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    {filasAgrupadas.map((grupo) => (
                      <div key={`${grupo.tipo}:${grupo.valor}`} className="card overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-b border-border">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-semibold ${
                                grupo.tipo === "tienda"
                                  ? "bg-accent/[0.18] text-[#c4b8ff]"
                                  : "bg-amber/[0.18] text-[#fbbf24]"
                              }`}
                            >
                              {grupo.tipo === "tienda" ? "Tienda" : "Código"}
                            </span>
                            <p className="text-[13.5px] font-semibold">{grupo.valor}</p>
                          </div>
                          <p className="text-[12px] text-text-dim">
                            {grupo.totalCajas} {grupo.totalCajas === 1 ? "caja" : "cajas"} en total
                          </p>
                        </div>
                        {grupo.filas.map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center justify-between px-4 py-2 border-b border-border last:border-b-0 text-[12.5px]"
                          >
                            <span>
                              Palet <span className="font-medium">{f.palet}</span> — cajas{" "}
                              <span className="font-mono">{f.rango_cajas}</span>
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-text-dim">{f.total_cajas} cajas</span>
                              <button
                                onClick={() => setAEliminar(f.id)}
                                className="text-text-faint hover:text-[#fca5a5]"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {ordenSeleccionadaId && filas.length > 0 && (
        <div className="print-area hidden print:block text-black bg-white p-10">
          <div className="max-w-[720px] mx-auto">
            <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-etyecu.png" alt="ETYECU" className="h-12" />
              <div className="text-right">
                <p className="text-[15px] font-bold">CLASIFICACIÓN DE CARGA</p>
                <p className="text-[11px]">Orden: {ordenActual?.numero_etq}</p>
                <p className="text-[11px]">Fecha: {new Date().toLocaleDateString("es-EC")}</p>
              </div>
            </div>

            <p className="text-[13px] font-semibold mb-3">
              Cliente: {ordenActual?.cliente_nombre ?? "—"}
            </p>

            <table className="w-full text-[11px] border border-black/50 border-collapse mb-3">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black/40 p-1.5 text-left">Tienda / Código</th>
                  <th className="border border-black/40 p-1.5 text-left">Palet</th>
                  <th className="border border-black/40 p-1.5 text-left">Rango de cajas</th>
                  <th className="border border-black/40 p-1.5 text-right">Total cajas</th>
                </tr>
              </thead>
              <tbody>
                {filasAgrupadas.map((grupo) =>
                  grupo.filas.map((f, i) => (
                    <tr key={f.id}>
                      {i === 0 && (
                        <td
                          className="border border-black/40 p-1.5 font-semibold align-top"
                          rowSpan={grupo.filas.length}
                        >
                          {grupo.valor}
                        </td>
                      )}
                      <td className="border border-black/40 p-1.5">Palet {f.palet}</td>
                      <td className="border border-black/40 p-1.5 font-mono">{f.rango_cajas}</td>
                      <td className="border border-black/40 p-1.5 text-right">{f.total_cajas}</td>
                    </tr>
                  ))
                )}
                <tr className="font-bold">
                  <td colSpan={3} className="border border-black/40 p-1.5 bg-gray-100">
                    TOTAL GENERAL
                  </td>
                  <td className="border border-black/40 p-1.5 text-right bg-gray-100">
                    {totalGeneralCajas}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        abierto={!!aEliminar}
        titulo="¿Eliminar esta fila?"
        mensaje="Esta acción no se puede deshacer."
        onConfirmar={confirmarEliminar}
        onCancelar={() => setAEliminar(null)}
      />
      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
