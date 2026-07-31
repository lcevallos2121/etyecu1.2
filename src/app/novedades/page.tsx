"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, X, Check, Trash2, ImageOff, Pencil, FileText } from "lucide-react";
import { ConfirmModal, Toast } from "@/components/Feedback";

export const dynamic = "force-dynamic";

type OrdenRef = { id: string; numero_dap: string; cdas: { clientes: { nombre: string } | null } | null };

type Novedad = {
  id: string;
  tipo: "faltante" | "dano" | "sello_roto" | "otro";
  descripcion: string | null;
  foto_url: string | null;
  resuelto: boolean;
  creado_en: string;
  ordenes_dap: OrdenRef | null;
};

const tipoLabel: Record<Novedad["tipo"], string> = {
  faltante: "Faltante",
  dano: "Daño",
  sello_roto: "Sello roto",
  otro: "Otro",
};

const tipoColor: Record<Novedad["tipo"], string> = {
  faltante: "bg-red/[0.16] text-[#fca5a5]",
  dano: "bg-amber/[0.16] text-[#fbbf24]",
  sello_roto: "bg-accent/[0.18] text-[#c4b8ff]",
  otro: "bg-white/[0.08] text-text-dim",
};

export default function NovedadesPage() {
  const supabase = createClient();

  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "pendientes" | "resueltas">("pendientes");

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [ordenId, setOrdenId] = useState("");
  const [tipo, setTipo] = useState<Novedad["tipo"]>("dano");
  const [descripcion, setDescripcion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [novedadImprimir, setNovedadImprimir] = useState<Novedad | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<string | null>(null);

  useEffect(() => {
    if (novedadImprimir) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [novedadImprimir]);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const [{ data: novData, error: novError }, { data: ordenData }] = await Promise.all([
      supabase
        .from("novedades")
        .select("*, ordenes_dap(id, numero_dap, cdas(clientes(nombre)))")
        .order("creado_en", { ascending: false }),
      supabase.from("ordenes_dap").select("id, numero_dap, cdas(clientes(nombre))").order("numero_dap"),
    ]);

    if (novError) {
      setErrorMsg(
        novError.message.includes("permission")
          ? "Sin permisos para leer novedades. Falta correr novedades_bucket_y_policies.sql en Supabase."
          : novError.message
      );
    } else {
      setNovedades((novData as unknown as Novedad[]) ?? []);
    }

    setOrdenes((ordenData as unknown as OrdenRef[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  function abrirForm() {
    setEditId(undefined);
    setOrdenId("");
    setTipo("dano");
    setDescripcion("");
    setArchivo(null);
    setErrorMsg(null);
    setShowForm(true);
  }

  function abrirEditar(n: Novedad) {
    setEditId(n.id);
    setOrdenId(n.ordenes_dap?.id ?? "");
    setTipo(n.tipo);
    setDescripcion(n.descripcion ?? "");
    setArchivo(null);
    setErrorMsg(null);
    setShowForm(true);
  }

  async function guardar() {
    if (!ordenId) {
      setErrorMsg("Selecciona una orden DAP.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);

    let fotoUrl: string | null = null;

    if (archivo) {
      const nombreArchivo = `${Date.now()}_${archivo.name.replace(/\s+/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("novedades")
        .upload(nombreArchivo, archivo);

      if (uploadError) {
        setSaving(false);
        setErrorMsg(
          uploadError.message.includes("Bucket not found")
            ? "Falta crear el bucket 'novedades' en Supabase (correr novedades_bucket_y_policies.sql)."
            : uploadError.message
        );
        return;
      }

      const { data: urlData } = supabase.storage.from("novedades").getPublicUrl(nombreArchivo);
      fotoUrl = urlData.publicUrl;
    }

    const payload: {
      orden_dap_id: string;
      tipo: Novedad["tipo"];
      descripcion: string | null;
      foto_url?: string | null;
    } = {
      orden_dap_id: ordenId,
      tipo,
      descripcion: descripcion.trim() || null,
    };
    if (fotoUrl) payload.foto_url = fotoUrl;

    const { error } = editId
      ? await supabase.from("novedades").update(payload).eq("id", editId)
      : await supabase.from("novedades").insert({ ...payload, foto_url: fotoUrl, resuelto: false });

    setSaving(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setShowForm(false);
    setToast(editId ? "Novedad actualizada correctamente." : "Novedad registrada exitosamente.");
    cargarDatos();
  }

  async function marcarResuelto(n: Novedad) {
    await supabase.from("novedades").update({ resuelto: !n.resuelto }).eq("id", n.id);
    setToast(n.resuelto ? "Novedad reabierta." : "Novedad marcada como resuelta.");
    cargarDatos();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const { error } = await supabase.from("novedades").delete().eq("id", aEliminar);
    setAEliminar(null);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setToast("Novedad eliminada correctamente.");
    cargarDatos();
  }

  const novedadesFiltradas = novedades.filter((n) => {
    if (filtro === "pendientes") return !n.resuelto;
    if (filtro === "resueltas") return n.resuelto;
    return true;
  });

  const pendientesCount = novedades.filter((n) => !n.resuelto).length;

  return (
    <div className="flex min-h-screen">
      <div className="print:hidden">
        <Sidebar activePath="/novedades" />
      </div>

      <main className="flex-1 min-w-0">
        <div className="print:hidden">
          <Topbar />
        </div>

        <div className="px-6.5 pt-5.5 pb-10 print:hidden">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Novedades</h1>
              <p className="text-[12.5px] text-text-faint">
                {pendientesCount} pendiente{pendientesCount !== 1 ? "s" : ""} de {novedades.length} total
                {novedades.length !== 1 ? "es" : ""}
              </p>
            </div>
            <button
              onClick={abrirForm}
              disabled={ordenes.length === 0}
              className="btn-primary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              <Plus size={15} /> Nueva novedad
            </button>
          </div>

          <div className="flex gap-2 mb-4.5">
            {(["pendientes", "resueltas", "todas"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`text-[12px] font-medium px-3 py-1.5 rounded-lg ${
                  filtro === f ? "bg-accent/[0.18] text-[#c4b8ff]" : "card text-text-dim"
                }`}
              >
                {f === "pendientes" ? "Pendientes" : f === "resueltas" ? "Resueltas" : "Todas"}
              </button>
            ))}
          </div>

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <p className="text-[13px] text-text-faint">Cargando novedades…</p>
          ) : novedadesFiltradas.length === 0 ? (
            <p className="text-[13px] text-text-faint">No hay novedades en este filtro.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {novedadesFiltradas.map((n) => (
                <div key={n.id} className="card overflow-hidden">
                  <div className="aspect-video bg-card-2 flex items-center justify-center">
                    {n.foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.foto_url} alt={n.tipo} className="w-full h-full object-cover" />
                    ) : (
                      <ImageOff size={22} className="text-text-faint" />
                    )}
                  </div>
                  <div className="p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10.5px] px-2 py-0.5 rounded-full ${tipoColor[n.tipo]}`}>
                        {tipoLabel[n.tipo]}
                      </span>
                      {n.resuelto && (
                        <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-green/[0.14] text-[#6ee7b7]">
                          Resuelto
                        </span>
                      )}
                    </div>
                    <p className="text-[12.5px] font-medium">
                      {n.ordenes_dap?.numero_dap ?? "—"}
                    </p>
                    <p className="text-[11px] text-text-faint mb-2 truncate">
                      {n.ordenes_dap?.cdas?.clientes?.nombre ?? "—"}
                    </p>
                    {n.descripcion && (
                      <p className="text-[11.5px] text-text-dim mb-3 line-clamp-2">
                        {n.descripcion}
                      </p>
                    )}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => marcarResuelto(n)}
                        className="btn-secondary flex-1 flex items-center justify-center gap-1 text-[11.5px] font-semibold py-1.5 rounded-lg"
                      >
                        <Check size={12} /> {n.resuelto ? "Reabrir" : "Resolver"}
                      </button>
                      <button
                        onClick={() => setNovedadImprimir(n)}
                        className="w-8 h-8 rounded-lg card flex items-center justify-center text-text-dim hover:text-text"
                        aria-label="Reporte PDF"
                        title="Reporte PDF"
                      >
                        <FileText size={13} />
                      </button>
                      <button
                        onClick={() => abrirEditar(n)}
                        className="w-8 h-8 rounded-lg card flex items-center justify-center text-text-dim hover:text-text"
                        aria-label="Editar"
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setAEliminar(n.id)}
                        className="w-8 h-8 rounded-lg card flex items-center justify-center text-red-300 hover:bg-red/10"
                        aria-label="Eliminar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 print:hidden">
          <div className="card w-full max-w-[420px] p-6 relative">
            <button
              onClick={() => setShowForm(false)}
              className="absolute top-4 right-4 text-text-faint hover:text-text"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <h2 className="text-[17px] font-semibold mb-4">
              {editId ? "Editar novedad" : "Nueva novedad"}
            </h2>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Orden DAP *</label>
                <select
                  value={ordenId}
                  onChange={(e) => setOrdenId(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  <option value="">Selecciona una orden…</option>
                  {ordenes.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.numero_dap} · {o.cdas?.clientes?.nombre ?? "—"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Tipo *</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(tipoLabel) as Novedad["tipo"][]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipo(t)}
                      className={`text-[12px] font-medium py-2 rounded-lg border ${
                        tipo === t
                          ? "bg-accent/[0.18] text-[#c4b8ff] border-accent-2/30"
                          : "border-border-2 text-text-dim"
                      }`}
                    >
                      {tipoLabel[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Descripción</label>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                  className="w-full card px-3 py-2 text-[13px] outline-none resize-none"
                  placeholder="Detalle breve de lo ocurrido…"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Foto (opcional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                  className="w-full text-[12px] text-text-dim"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={guardar}
                disabled={saving}
                className="btn-primary flex-1 text-[13px] font-semibold py-2 rounded-lg disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VISTA DE IMPRESIÓN: REPORTE DE NOVEDAD */}
      {novedadImprimir && (
        <div className="print-area hidden print:block text-black bg-white p-10">
          <div className="max-w-[640px] mx-auto">
            <div className="flex items-center justify-center gap-3 mb-1">
              <span className="font-bold text-[18px]">ETYECU</span>
              <span className="text-[14px] font-bold">DEPÓSITO ADUANERO PÚBLICO</span>
            </div>
            <p className="text-[15px] font-bold text-center mb-5">REPORTE DE NOVEDAD</p>

            <table className="w-full text-[10.5px] border border-black/50 border-collapse mb-5">
              <tbody>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold w-[150px]">
                    Orden DAP:
                  </td>
                  <td className="border border-black/40 p-1.5">
                    {novedadImprimir.ordenes_dap?.numero_dap ?? "—"}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Cliente:</td>
                  <td className="border border-black/40 p-1.5">
                    {novedadImprimir.ordenes_dap?.cdas?.clientes?.nombre ?? "—"}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Tipo de novedad:</td>
                  <td className="border border-black/40 p-1.5">{tipoLabel[novedadImprimir.tipo]}</td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Estado:</td>
                  <td className="border border-black/40 p-1.5">
                    {novedadImprimir.resuelto ? "Resuelto" : "Pendiente"}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Fecha de registro:</td>
                  <td className="border border-black/40 p-1.5">
                    {new Date(novedadImprimir.creado_en).toLocaleDateString("es-EC")}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="text-[10.5px] font-bold mb-1">Descripción:</p>
            <div className="border border-black/40 p-2 text-[10.5px] min-h-[60px] mb-4">
              {novedadImprimir.descripcion || "Sin descripción."}
            </div>

            {novedadImprimir.foto_url && (
              <>
                <p className="text-[10.5px] font-bold mb-1">Evidencia fotográfica:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={novedadImprimir.foto_url}
                  alt="Evidencia"
                  className="max-w-[400px] border border-black/40 mb-6"
                />
              </>
            )}

            <div className="flex justify-between text-[10px] mt-16">
              <p className="border-t border-black w-[240px] text-center pt-1">
                Reportado por (DAP ETYECU)
              </p>
              <p className="border-t border-black w-[240px] text-center pt-1">
                Recibido / Revisado
              </p>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        abierto={aEliminar !== null}
        titulo="¿Eliminar novedad?"
        mensaje="Esta acción no se puede deshacer. Se eliminará la novedad y su evidencia."
        onConfirmar={confirmarEliminar}
        onCancelar={() => setAEliminar(null)}
      />
      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
