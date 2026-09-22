"use client";

import { useMemo, useState } from "react";

// Input con autocompletado contra un catálogo compartido (marca, composición,
// país...): sugiere lo que ya existe y, si lo que se escribió no está en la
// lista, ofrece agregarlo al catálogo sin bloquear el trabajo — queda
// disponible para la próxima vez que alguien lo necesite.
export function BuscadorCatalogo({
  valor,
  onChange,
  catalogo,
  onAgregarAlCatalogo,
  placeholder,
}: {
  valor: string;
  onChange: (v: string) => void;
  catalogo: string[];
  onAgregarAlCatalogo: (texto: string) => void;
  placeholder?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  const sugerencias = useMemo(() => {
    const q = valor.trim().toLowerCase();
    if (!q) return catalogo.slice(0, 8);
    return catalogo.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [catalogo, valor]);

  const coincideExacto = catalogo.some((c) => c.toLowerCase() === valor.trim().toLowerCase());

  return (
    <div className="relative">
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder={placeholder}
        className="w-full card px-3 py-2 text-[13px] outline-none"
      />
      {abierto && (
        <div className="absolute z-20 top-full mt-1 w-full max-h-[220px] overflow-y-auto card p-1 shadow-lg">
          {sugerencias.length === 0 && !valor.trim() ? (
            <p className="text-[11.5px] text-text-faint px-2 py-2">Escribe para buscar…</p>
          ) : (
            sugerencias.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={() => {
                  onChange(c);
                  setAbierto(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] hover:bg-white/[0.06]"
              >
                {c}
              </button>
            ))
          )}
          {valor.trim() && !coincideExacto && (
            <button
              type="button"
              onMouseDown={() => {
                onAgregarAlCatalogo(valor.trim());
                setAbierto(false);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-[#c4b8ff] hover:bg-accent/[0.1] border-t border-border mt-1 pt-2"
            >
              + Agregar &quot;{valor.trim()}&quot; al catálogo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
