import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Single authenticated entry point for the AMCMS dashboard. The operation registry on the
 * server (src/server/rpc/registry.server.ts) enforces staff status, MFA, and per-operation
 * permissions. Nothing here is trusted from the client except the op name and input payload.
 */
export const adminRpc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ op: z.string().min(1).max(64), input: z.unknown() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { runOp } = await import("@/server/rpc/dispatch.server");
    return (await runOp(data.op, data.input, {
      userId: context.userId,
      claims: context.claims,
    })) as any;
  });
