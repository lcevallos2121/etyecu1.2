import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Se crea perezosamente, al primer uso dentro de una petición real — nunca
// al importar el módulo. Next.js evalúa el módulo de cada API route durante
// "Collecting page data" en el build, así que crear el cliente a nivel de
// módulo hacía que el build entero fallara si SUPABASE_SERVICE_ROLE_KEY no
// estaba disponible en ese paso, aunque nadie hubiera hecho ninguna petición.
let cliente: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return cliente;
}
