"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { ConfirmModal, Toast } from "@/components/Feedback";

export const dynamic = "force-dynamic";

type EtqCliente = {
  id: string;
  nombre: string;
  ruc_ci: string | null;
  direccion: string | null;
  telefono: string | null;
  contacto: string | null;
  notas: string | null;
  activo: boolean;
};

export default function ClientesEtiquetadoPage() {
  const supabase = createClient();

  const [clientes, setClientes] = useState<EtqCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<string | null>(null);

  const [formId, setFormId] = useState<string | undefined>();
  const [nombre, setNombre] = useState("");
  const [rucCi, setRucCi] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [contacto, setContacto] = useState("");
  const [notas, setNotas] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("etq_clientes")
      .select("*")
      .order("nombre");
    if (error) {
      setErrorMsg(
        error.message.includes("does not exist") || error.message.includes("relation")
          ? "Falta crear las tablas. ¿Corriste etiquetado_schema.sql en Supabase?"
          : error.message
      );
    } else {
      setClientes((data as EtqCliente[]) ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function limpiar() {
    setFormId(undefined);
    setNombre("");
    setRucCi("");
    setDireccion("");
    setTelefono("");
    setContacto("");
    setNotas("");
    setErrorMsg(null);
  }

  function abrirNuevo() {
    limpiar();
    setShowForm(true);
  }

  function abrirEditar(c: EtqCliente) {
    limpiar();
    setFormId(c.id);
    setNombre(c.nombre);
    setRucCi(c.ruc_ci ?? "");
    setDireccion(c.direccion ?? "");
    setTelefono(c.telefono ?? "");
    setContacto(c.contacto ?? "");
    setNotas(c.notas ?? "");
    setShowForm(true);
  }

  async function guardar() {
    if (!nombre.trim()) {
      setErrorMsg("El nombre del cliente es obligatorio.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);

    const payload = {
      nombre: nombre.trim(),
      ruc_ci: rucCi.trim() || null,
      direccion: direccion.trim() || null,
      telefono: telefono.trim() || null,
      contacto: contacto.trim() || null,
      notas: notas.trim() || null,
    };

    const { error } = formId
      ? await supabase.from("etq_clientes").update(payload).eq("id", formId)
      : await supabase.from("etq_clientes").insert(payload);

    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setShowForm(false);
    setToast(formId ? "Cliente actualizado correctamente." : "Cliente creado exitosamente.");
    cargar();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const { error } = await supabase.from("etq_clientes").delete().eq("id", aEliminar);
    setAEliminar(null);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setToast("Cliente eliminado correctamente.");
    cargar();
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/etiquetado/clientes" />

      <main className="flex-1 min-w-0">
        <Topbar />

        <div className="px-6.5 pt-5.5 pb-10">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Clientes de etiquetado</h1>
              <p className="text-[12.5px] text-text-faint">
                {clientes.length} cliente{clientes.length !== 1 ? "s" : ""} registrado
                {clientes.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={abrirNuevo}
              className="btn-primary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg"
            >
              <Plus size={15} /> Nuevo cliente
            </button>
          </div>

          {errorMsg && !showForm && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <p className="text-[13px] text-text-faint">Cargando…</p>
          ) : clientes.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-[13px] text-text-faint">
                No hay clientes de etiquetado todavía. Crea el primero con el botón de arriba.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="grid grid-cols-[1fr_140px_1fr_130px_110px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                <span>Cliente</span>
                <span>RUC / CI</span>
                <span>Dirección (dónde se etiqueta)</span>
                <span>Contacto</span>
                <span className="text-right">Acciones</span>
              </div>
              {clientes.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_140px_1fr_130px_110px] gap-3 px-5 py-3 items-center border-b border-border last:border-b-0 text-[12.5px]"
                >
                  <span className="font-medium truncate">{c.nombre}</span>
                  <span className="text-text-dim">{c.ruc_ci ?? "—"}</span>
                  <span className="text-text-dim truncate">{c.direccion ?? "—"}</span>
                  <span className="text-text-dim truncate">{c.contacto ?? c.telefono ?? "—"}</span>
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => abrirEditar(c)} className="text-text-faint hover:text-text" title="Editar">
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setAEliminar(c.id)}
                      className="text-text-faint hover:text-red-300"
                      title="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
            <div className="card w-full max-w-[620px] my-6 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[16px] font-semibold">
                  {formId ? "Editar cliente" : "Nuevo cliente de etiquetado"}
                </h2>
                <button onClick={() => setShowForm(false)} className="text-text-faint hover:text-text">
                  <X size={18} />
                </button>
              </div>

              {errorMsg && (
                <div className="mb-4 px-4 py-2.5 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="col-span-2">
                  <label className="text-[11.5px] text-text-faint block mb-1">Nombre del cliente *</label>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Maginecsa"
                    className="w-full card px-3 py-2 text-[13px] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] text-text-faint block mb-1">RUC / CI</label>
                  <input
                    value={rucCi}
                    onChange={(e) => setRucCi(e.target.value)}
                    className="w-full card px-3 py-2 text-[13px] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] text-text-faint block mb-1">Teléfono</label>
                  <input
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full card px-3 py-2 text-[13px] outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11.5px] text-text-faint block mb-1">
                    Dirección (dónde se etiqueta la carga)
                  </label>
                  <input
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Bodega del cliente"
                    className="w-full card px-3 py-2 text-[13px] outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11.5px] text-text-faint block mb-1">Persona de contacto</label>
                  <input
                    value={contacto}
                    onChange={(e) => setContacto(e.target.value)}
                    className="w-full card px-3 py-2 text-[13px] outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11.5px] text-text-faint block mb-1">Notas</label>
                  <textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    rows={2}
                    className="w-full card px-3 py-2 text-[13px] outline-none resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowForm(false)}
                  className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={saving}
                  className="btn-primary text-[13px] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {saving ? "Guardando…" : formId ? "Guardar cambios" : "Crear cliente"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <ConfirmModal
        abierto={aEliminar !== null}
        titulo="¿Eliminar cliente de etiquetado?"
        mensaje="Esta acción no se puede deshacer."
        onConfirmar={confirmarEliminar}
        onCancelar={() => setAEliminar(null)}
      />
      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
