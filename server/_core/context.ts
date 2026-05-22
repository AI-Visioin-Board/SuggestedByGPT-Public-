import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  delegateClientId?: number;       // set when user is acting as a delegate
  delegateClientName?: string;     // business name for UI banner
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let delegateClientId: number | undefined;
  let delegateClientName: string | undefined;

  try {
    const result = await sdk.authenticateRequestWithDelegation(opts.req);
    user = result.user;
    delegateClientId = result.delegateClientId;
    delegateClientName = result.delegateClientName;
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    delegateClientId,
    delegateClientName,
  };
}
