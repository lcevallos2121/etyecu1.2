"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Tag, Building2, Package, ArrowRight, Search, ChevronLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

type EtqOrden = {
  id: string;
  numero_etq: string;
  origen: "etyecu" | "externo";
  cliente_nombre: string | null;
  tipo_producto: string | null;
  estado: "abierta" | "en_proceso" | "cerrada";
  fecha: string;
};

const estadoLabel: Record<string, { texto: string; clase: string }> = {
  abierta: { texto: "Abierta", clase: "bg-accent/[0.18] text-[#c4b8ff]" },
  en_proceso: { texto: "En proceso", clase: "bg-amber/15 text-[#fbbf24]" },
  cerrada: { texto: "Cerrada", clase: "bg-green/15 text-[#6ee7b7]" },
};

export default function EtiquetadoPage() {
  const supabase = createClient();

  const [ordenes, setOrdenes] = useState<EtqOrden[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const PAGINA_TAMANO = 20;

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("etq_ordenes")
      .select("id, numero_etq, origen, cliente_nombre, tipo_producto, estado, fecha")
      .order("numero_etq", { ascending: true });
    if (error) {
      setErrorMsg(
        error.message.includes("does not exist") || error.message.includes("relation")
          ? "Falta crear las tablas. ¿Corriste etiquetado_schema.sql en Supabase?"
          : error.message
      );
    } else {
      setOrdenes((data as EtqOrden[]) ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Extrae el último número de "ETQ-2026-01-009" para poder ordenar de
  // forma numérica real (009 antes que 010, y no como texto, donde "10"
  // quedaría antes que "9").
  function ultimoNumero(numeroEtq: string): number {
    const match = numeroEtq.match(/(\d+)(?!.*\d)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  const ordenesOrdenadas = useMemo(() => {
    return [...ordenes].sort((a, b) => ultimoNumero(a.numero_etq) - ultimoNumero(b.numero_etq));
  }, [ordenes]);

  const ordenesFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ordenesOrdenadas;
    return ordenesOrdenadas.filter(
      (o) =>
        o.numero_etq.toLowerCase().includes(q) ||
        (o.cliente_nombre ?? "").toLowerCase().includes(q)
    );
  }, [ordenesOrdenadas, busqueda]);

  // Vuelve a la página 1 cada vez que cambia la búsqueda, para no quedar
  // "atrapado" en una página que ya no tiene resultados.
  useEffect(() => {
    setPagina(1);
  }, [busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(ordenesFiltradas.length / PAGINA_TAMANO));
  const ordenesPagina = ordenesFiltradas.slice(
    (pagina - 1) * PAGINA_TAMANO,
    pagina * PAGINA_TAMANO
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/etiquetado" />

      <main className="flex-1 min-w-0">
        <Topbar />

        <div className="px-6.5 pt-5.5 pb-10">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Etiquetado</h1>
              <p className="text-[12.5px] text-text-faint">
                {ordenes.length} orden{ordenes.length !== 1 ? "es" : ""} de etiquetado
              </p>
            </div>
            <Link
              href="/etiquetado/nuevo"
              className="btn-primary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg"
            >
              <Plus size={15} /> Nueva orden de etiquetado
            </Link>
          </div>

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          {!loading && ordenes.length > 0 && (
            <div className="relative mb-4 max-w-[420px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por número de etiquetado o cliente…"
                className="w-full card pl-9 pr-3 py-2 text-[12.5px] outline-none"
              />
            </div>
          )}

          {loading ? (
            <p className="text-[13px] text-text-faint">Cargando…</p>
          ) : ordenes.length === 0 ? (
            <div className="card p-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-accent/[0.15] flex items-center justify-center mx-auto mb-3">
                <Tag size={22} className="text-[#c4b8ff]" />
              </div>
              <p className="text-[14px] font-medium mb-1">Aún no hay órdenes de etiquetado</p>
              <p className="text-[12.5px] text-text-faint mb-4">
                Crea la primera eligiendo con quién vas a etiquetar.
              </p>
              <Link
                href="/etiquetado/nuevo"
                className="btn-primary inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg"
              >
                <Plus size={15} /> Nueva orden de etiquetado
              </Link>
            </div>
          ) : ordenesFiltradas.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-[13px] text-text-faint">
                Ningún código coincide con &quot;{busqueda}&quot;.
              </p>
            </div>
          ) : (
            <>
              <div className="card overflow-hidden">
                <div className="grid grid-cols-[130px_1fr_130px_120px_110px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                  <span>N° Etiquetado</span>
                  <span>Cliente</span>
                  <span>Producto</span>
                  <span>Estado</span>
                  <span className="text-right">Fecha</span>
                </div>
                {ordenesPagina.map((o) => {
                  const est = estadoLabel[o.estado] ?? estadoLabel.abierta;
                  return (
                    <Link
                      key={o.id}
                      href={`/etiquetado/${o.id}`}
                      className="grid grid-cols-[130px_1fr_130px_120px_110px] gap-3 px-5 py-3 items-center border-b border-border last:border-b-0 text-[12.5px] hover:bg-white/[0.02] transition-colors"
                    >
                      <span className="font-medium">{o.numero_etq}</span>
                      <span className="flex items-center gap-1.5 truncate">
                        {o.origen === "etyecu" ? (
                          <Package size={13} className="text-text-faint shrink-0" />
                        ) : (
                          <Building2 size={13} className="text-text-faint shrink-0" />
                        )}
                        <span className="truncate">{o.cliente_nombre ?? "—"}</span>
                      </span>
                      <span className="text-text-dim capitalize">{o.tipo_producto ?? "—"}</span>
                      <span>
                        <span className={`text-[10.5px] px-2 py-0.5 rounded-full ${est.clase}`}>
                          {est.texto}
                        </span>
                      </span>
                      <span className="text-text-dim text-right flex items-center justify-end gap-1">
                        {new Date(o.fecha).toLocaleDateString("es-EC")}
                        <ArrowRight size={13} className="text-text-faint" />
                      </span>
                    </Link>
                  );
                })}
              </div>

              {totalPaginas > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-[11.5px] text-text-faint">
                    Mostrando {(pagina - 1) * PAGINA_TAMANO + 1}–
                    {Math.min(pagina * PAGINA_TAMANO, ordenesFiltradas.length)} de{" "}
                    {ordenesFiltradas.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPagina((p) => Math.max(1, p - 1))}
                      disabled={pagina === 1}
                      className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.03]"
                    >
                      <ChevronLeft size={14} /> Anterior
                    </button>
                    <span className="text-[12px] text-text-dim px-2">
                      Página {pagina} de {totalPaginas}
                    </span>
                    <button
                      onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                      disabled={pagina === totalPaginas}
                      className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.03]"
                    >
                      Siguiente <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
