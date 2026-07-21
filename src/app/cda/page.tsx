"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Pencil, Trash2, X } from "lucide-react";

export const dynamic = "force-dynamic";

type ClienteRef = { id: string; nombre: string };

type Cda = {
  id: string;
  numero_orden: string;
  cliente_id: string;
  bl: string | null;
  transporte: string | null;
  proveedor: string | null;
  factura: string | null;
  valor_garantia: number | null;
  creado_en: string;
  clientes: ClienteRef | null;
};

type FormState = {
  id?: string;
  numero_orden: string;
  cliente_id: string;
  bl: string;
  transporte: string;
  proveedor: string;
  factura: string;
  valor_garantia: string;
};

const emptyForm: FormState = {
  numero_orden: "",
  cliente_id: "",
  bl: "",
  transporte: "",
  proveedor: "",
  factura: "",
  valor_garantia: "",
};

export default function CdaPage() {
  const supabase = createClient();

  const [cdas, setCdas] = useState<Cda[]>([]);
  const [clientes, setClientes] = useState<ClienteRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const [{ data: cdaData, error: cdaError }, { data: clienteData, error: clienteError }] =
      await Promise.all([
        supabase
          .from("cdas")
          .select("*, clientes(id, nombre)")
          .order("creado_en", { ascending: false }),
        supabase.from("clientes").select("id, nombre").order("nombre"),
      ]);

    if (cdaError) {
      setErrorMsg(
        cdaError.message.includes("permission")
          ? "Sin permisos para leer CDA. Falta crear la política temporal de RLS en Supabase para la tabla cdas."
          : cdaError.message
      );
    } else {
      setCdas((cdaData as unknown as Cda[]) ?? []);
    }

    if (!clienteError) setClientes(clienteData ?? []);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  function abrirNuevo() {
    setForm(emptyForm);
    setShowForm(true);
  }

  function abrirEditar(c: Cda) {
    setForm({
      id: c.id,
      numero_orden: c.numero_orden,
      cliente_id: c.cliente_id,
      bl: c.bl ?? "",
      transporte: c.transporte ?? "",
      proveedor: c.proveedor ?? "",
      factura: c.factura ?? "",
      valor_garantia: c.valor_garantia?.toString() ?? "",
    });
    setShowForm(true);
  }

  async function guardar() {
    if (!form.numero_orden.trim() || !form.cliente_id) {
      setErrorMsg("Número de orden y cliente son obligatorios.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);

    const payload = {
      numero_orden: form.numero_orden.trim(),
      cliente_id: form.cliente_id,
      bl: form.bl.trim() || null,
      transporte: form.transporte.trim() || null,
      proveedor: form.proveedor.trim() || null,
      factura: form.factura.trim() || null,
      valor_garantia: form.valor_garantia ? Number(form.valor_garantia) : null,
    };

    const { error } = form.id
      ? await supabase.from("cdas").update(payload).eq("id", form.id)
      : await supabase.from("cdas").insert(payload);

    setSaving(false);

    if (error) {
      setErrorMsg(
        error.message.includes("duplicate")
          ? "Ya existe un CDA con ese número de orden."
          : error.message
      );
      return;
    }

    setShowForm(false);
    cargarDatos();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este CDA? Esta acción no se puede deshacer.")) return;
    const { error } = await supabase.from("cdas").delete().eq("id", id);
    if (error) {
      setErrorMsg(
        error.message.includes("foreign key") || error.message.includes("violates")
          ? "No se puede eliminar: este CDA tiene órdenes DAP asociadas."
          : error.message
      );
      return;
    }
    cargarDatos();
  }

  const cdasFiltrados = cdas.filter(
    (c) =>
      c.numero_orden.toLowerCase().includes(search.toLowerCase()) ||
      c.clientes?.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/cda" />

      <main className="flex-1 min-w-0">
        <Topbar userName="Abigail Cobos" userRole="Gerencia General" />

        <div className="px-6.5 pt-5.5 pb-10">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">CDA</h1>
              <p className="text-[12.5px] text-text-faint">
                {cdas.length} contrato{cdas.length !== 1 ? "s" : ""} de aduana registrado
                {cdas.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={abrirNuevo}
              disabled={clientes.length === 0}
              className="btn-primary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
              title={clientes.length === 0 ? "Primero registra un cliente" : undefined}
            >
              <Plus size={15} /> Nuevo CDA
            </button>
          </div>

          {clientes.length === 0 && !loading && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber/10 border border-amber/20 text-[12.5px] text-[#fbbf24]">
              Todavía no hay clientes registrados. Crea uno primero en la pantalla de Clientes.
            </div>
          )}

          <input
            placeholder="Buscar por número de orden o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-[340px] card px-3 py-2 text-[12.5px] mb-4.5 outline-none focus:border-border-2 placeholder:text-text-faint"
          />

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="grid grid-cols-[1.3fr_1.8fr_1.2fr_1.3fr_1.1fr_90px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
              <span>N° Orden</span>
              <span>Cliente</span>
              <span>BL</span>
              <span>Proveedor</span>
              <span>Garantía</span>
              <span></span>
            </div>

            {loading ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">Cargando CDA…</p>
            ) : cdasFiltrados.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">
                No hay CDA {search ? "que coincidan con la búsqueda" : "registrados todavía"}.
              </p>
            ) : (
              cdasFiltrados.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[1.3fr_1.8fr_1.2fr_1.3fr_1.1fr_90px] gap-3 px-5 py-3.5 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02]"
                >
                  <span className="text-[13px] font-medium">{c.numero_orden}</span>
                  <span className="text-[12.5px] text-text-dim truncate">
                    {c.clientes?.nombre ?? "—"}
                  </span>
                  <span className="text-[12.5px] text-text-dim truncate">{c.bl || "—"}</span>
                  <span className="text-[12.5px] text-text-dim truncate">
                    {c.proveedor || "—"}
                  </span>
                  <span className="text-[12.5px] text-text-dim">
                    {c.valor_garantia != null
                      ? `$${c.valor_garantia.toLocaleString("es-EC", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </span>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => abrirEditar(c)}
                      className="w-7 h-7 rounded-lg card flex items-center justify-center text-text-dim hover:text-text"
                      aria-label="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => eliminar(c.id)}
                      className="w-7 h-7 rounded-lg card flex items-center justify-center text-red-300 hover:bg-red/10"
                      aria-label="Eliminar"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-[460px] p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowForm(false)}
              className="absolute top-4 right-4 text-text-faint hover:text-text"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <h2 className="text-[17px] font-semibold mb-4">
              {form.id ? "Editar CDA" : "Nuevo CDA"}
            </h2>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">
                  Número de orden *
                </label>
                <input
                  value={form.numero_orden}
                  onChange={(e) => setForm({ ...form, numero_orden: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="0282026007933"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Cliente *</label>
                <select
                  value={form.cliente_id}
                  onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                >
                  <option value="">Selecciona un cliente…</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">BL</label>
                <input
                  value={form.bl}
                  onChange={(e) => setForm({ ...form, bl: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="MSCUAB123456"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Transporte</label>
                <input
                  value={form.transporte}
                  onChange={(e) => setForm({ ...form, transporte: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="Marítimo / Aéreo"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Proveedor</label>
                <input
                  value={form.proveedor}
                  onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="Nombre del proveedor"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Factura</label>
                <input
                  value={form.factura}
                  onChange={(e) => setForm({ ...form, factura: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="F-001-2026"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">
                  Valor de garantía (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.valor_garantia}
                  onChange={(e) => setForm({ ...form, valor_garantia: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="4291.71"
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
    </div>
  );
}
