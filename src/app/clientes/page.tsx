"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Pencil, Trash2, X } from "lucide-react";

export const dynamic = "force-dynamic";


type Cliente = {
  id: string;
  nombre: string;
  ruc_ci: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  creado_en: string;
};

type FormState = {
  id?: string;
  nombre: string;
  ruc_ci: string;
  telefono: string;
  correo: string;
  direccion: string;
};

const emptyForm: FormState = { nombre: "", ruc_ci: "", telefono: "", correo: "", direccion: "" };

export default function ClientesPage() {
  const supabase = createClient();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const cargarClientes = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .order("creado_en", { ascending: false });

    if (error) {
      setErrorMsg(
        error.message.includes("permission")
          ? "Sin permisos para leer clientes. Revisa que la política temporal de RLS esté creada en Supabase."
          : error.message
      );
    } else {
      setClientes(data ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarClientes();
  }, [cargarClientes]);

  function abrirNuevo() {
    setForm(emptyForm);
    setShowForm(true);
  }

  function abrirEditar(c: Cliente) {
    setForm({
      id: c.id,
      nombre: c.nombre,
      ruc_ci: c.ruc_ci,
      telefono: c.telefono ?? "",
      correo: c.correo ?? "",
      direccion: c.direccion ?? "",
    });
    setShowForm(true);
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.ruc_ci.trim()) {
      setErrorMsg("Nombre y RUC/CI son obligatorios.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);

    const payload = {
      nombre: form.nombre.trim(),
      ruc_ci: form.ruc_ci.trim(),
      telefono: form.telefono.trim() || null,
      correo: form.correo.trim() || null,
      direccion: form.direccion.trim() || null,
    };

    const { error } = form.id
      ? await supabase.from("clientes").update(payload).eq("id", form.id)
      : await supabase.from("clientes").insert(payload);

    setSaving(false);

    if (error) {
      setErrorMsg(
        error.message.includes("duplicate")
          ? "Ya existe un cliente con ese RUC/CI."
          : error.message
      );
      return;
    }

    setShowForm(false);
    cargarClientes();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este cliente? Esta acción no se puede deshacer.")) return;
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    cargarClientes();
  }

  const clientesFiltrados = clientes.filter(
    (c) =>
      c.nombre.toLowerCase().includes(search.toLowerCase()) ||
      c.ruc_ci.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/clientes" />

      <main className="flex-1 min-w-0">
        <Topbar userName="Abigail Cobos" userRole="Gerencia General" />

        <div className="px-6.5 pt-5.5 pb-10">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Clientes</h1>
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

          <input
            placeholder="Buscar por nombre o RUC/CI…"
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
            <div className="grid grid-cols-[2fr_1.3fr_1.3fr_1.6fr_90px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
              <span>Nombre</span>
              <span>RUC / CI</span>
              <span>Teléfono</span>
              <span>Correo</span>
              <span></span>
            </div>

            {loading ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">Cargando clientes…</p>
            ) : clientesFiltrados.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">
                No hay clientes {search ? "que coincidan con la búsqueda" : "registrados todavía"}.
              </p>
            ) : (
              clientesFiltrados.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[2fr_1.3fr_1.3fr_1.6fr_90px] gap-3 px-5 py-3.5 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02]"
                >
                  <span className="text-[13px] font-medium">{c.nombre}</span>
                  <span className="text-[12.5px] text-text-dim">{c.ruc_ci}</span>
                  <span className="text-[12.5px] text-text-dim">{c.telefono || "—"}</span>
                  <span className="text-[12.5px] text-text-dim truncate">{c.correo || "—"}</span>
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
          <div className="card w-full max-w-[440px] p-6 relative">
            <button
              onClick={() => setShowForm(false)}
              className="absolute top-4 right-4 text-text-faint hover:text-text"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <h2 className="text-[17px] font-semibold mb-4">
              {form.id ? "Editar cliente" : "Nuevo cliente"}
            </h2>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Nombre *</label>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="Nexus International Holding"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">RUC / CI *</label>
                <input
                  value={form.ruc_ci}
                  onChange={(e) => setForm({ ...form, ruc_ci: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="1792345678001"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Teléfono</label>
                <input
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="+593 99 123 4567"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Correo</label>
                <input
                  value={form.correo}
                  onChange={(e) => setForm({ ...form, correo: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="contacto@cliente.com"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Dirección</label>
                <input
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2"
                  placeholder="Av. Principal 123, Guayaquil"
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
