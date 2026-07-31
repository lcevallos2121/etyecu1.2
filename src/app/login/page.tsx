"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError("Correo o contraseña incorrectos.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[360px]">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center font-bold text-base">
            E
          </div>
          <div className="leading-tight">
            <p className="text-[16px] font-semibold">Etyecu DAP</p>
            <p className="text-[11.5px] text-text-faint">Depósito aduanero</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="card p-6 flex flex-col gap-4">
          <div>
            <label className="text-[11.5px] text-text-faint block mb-1">Correo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full card px-3 py-2.5 text-[13.5px] outline-none focus:border-border-2"
              placeholder="nombre@etyecu.ec"
            />
          </div>
          <div>
            <label className="text-[11.5px] text-text-faint block mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full card px-3 py-2.5 text-[13.5px] outline-none focus:border-border-2"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary text-[13.5px] font-semibold py-2.5 rounded-lg disabled:opacity-60"
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <p className="text-[11.5px] text-text-faint text-center mt-5">
          ¿No tienes cuenta? Pídele al administrador que te cree un usuario.
        </p>
      </div>
    </div>
  );
}
