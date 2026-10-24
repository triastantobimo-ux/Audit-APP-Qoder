import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const title = process.argv[2] ?? "Temuan uji API E05";

const findings = await prisma.finding.findMany({
  where: { title },
  select: { id: true },
});

for (const finding of findings) {
  await prisma.findingUpdate.deleteMany({ where: { findingId: finding.id } });
  await prisma.evidenceFile.updateMany({
    where: { findingId: finding.id },
    data: { findingId: null },
  });
}

await prisma.finding.deleteMany({ where: { title } });
await prisma.auditEvent.deleteMany({
  where: { objectType: "finding", objectId: { in: findings.map((f) => f.id) } },
});

console.log(`cleaned ${findings.length} probe finding(s)`);
await prisma.$disconnect();
