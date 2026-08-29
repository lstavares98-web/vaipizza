// CLI-only super-admin creation — deliberately never exposed over HTTP, so
// there is zero attack surface for privilege escalation via the API (same
// principle as the legacy Yummix's scripts/createAdmin.js).
//
// Usage:
//   npm run create-admin -- --name "Jane Doe" --email jane@yummix.com --password "SomeStrongPass123"
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];
    if (key && value) out[key] = value;
  }
  return out;
}

async function main() {
  const { name, email, password } = parseArgs();
  if (!name || !email || !password) {
    console.error('Usage: npm run create-admin -- --name "Jane Doe" --email jane@yummix.com --password "SomeStrongPass123"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({ where: { email }, data: { role: Role.SUPER_ADMIN, passwordHash } });
    console.log(`Existing account ${email} promoted to SUPER_ADMIN.`);
  } else {
    await prisma.user.create({ data: { name, email, passwordHash, role: Role.SUPER_ADMIN } });
    console.log(`Super admin account created: ${email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
