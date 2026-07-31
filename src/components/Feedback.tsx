"use client";

import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Modal de confirmación (para acciones destructivas como eliminar)    */
/* ------------------------------------------------------------------ */
export function ConfirmModal({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = "Sí, eliminar",
  textoCancelar = "Cancelar",
  peligro = true,
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  peligro?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
      <div className="card w-full max-w-[380px] p-6 text-center">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
            peligro ? "bg-red/[0.14]" : "bg-accent/[0.16]"
          }`}
        >
          <AlertTriangle size={20} className={peligro ? "text-[#fca5a5]" : "text-[#c4b8ff]"} />
        </div>
        <h2 className="text-[17px] font-semibold mb-1.5">{titulo}</h2>
        <p className="text-[12.5px] text-text-faint mb-5">{mensaje}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            className="btn-secondary flex-1 text-[13px] font-semibold py-2.5 rounded-lg"
          >
            {textoCancelar}
          </button>
          <button
            onClick={onConfirmar}
            className={`flex-1 text-[13px] font-semibold py-2.5 rounded-lg text-white ${
              peligro ? "bg-red/90 hover:bg-red" : "btn-primary"
            }`}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toast de éxito (aviso flotante que se cierra solo)                  */
/* ------------------------------------------------------------------ */
export function Toast({
  mensaje,
  onCerrar,
}: {
  mensaje: string | null;
  onCerrar: () => void;
}) {
  useEffect(() => {
    if (mensaje) {
      const t = setTimeout(onCerrar, 3200);
      return () => clearTimeout(t);
    }
  }, [mensaje, onCerrar]);

  if (!mensaje) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[80] animate-in">
      <div className="flex items-center gap-3 card px-4 py-3 border border-green/25 bg-[#132a22] shadow-lg">
        <CheckCircle2 size={18} className="text-[#6ee7b7] shrink-0" />
        <span className="text-[13px] text-text pr-2">{mensaje}</span>
        <button onClick={onCerrar} className="text-text-faint hover:text-text" aria-label="Cerrar">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
