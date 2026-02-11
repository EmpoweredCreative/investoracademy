import { PremiumPolicy } from "@prisma/client";
import { prisma } from "@/lib/db";

const SYSTEM_DEFAULT: PremiumPolicy = "CASHFLOW";

/**
 * Resolve the effective PremiumPolicy for a StrategyInstance.
 * Resolution order:
 *   1. StrategyInstance override
 *   2. Underlying policy
 *   3. Account default
 *   4. System default (CASHFLOW)
 */
export async function resolvePolicy(instanceId: string): Promise<PremiumPolicy> {
  const instance = await prisma.strategyInstance.findUniqueOrThrow({
    where: { id: instanceId },
    include: {
      underlying: true,
      account: true,
    },
  });

  // 1. Instance override
  if (instance.premiumPolicyOverride) {
    return instance.premiumPolicyOverride;
  }

  // 2. Underlying policy
  if (instance.underlying.premiumPolicy) {
    return instance.underlying.premiumPolicy;
  }

  // 3. Account default
  if (instance.account.defaultPolicy) {
    return instance.account.defaultPolicy;
  }

  // 4. System default
  return SYSTEM_DEFAULT;
}

/**
 * Resolve policy without DB lookup (from already-loaded data).
 */
export function resolvePolicySync(
  instanceOverride: PremiumPolicy | null,
  underlyingPolicy: PremiumPolicy | null,
  accountDefault: PremiumPolicy | null
): PremiumPolicy {
  return instanceOverride ?? underlyingPolicy ?? accountDefault ?? SYSTEM_DEFAULT;
}
