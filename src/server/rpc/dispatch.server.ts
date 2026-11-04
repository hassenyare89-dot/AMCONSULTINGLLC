import { getRequest } from "@tanstack/react-start/server";
import { AppError, encodeError } from "@/lib/shared/errors";
import { assertStaff, loadStaff } from "../authz.server";
import { hashIp } from "../crypto.server";
import { clientIp, requestId } from "../http.server";
import { log } from "../logger.server";
import { enforceRateLimit } from "../ratelimit.server";
import { getOp } from "./registry.server";

/** Central dispatcher for all AMCMS server calls: authn → staff/MFA gate → rate limit → handler. */
export async function runOp(
  name: string,
  input: unknown,
  auth: { userId: string; claims: unknown },
) {
  const request = getRequest();
  const rid = requestId(request);
  const started = Date.now();
  try {
    const op = getOp(name);
    const claims = (auth.claims ?? {}) as Record<string, unknown>;
    const ctx = await loadStaff(
      auth.userId,
      claims,
      rid,
      request ? await hashIp(clientIp(request)) : null,
    );
    if (!op.allowWithoutRole) assertStaff(ctx, { allowWithoutMfa: op.allowWithoutMfa });
    else if (!ctx.active) throw new AppError("FORBIDDEN", "Your account has been deactivated.");
    await enforceRateLimit(`user:${ctx.userId}:rpc`, 600, 60);
    const result = await op.handler(ctx, input, { claims, request });
    log("info", "rpc", { op: name, rid, user: ctx.userId, ms: Date.now() - started });
    return result;
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code !== "VALIDATION" && err.code !== "CONFLICT")
        log("warn", "rpc rejected", { op: name, rid, code: err.code });
      throw new Error(encodeError(err));
    }
    if (err && typeof err === "object" && "issues" in err) {
      const issue = (err as { issues: { message: string; path: (string | number)[] }[] }).issues[0];
      throw new Error(
        encodeError(
          new AppError(
            "VALIDATION",
            issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input",
          ),
        ),
      );
    }
    log("error", "rpc failed", { op: name, rid, err });
    throw new Error(
      encodeError(new AppError("INTERNAL", `Something went wrong (ref ${rid.slice(0, 8)}).`)),
    );
  }
}
