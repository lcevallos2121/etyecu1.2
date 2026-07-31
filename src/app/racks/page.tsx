"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, X, Unlock } from "lucide-react";
import { Toast } from "@/components/Feedback";
import { MapaDeposito } from "@/components/MapaDeposito";

export const dynamic = "force-dynamic";

type Posicion = { id: string; codigo_posicion: string; ocupado: boolean };
type Nivel = { id: string; numero_nivel: number; posiciones_nivel: Posicion[] };
type Rack = { id: string; codigo: string; descripcion: string | null };

type OrdenConSaldo = {
  id: string;
  numero_dap: string;
  cantidad_actual: number;
  cdas: { clientes: { nombre: string } | null } | null;
};

type UbicacionInfo = {
  id: string;
  posicion_id: string;
  cantidad: number;
  ordenes_dap: { numero_dap: string; cdas: { clientes: { nombre: string } | null } | null } | null;
};

export default function RacksPage() {
  const supabase = createClient();

  const [racks, setRacks] = useState<Rack[]>([]);
  const [rackSeleccionado, setRackSeleccionado] = useState<Rack | null>(null);
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Record<string, UbicacionInfo>>({});
  const [ordenes, setOrdenes] = useState<OrdenConSaldo[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [nuevoRackForm, setNuevoRackForm] = useState(false);
  const [codigoRack, setCodigoRack] = useState("");
  const [descRack, setDescRack] = useState("");
  const [tipoEspacioRack, setTipoEspacioRack] = useState<"deposito_aduanero_publico" | "bodega_simple">("deposito_aduanero_publico");

  const [posicionActiva, setPosicionActiva] = useState<Posicion | null>(null);
  const [ordenElegida, setOrdenElegida] = useState("");
  const [cantidadAsignar, setCantidadAsignar] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [vista, setVista] = useState<"mapa" | "gestion">("mapa");
  const [toast, setToast] = useState<string | null>(null);

  const cargarRacks = useCallback(async () => {
    const { data, error } = await supabase.from("racks").select("*").order("codigo");
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setRacks(data ?? []);
    if (data && data.length > 0 && !rackSeleccionado) {
      setRackSeleccionado(data[0]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const cargarDetalleRack = useCallback(
    async (rackId: string) => {
      const { data: nivelData, error: nivelError } = await supabase
        .from("niveles_rack")
        .select("id, numero_nivel, posiciones_nivel(id, codigo_posicion, ocupado)")
        .eq("rack_id", rackId)
        .order("numero_nivel");

      if (nivelError) {
        setErrorMsg(nivelError.message);
        return;
      }
      const nivelesTyped = (nivelData as unknown as Nivel[]) ?? [];
      setNiveles(nivelesTyped);

      const idsPosiciones = nivelesTyped.flatMap((n) => n.posiciones_nivel.map((p) => p.id));
      if (idsPosiciones.length > 0) {
        const { data: ubiData } = await supabase
          .from("ubicaciones_carga")
          .select("id, posicion_id, cantidad, ordenes_dap(numero_dap, cdas(clientes(nombre)))")
          .in("posicion_id", idsPosiciones);

        const map: Record<string, UbicacionInfo> = {};
        (ubiData as unknown as UbicacionInfo[] | null)?.forEach((u) => {
          map[u.posicion_id] = u;
        });
        setUbicaciones(map);
      } else {
        setUbicaciones({});
      }

      const { data: ordenData } = await supabase
        .from("ordenes_dap")
        .select("id, numero_dap, cantidad_actual, cdas(clientes(nombre))")
        .gt("cantidad_actual", 0)
        .order("numero_dap");
      setOrdenes((ordenData as unknown as OrdenConSaldo[]) ?? []);
    },
    [supabase]
  );

  useEffect(() => {
    cargarRacks();
  }, [cargarRacks]);

  useEffect(() => {
    if (rackSeleccionado) cargarDetalleRack(rackSeleccionado.id);
  }, [rackSeleccionado, cargarDetalleRack]);

  async function crearRack() {
    if (!codigoRack.trim()) return;
    const { data, error } = await supabase
      .from("racks")
      .insert({ codigo: codigoRack.trim(), descripcion: descRack.trim() || null, tipo_espacio: tipoEspacioRack })
      .select()
      .single();
    if (error) {
      setErrorMsg(error.message.includes("duplicate") ? "Ya existe un rack con ese código." : error.message);
      return;
    }
    setCodigoRack("");
    setDescRack("");
    setNuevoRackForm(false);
    setToast("Rack creado exitosamente.");
    await cargarRacks();
    setRackSeleccionado(data);
  }

  async function agregarNivel() {
    if (!rackSeleccionado) return;
    const siguiente = niveles.length > 0 ? Math.max(...niveles.map((n) => n.numero_nivel)) + 1 : 1;
    const { error } = await supabase
      .from("niveles_rack")
      .insert({ rack_id: rackSeleccionado.id, numero_nivel: siguiente });
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    cargarDetalleRack(rackSeleccionado.id);
  }

  async function agregarPosicion(nivelId: string, nivelNum: number) {
    const nivel = niveles.find((n) => n.id === nivelId);
    const siguienteLetra = String.fromCharCode(65 + (nivel?.posiciones_nivel.length ?? 0));
    const codigo = `N${nivelNum}-${siguienteLetra}`;
    const { error } = await supabase
      .from("posiciones_nivel")
      .insert({ nivel_id: nivelId, codigo_posicion: codigo, ocupado: false });
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    if (rackSeleccionado) cargarDetalleRack(rackSeleccionado.id);
  }

  function abrirPosicion(p: Posicion) {
    setPosicionActiva(p);
    setOrdenElegida("");
    setCantidadAsignar("");
    setErrorMsg(null);
  }

  async function asignarPosicion() {
    if (!posicionActiva || !ordenElegida || !cantidadAsignar) {
      setErrorMsg("Selecciona una orden e ingresa una cantidad.");
      return;
    }
    setProcesando(true);
    const { error: e1 } = await supabase.from("ubicaciones_carga").insert({
      posicion_id: posicionActiva.id,
      orden_dap_id: ordenElegida,
      cantidad: Number(cantidadAsignar),
    });
    if (!e1) {
      await supabase.from("posiciones_nivel").update({ ocupado: true }).eq("id", posicionActiva.id);
    }
    setProcesando(false);
    if (e1) {
      setErrorMsg(e1.message);
      return;
    }
    setPosicionActiva(null);
    setToast("Carga asignada a la posición correctamente.");
    if (rackSeleccionado) cargarDetalleRack(rackSeleccionado.id);
  }

  async function liberarPosicion() {
    if (!posicionActiva) return;
    const ubi = ubicaciones[posicionActiva.id];
    setProcesando(true);
    if (ubi) await supabase.from("ubicaciones_carga").delete().eq("id", ubi.id);
    await supabase.from("posiciones_nivel").update({ ocupado: false }).eq("id", posicionActiva.id);
    setProcesando(false);
    setPosicionActiva(null);
    setToast("Posición liberada correctamente.");
    if (rackSeleccionado) cargarDetalleRack(rackSeleccionado.id);
  }

  const ubicacionActiva = posicionActiva ? ubicaciones[posicionActiva.id] : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/racks" />

      <main className="flex-1 min-w-0">
        <Topbar />

        <div className="px-6.5 pt-5.5 pb-10">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Racks y ubicaciones</h1>
              <p className="text-[12.5px] text-text-faint">
                {vista === "mapa"
                  ? "Vista general del depósito — verde libre, morado ocupado"
                  : "Gestión de racks, niveles y posiciones"}
              </p>
            </div>
            <div className="flex gap-1 card p-1">
              <button
                onClick={() => setVista("mapa")}
                className={`text-[12px] font-medium px-3 py-1.5 rounded-md ${
                  vista === "mapa" ? "bg-accent/[0.18] text-[#c4b8ff]" : "text-text-dim"
                }`}
              >
                Mapa
              </button>
              <button
                onClick={() => setVista("gestion")}
                className={`text-[12px] font-medium px-3 py-1.5 rounded-md ${
                  vista === "gestion" ? "bg-accent/[0.18] text-[#c4b8ff]" : "text-text-dim"
                }`}
              >
                Gestión
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          {vista === "mapa" ? (
            <MapaDeposito />
          ) : (
          <div className="flex gap-4.5 items-start">
            <div className="w-[220px] shrink-0 card p-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-[12px] font-semibold text-text-dim">Racks</h3>
                <button
                  onClick={() => setNuevoRackForm(!nuevoRackForm)}
                  className="text-text-faint hover:text-text"
                >
                  <Plus size={15} />
                </button>
              </div>

              {nuevoRackForm && (
                <div className="mb-2 flex flex-col gap-1.5 px-1">
                  <input
                    value={codigoRack}
                    onChange={(e) => setCodigoRack(e.target.value)}
                    placeholder="Código (ej. R-01)"
                    className="card px-2 py-1.5 text-[12px] outline-none"
                  />
                  <input
                    value={descRack}
                    onChange={(e) => setDescRack(e.target.value)}
                    placeholder="Descripción (opcional)"
                    className="card px-2 py-1.5 text-[12px] outline-none"
                  />
                  <select
                    value={tipoEspacioRack}
                    onChange={(e) =>
                      setTipoEspacioRack(e.target.value as "deposito_aduanero_publico" | "bodega_simple")
                    }
                    className="card px-2 py-1.5 text-[12px] outline-none"
                  >
                    <option value="deposito_aduanero_publico">Depósito Aduanero Público</option>
                    <option value="bodega_simple">Bodega Simple</option>
                  </select>
                  <button
                    onClick={crearRack}
                    className="btn-primary text-[11.5px] font-semibold py-1.5 rounded-lg"
                  >
                    Crear rack
                  </button>
                </div>
              )}

              {loading ? (
                <p className="text-[12px] text-text-faint px-1">Cargando…</p>
              ) : racks.length === 0 ? (
                <p className="text-[12px] text-text-faint px-1">Sin racks todavía.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {racks.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRackSeleccionado(r)}
                      className={`text-left px-2.5 py-2 rounded-lg text-[12.5px] ${
                        rackSeleccionado?.id === r.id
                          ? "bg-accent/[0.18] text-[#c4b8ff]"
                          : "text-text-dim hover:bg-white/[0.03]"
                      }`}
                    >
                      {r.codigo}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 card p-5">
              {!rackSeleccionado ? (
                <p className="text-[13px] text-text-faint">
                  Crea un rack para empezar a mapear el depósito.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-[15px] font-semibold">{rackSeleccionado.codigo}</h3>
                      {rackSeleccionado.descripcion && (
                        <p className="text-[11.5px] text-text-faint">
                          {rackSeleccionado.descripcion}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={agregarNivel}
                      className="btn-secondary flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                    >
                      <Plus size={13} /> Nivel
                    </button>
                  </div>

                  {niveles.length === 0 ? (
                    <p className="text-[13px] text-text-faint">
                      Este rack todavía no tiene niveles. Agrega uno para empezar.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {niveles.map((n) => (
                        <div key={n.id}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[11.5px] font-semibold text-text-dim">
                              Nivel {n.numero_nivel}
                            </span>
                            <button
                              onClick={() => agregarPosicion(n.id, n.numero_nivel)}
                              className="text-text-faint hover:text-text"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {n.posiciones_nivel.length === 0 ? (
                              <p className="text-[11.5px] text-text-faint">Sin posiciones.</p>
                            ) : (
                              n.posiciones_nivel.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => abrirPosicion(p)}
                                  className={`w-16 h-16 rounded-lg border text-[10.5px] font-medium flex flex-col items-center justify-center gap-0.5 transition-transform hover:scale-105 ${
                                    p.ocupado
                                      ? "bg-accent/[0.22] border-accent-2/40 text-[#c4b8ff]"
                                      : "bg-green/[0.10] border-green/25 text-[#6ee7b7]"
                                  }`}
                                >
                                  <span>{p.codigo_posicion}</span>
                                  <span className="text-[9px] opacity-80">
                                    {p.ocupado ? "Ocupado" : "Libre"}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          )}
        </div>
      </main>

      {posicionActiva && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-[400px] p-6 relative">
            <button
              onClick={() => setPosicionActiva(null)}
              className="absolute top-4 right-4 text-text-faint hover:text-text"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <h2 className="text-[16px] font-semibold mb-1">
              Posición {posicionActiva.codigo_posicion}
            </h2>

            {errorMsg && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                {errorMsg}
              </div>
            )}

            {ubicacionActiva ? (
              <>
                <p className="text-[12.5px] text-text-dim mb-4">
                  Ocupada por <b className="text-text">{ubicacionActiva.ordenes_dap?.numero_dap}</b>{" "}
                  ({ubicacionActiva.ordenes_dap?.cdas?.clientes?.nombre ?? "—"}) ·{" "}
                  {ubicacionActiva.cantidad.toLocaleString("es-EC")} unidades
                </p>
                <button
                  onClick={liberarPosicion}
                  disabled={procesando}
                  className="btn-secondary w-full flex items-center justify-center gap-1.5 text-[13px] font-semibold py-2 rounded-lg disabled:opacity-60"
                >
                  <Unlock size={14} /> {procesando ? "Liberando…" : "Liberar posición"}
                </button>
              </>
            ) : (
              <>
                <p className="text-[12px] text-text-faint mb-3">Posición libre — asignar carga</p>
                <label className="text-[11.5px] text-text-faint block mb-1">Orden DAP</label>
                <select
                  value={ordenElegida}
                  onChange={(e) => setOrdenElegida(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none mb-3"
                >
                  <option value="">Selecciona una orden…</option>
                  {ordenes.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.numero_dap} · {o.cdas?.clientes?.nombre ?? "—"} (saldo{" "}
                      {o.cantidad_actual})
                    </option>
                  ))}
                </select>
                <label className="text-[11.5px] text-text-faint block mb-1">Cantidad</label>
                <input
                  type="number"
                  value={cantidadAsignar}
                  onChange={(e) => setCantidadAsignar(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none mb-4"
                  placeholder="Ej. 120"
                />
                <button
                  onClick={asignarPosicion}
                  disabled={procesando}
                  className="btn-primary w-full text-[13px] font-semibold py-2 rounded-lg disabled:opacity-60"
                >
                  {procesando ? "Asignando…" : "Asignar a esta posición"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
