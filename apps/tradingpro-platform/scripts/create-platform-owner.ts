/**
 * File: scripts/create-platform-owner.ts
 * Module: scripts
 * Purpose: Interactively create the platform owner (SUPER_ADMIN) user.
 *          Prompts for email and password via CLI, idempotent on rerun.
 * Usage:
 *   npx ts-node scripts/create-platform-owner.ts
 *   bun run scripts/create-platform-owner.ts
 *
 * Author: AmanVatsSharma
 * Last-updated: 2026-05-13
 */

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as readline from "readline";

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function getEmail(): Promise<string> {
  while (true) {
    const email = await ask("\n📧 Enter admin email: ");
    if (!email) {
      console.log("❌ Email is required. Try again.");
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.log("❌ Invalid email format. Try again.");
      continue;
    }
    return email;
  }
}

async function getPassword(): Promise<string> {
  while (true) {
    const password = await ask("🔑 Enter password: ");
    if (!password) {
      console.log("❌ Password is required. Try again.");
      continue;
    }
    if (password.length < 8) {
      console.log("❌ Password must be at least 8 characters. Try again.");
      continue;
    }
    const confirm = await ask("🔑 Confirm password: ");
    if (password !== confirm) {
      console.log("❌ Passwords do not match. Try again.");
      continue;
    }
    return password;
  }
}

async function getName(): Promise<string> {
  const name = await ask("\n👤 Enter admin name [Platform Owner]: ");
  return name || "Platform Owner";
}

async function upsertPlatformOwner(email: string, password: string, name: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 10);
  const mpinHash = await bcrypt.hash("0000", 4); // Default MPIN, owner should change it

  // Check for existing user by email
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Update existing user to SUPER_ADMIN
    await prisma.user.update({
      where: { email },
      data: {
        name,
        password: passwordHash,
        mPin: mpinHash,
        role: Role.SUPER_ADMIN,
        emailVerified: new Date(),
        phoneVerified: new Date(),
        requireOtpOnLogin: false,
        isActive: true,
      },
    });
    console.log(`\n✅ Existing user updated to SUPER_ADMIN: ${email}`);
  } else {
    // Create new SUPER_ADMIN
    await prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        mPin: mpinHash,
        role: Role.SUPER_ADMIN,
        emailVerified: new Date(),
        phoneVerified: new Date(),
        requireOtpOnLogin: false,
        isActive: true,
        clientId: email.split("@")[0].toUpperCase(),
      },
    });
    console.log(`\n✅ New SUPER_ADMIN created: ${email}`);
  }

  console.log("\n📋 Credentials for login:");
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Role:     SUPER_ADMIN`);
  console.log(`   MPIN:     0000 (default - change after login!)`);
}

async function main(): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🔐 Platform Owner Setup");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const email = await getEmail();
  const password = await getPassword();
  const name = await getName();

  await upsertPlatformOwner(email, password, name);

  rl.close();
  await prisma.$disconnect();

  console.log("\n✨ Platform owner ready!");
}

main().catch(async (error) => {
  console.error("\n❌ Error:", error);
  rl.close();
  await prisma.$disconnect();
  process.exit(1);
});