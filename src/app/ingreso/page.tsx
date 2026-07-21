"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Pencil, Trash2, X } from "lucide-react";

export const dynamic = "force-dynamic";

type CdaRef = { id: string; numero_orden: string; clientes: { nombre: string } | null };

type OrdenDap = {
  id: string;
  numero_dap: string;
  cda_id: string;
  cantidad_ingresada: number;
  cantidad_actual: number;
  regimen: string;
  creado_en: string;
  cdas: CdaRef | null;
};

type FormState = {
  id?: string;
  numero_dap: string;
  cda_id: string;
  cantidad_ingresada: string;
  regimen: "10" | "70";
};

const emptyForm: FormState = { numero_dap: "", cda_id: "", cantidad_ingresada: "", regimen: "70" };

export default function IngresoPage() {
  const supabase = createClient();

  const [ordenes, setOrdenes] = useState<OrdenDap[]>([]);
  const [cdas, setCdas] = useState<CdaRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const [{ data: ordenData, error: ordenError }, { data: cdaData, error: cdaError }] =
      await Promise.all([
        supabase
          .from("ordenes_dap")
          .select("*, cdas(id, numero_orden, clientes(nombre))")
          .order("creado_en", { ascending: false }),
        supabase
          .from("cdas")
          .select("id, numero_orden, clientes(nombre)")
          .order("numero_orden"),
      ]);

    if (ordenError) {
      setErrorMsg(
        ordenError.message.includes("permission")
          ? "Sin permisos para leer órdenes DAP. Falta crear la política temporal de RLS para ordenes_dap."
          : ordenError.message
      );
    } else {
      setOrdenes((ordenData as unknown as OrdenDap[]) ?? []);
    }

    if (!cdaError) setCdas((cdaData as unknown as CdaRef[]) ?? []);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  function abrirNuevo() {
    setForm(emptyForm);
    setShowForm(true);
  }

  function abrirEditar(o: OrdenDap) {
    setForm({
      id: o.id,
      numero_dap: o.numero_dap,
      cda_id: o.cda_id,
      cantidad_ingresada: o.cantidad_ingresada.toString(),
      regimen: o.regimen as "10" | "70",
    });
    setShowForm(true);
  }

  async function guardar() {
    if (!form.numero_dap.trim() || !form.cda_id || !form.cantidad_ingresada) {
      setErrorMsg("Número de DAP, CDA y cantidad son obligatorios.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);

    const cantidad = Number(form.cantidad_ingresada);

    if (form.id) {
      // Al editar, no tocamos cantidad_actual: eso lo maneja el módulo de Egreso.
      const { error } = await supabase
        .from("ordenes_dap")
        .update({
          numero_dap: form.numero_dap.trim(),
          cda_id: form.cda_id,
          cantidad_ingresada: cantidad,
          regimen: form.regimen,
        })
        .eq("id", form.id);
      setSaving(false);
      if (error) {
        setErrorMsg(error.message.includes("duplicate") ? "Ya existe una orden con ese número de DAP." : error.message);
        return;
      }
    } else {
      // Al crear, la cantidad actual arranca igual a la ingresada.
      const { error } = await supabase.from("ordenes_dap").insert({
        numero_dap: form.numero_dap.trim(),
        cda_id: form.cda_id,
        cantidad_ingresada: cantidad,
        cantidad_actual: cantidad,
        regimen: form.regimen,
      });
      setSaving(false);
      if (error) {
        setErrorMsg(error.message.includes("duplicate") ? "Ya existe una orden con ese número de DAP." : error.message);
        return;
      }
    }

    setShowForm(false);
    cargarDatos();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta orden DAP? Esta acción no se puede deshacer.")) return;
    const { error } = await supabase.from("ordenes_dap").delete().eq("id", id);
    if (error) {
      setErrorMsg(
        error.message.includes("foreign key") || error.message.includes("violates")
          ? "No se puede eliminar: esta orden tiene egresos o ubicaciones asociadas."
          : error.message
      );
      return;
    }
    cargarDatos();
  }

  const ordenesFiltradas = ordenes.filter(
    (o) =>
      o.numero_dap.toLowerCase().includes(search.toLowerCase()) ||
      o.cdas?.clientes?.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/ingreso" />

      <main className="flex-1 min-w-0">
        <Topbar userName="Abigail Cobos" userRole="Gerencia General" />

        <div className="px-6.5 pt-5.5 pb-10">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Ingreso de carga</h1>
              <p className="text-[12.5px] text-text-faint">
                {ordenes.length} orden{ordenes.length !== 1 ? "es" : ""} DAP registrada
                {ordenes.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={abrirNuevo}
              disabled={cdas.length === 0}
              className="btn-primary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
              title={cdas.length === 0 ? "Primero registra un CDA" : undefined}
            >
              <Plus size={15} /> Nuevo ingreso
            </button>
          </div>

          {cdas.length === 0 && !loading && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber/10 border border-amber/20 text-[12.5px] text-[#fbbf24]">
              Todavía no hay CDA registrados. Crea uno primero en la pantalla de CDA.
            </div>
          )}

          <input
            placeholder="Buscar por número de DAP o cliente…"
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
            <div className="grid grid-cols-[1.2fr_1.6fr_1fr_1.2fr_1.2fr_90px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
              <span>N° DAP</span>
              <span>Cliente / CDA</span>
              <span>Régimen</span>
              <span>Ingresado</span>
              <span>Actual</span>
              <span></span>
            </div>

            {loading ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">Cargando órdenes…</p>
            ) : ordenesFiltradas.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">
                No hay órdenes {search ? "que coincidan con la búsqueda" : "registradas todavía"}.
              </p>
            ) : (
              ordenesFiltradas.map((o) => (
                <div
                  key={o.id}
                  className="grid grid-cols-[1.2fr_1.6fr_1fr_1.2fr_1.2fr_90px] gap-3 px-5 py-3.5 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02]"
                >
                  <span className="text-[13px] font-medium">{o.numero_dap}</span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-text-dim truncate">
                      {o.cdas?.clientes?.nombre ?? "—"}
                    </p>
                    <p className="text-[11px] text-text-faint truncate">
                      CDA {o.cdas?.numero_orden ?? "—"}
                    </p>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/[0.18] text-[#c4b8ff] w-fit">
                    Régimen {o.regimen}
                  </span>
                  <span className="text-[12.5px] text-text-dim">
                    {o.cantidad_ingresada.toLocaleString("es-EC")}
                  </span>
                  <span
                    className={`text-[12.5px] font-medium ${
                      o.cantidad_actual < o.cantidad_ingresada ? "text-amber" : "text-text"
                    }`}
                  >
                    {o.cantidad_actual.toLocaleString("es-EC")}
                  </span>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => abrirEditar(o)}
                      className="w-7 h-7 rounded-lg card flex items-center justify-center text-text-dim hover:text-text"
                      aria-label="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => eliminar(o.id)}
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
          <div className="card w-full max-w-[440px] p-6 relative">
            <button
              onClick={() => setShowForm(false)}
              className="absolute top-4 right-4 text-text-faint hover:text-text"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <h2 className="text-[17px] font-semibold mb-4">
              {form.id ? "Editar ingreso" : "Nuevo ingreso de carga"}
            </h2>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Número de DAP *</label>
                <input
                  value={form.numero_dap}
                  onChange={(e) => setForm({ ...form, numero_dap: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="2026-089"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">CDA *</label>
                <select
                  value={form.cda_id}
                  onChange={(e) => setForm({ ...form, cda_id: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                >
                  <option value="">Selecciona un CDA…</option>
                  {cdas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero_orden} · {c.clientes?.nombre ?? "sin cliente"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Régimen *</label>
                <div className="flex gap-2">
                  {(["70", "10"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setForm({ ...form, regimen: r })}
                      className={`flex-1 text-[12.5px] font-medium py-2 rounded-lg border ${
                        form.regimen === r
                          ? "bg-accent/[0.18] text-[#c4b8ff] border-accent-2/30"
                          : "border-border-2 text-text-dim"
                      }`}
                    >
                      Régimen {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">
                  Cantidad ingresada *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.cantidad_ingresada}
                  onChange={(e) => setForm({ ...form, cantidad_ingresada: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="1240"
                />
                {form.id && (
                  <p className="text-[11px] text-text-faint mt-1">
                    Editar esto no cambia la cantidad actual en depósito, solo el total declarado.
                  </p>
                )}
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
