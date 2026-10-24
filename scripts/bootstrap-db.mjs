import { execSync } from "node:child_process";

if (process.env.BOOTSTRAP_DB !== "1") {
  console.log("[bootstrap-db] skipped (set BOOTSTRAP_DB=1 to create schema and seed)");
  process.exit(0);
}

const keys = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "PRISMA_DATABASE_URL",
];

const schemeOf = (value) => {
  if (!value) return "missing";
  const match = /^([a-z+]+):\/\//i.exec(value);
  return match ? match[1] : "no-protocol";
};

const report = {};
for (const key of keys) report[key] = schemeOf(process.env[key]);
console.log("[bootstrap-db] url protocols:", JSON.stringify(report));

const directKey = keys.find((key) =>
  /^postgres(ql)?:\/\//i.test(process.env[key] ?? ""),
);

if (!directKey) {
  console.error(
    "[bootstrap-db] no direct postgres:// or postgresql:// url available",
  );
  process.exit(1);
}

console.log(`[bootstrap-db] using ${directKey} for schema push and seed`);

const run = (command) => {
  console.log(`[bootstrap-db] ${command}`);
  execSync(command, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env[directKey] },
  });
};

run("npx --no-install prisma db push --skip-generate");
// The cached node_modules can still hold a client generated for the previous
// provider, so regenerate before anything imports PrismaClient.
run("npx --no-install prisma generate");
run("npx --no-install tsx prisma/seed.ts");
console.log("[bootstrap-db] done");
