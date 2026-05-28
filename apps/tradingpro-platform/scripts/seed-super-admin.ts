/**
 * File: scripts/seed-super-admin.ts
 * Module: scripts
 * Purpose: Idempotently create or update the tradingpro-platform super admin user.
 * Author: StockTrade
 * Last-updated: 2026-03-28
 * Notes:
 * - Re-runnable script; it safely updates existing records instead of duplicating users.
 * - Entry point is `main()`, then read `upsertSuperAdminUser()` for merge/update logic.
 * - Legacy clientId `Tradebazar` is resolved to the same row when migrating to `TradeBazaar`.
 */

import { PrismaClient, Role, User, KycStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import pino from "pino";

const prisma = new PrismaClient();

const logger = pino({
  name: "seed-super-admin",
  level: process.env.LOG_LEVEL ?? "info",
});

const SUPER_ADMIN_CONFIG = {
  email: "tradebazar@tradebazar.live",
  password: process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD ?? "Jkv@2026",
  /** Login identifier (clientId) for credentials `identifier` sign-in. */
  clientId: "TradeBazaar",
  name: "TradeBazaar",
  mpin: process.env.SUPER_ADMIN_BOOTSTRAP_MPIN ?? "1234",
} as const;

/** Prior seed clientId; kept so reruns merge into the same user instead of creating a duplicate. */
const SUPER_ADMIN_LEGACY_CLIENT_IDS = ["Tradebazar"] as const;

const SUPER_ADMIN_KYC_PLACEHOLDERS = {
  aadhaarNumber: "999999999999",
  panNumber: "ABCDE9999A",
  bankProofUrl: "seed://super-admin-bank-proof",
} as const;

interface SuperAdminUpsertResult {
  result: "created" | "updated";
  userId: string;
}

interface ExistingKycSnapshot {
  aadhaarNumber: string;
  panNumber: string;
  bankProofUrl: string;
  bankProofKey: string | null;
}

async function findExistingSuperAdminCandidates(): Promise<{
  userByEmail: User | null;
  userByClientId: User | null;
  userByLegacyClientId: User | null;
}> {
  const legacyIds = SUPER_ADMIN_LEGACY_CLIENT_IDS.filter((id) => id !== SUPER_ADMIN_CONFIG.clientId);

  const [userByEmail, userByClientId, ...legacyRowsMaybe] = await Promise.all([
    prisma.user.findUnique({ where: { email: SUPER_ADMIN_CONFIG.email } }),
    prisma.user.findUnique({ where: { clientId: SUPER_ADMIN_CONFIG.clientId } }),
    ...legacyIds.map((clientId) => prisma.user.findUnique({ where: { clientId } })),
  ]);

  const legacyRows = legacyRowsMaybe.filter(Boolean) as User[];
  const legacyDistinctIds = new Set(legacyRows.map((u) => u.id));
  if (legacyDistinctIds.size > 1) {
    throw new Error(
      [
        "Multiple distinct users match legacy super-admin client ids.",
        `Legacy ids inspected: ${legacyIds.join(", ")}.`,
        "Please resolve this manually before running the script again.",
      ].join(" "),
    );
  }

  const userByLegacyClientId = legacyRows[0] ?? null;

  return { userByEmail, userByClientId, userByLegacyClientId };
}

export function resolveTargetUserId(
  userByEmail: User | null,
  userByClientId: User | null,
  userByLegacyClientId: User | null = null,
): string | null {
  const candidates = [userByEmail, userByClientId, userByLegacyClientId].filter(Boolean) as User[];
  if (candidates.length === 0) {
    return null;
  }

  const distinctIds = new Set(candidates.map((u) => u.id));
  if (distinctIds.size > 1) {
    const detail = candidates
      .map((u) => {
        const parts: string[] = [`userId=${u.id}`];
        if (u.email) parts.push(`email=${u.email}`);
        if (u.clientId) parts.push(`clientId=${u.clientId}`);
        return parts.join(" ");
      })
      .join("; ");
    throw new Error(
      [
        "Conflicting records found for super-admin identifiers.",
        `Expected targets (${SUPER_ADMIN_CONFIG.email}, ${SUPER_ADMIN_CONFIG.clientId}, legacy ${SUPER_ADMIN_LEGACY_CLIENT_IDS.join(", ")}); got: ${detail}.`,
        "Please resolve this manually before running the script again.",
      ].join(" "),
    );
  }

  return candidates[0].id;
}

async function upsertSuperAdminUser(): Promise<SuperAdminUpsertResult> {
  logger.info("Checking existing super-admin user candidates...");

  const { userByEmail, userByClientId, userByLegacyClientId } =
    await findExistingSuperAdminCandidates();
  const resolvedUserId = resolveTargetUserId(userByEmail, userByClientId, userByLegacyClientId);
  const [passwordHash, mpinHash] = await Promise.all([
    bcrypt.hash(SUPER_ADMIN_CONFIG.password, 10),
    bcrypt.hash(SUPER_ADMIN_CONFIG.mpin, 10),
  ]);

  if (!resolvedUserId) {
    const createdUser = await prisma.user.create({
      data: {
        name: SUPER_ADMIN_CONFIG.name,
        email: SUPER_ADMIN_CONFIG.email,
        clientId: SUPER_ADMIN_CONFIG.clientId,
        password: passwordHash,
        mPin: mpinHash,
        role: Role.SUPER_ADMIN,
        emailVerified: new Date(),
        phoneVerified: new Date(),
        requireOtpOnLogin: false,
        isActive: true,
      },
    });

    logger.info(
      {
        userId: createdUser.id,
        email: SUPER_ADMIN_CONFIG.email,
        clientId: SUPER_ADMIN_CONFIG.clientId,
        role: Role.SUPER_ADMIN,
        requireOtpOnLogin: false,
      },
      "Super-admin user created successfully.",
    );
    return { result: "created", userId: createdUser.id };
  }

  await prisma.user.update({
    where: { id: resolvedUserId },
    data: {
      name: SUPER_ADMIN_CONFIG.name,
      email: SUPER_ADMIN_CONFIG.email,
      clientId: SUPER_ADMIN_CONFIG.clientId,
      password: passwordHash,
      mPin: mpinHash,
      role: Role.SUPER_ADMIN,
      emailVerified: new Date(),
      phoneVerified: new Date(),
      requireOtpOnLogin: false,
      isActive: true,
    },
  });

  logger.info(
    {
      userId: resolvedUserId,
      email: SUPER_ADMIN_CONFIG.email,
      clientId: SUPER_ADMIN_CONFIG.clientId,
      role: Role.SUPER_ADMIN,
      requireOtpOnLogin: false,
    },
    "Super-admin user already existed and was updated.",
  );
  return { result: "updated", userId: resolvedUserId };
}

export function resolveKycFieldOrPlaceholder(value: string | null | undefined, placeholder: string): string {
  const normalized = value?.trim();
  return normalized ? normalized : placeholder;
}

export function buildSuperAdminKycCreateData(userId: string, approvedAt: Date) {
  return {
    userId,
    aadhaarNumber: SUPER_ADMIN_KYC_PLACEHOLDERS.aadhaarNumber,
    panNumber: SUPER_ADMIN_KYC_PLACEHOLDERS.panNumber,
    bankProofUrl: SUPER_ADMIN_KYC_PLACEHOLDERS.bankProofUrl,
    bankProofKey: null,
    status: KycStatus.APPROVED,
    approvedAt,
  };
}

export function buildSuperAdminKycUpdateData(existingKyc: ExistingKycSnapshot, approvedAt: Date) {
  return {
    aadhaarNumber: resolveKycFieldOrPlaceholder(
      existingKyc.aadhaarNumber,
      SUPER_ADMIN_KYC_PLACEHOLDERS.aadhaarNumber,
    ),
    panNumber: resolveKycFieldOrPlaceholder(
      existingKyc.panNumber,
      SUPER_ADMIN_KYC_PLACEHOLDERS.panNumber,
    ),
    bankProofUrl: resolveKycFieldOrPlaceholder(
      existingKyc.bankProofUrl,
      SUPER_ADMIN_KYC_PLACEHOLDERS.bankProofUrl,
    ),
    bankProofKey: existingKyc.bankProofKey ?? null,
    status: KycStatus.APPROVED,
    approvedAt,
  };
}

async function upsertSuperAdminKyc(userId: string): Promise<"created" | "updated"> {
  const existingKyc = await prisma.kYC.findUnique({
    where: { userId },
  });
  const approvedAt = new Date();

  if (!existingKyc) {
    await prisma.kYC.create({
      data: buildSuperAdminKycCreateData(userId, approvedAt),
    });

    logger.info({ userId }, "Super-admin KYC record created and approved.");
    return "created";
  }

  await prisma.kYC.update({
    where: { userId },
    data: buildSuperAdminKycUpdateData(existingKyc, approvedAt),
  });

  logger.info({ userId }, "Super-admin KYC record updated and approved.");
  return "updated";
}

async function main(): Promise<void> {
  logger.info("Starting tradingpro-platform super-admin seed script...");
  const userSeedResult = await upsertSuperAdminUser();
  const kycSeedResult = await upsertSuperAdminKyc(userSeedResult.userId);

  logger.info(
    {
      userResult: userSeedResult.result,
      kycResult: kycSeedResult,
      userId: userSeedResult.userId,
      loginEmail: SUPER_ADMIN_CONFIG.email,
      loginClientId: SUPER_ADMIN_CONFIG.clientId,
    },
    "Super-admin seed script completed.",
  );
}

if (process.env.NODE_ENV !== "test") {
  main()
    .catch((error: unknown) => {
      logger.error({ error }, "Super-admin seed script failed.");
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
