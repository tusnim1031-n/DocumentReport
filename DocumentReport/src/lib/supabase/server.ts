import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function createClient() {
  const jar = await cookies();

  // NEXT_PUBLIC_* values are compiled into Next.js only when present during
  // build. Cloudflare dashboard Runtime variables are available through the
  // OpenNext request context, so prefer those in the deployed Worker.
  let runtimeEnv: CloudflareEnv | undefined;
  try {
    runtimeEnv = (await getCloudflareContext({ async: true })).env;
  } catch {
    // next dev and Node-based tests may not have a Cloudflare context.
  }

  const url = runtimeEnv?.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = runtimeEnv?.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items: { name: string; value: string; options?: any }[]) => {
        try {
          items.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Server components cannot write cookies; route handlers can.
        }
      },
    },
  });
}
