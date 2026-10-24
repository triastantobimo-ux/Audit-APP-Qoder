import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { instantiateTemplate } from "../src/lib/engagement";
import { putEvidence, storageKeyFor } from "../src/lib/evidence-store";
import { sha256Hex } from "../src/lib/hash";
import { isPlanRole } from "../src/lib/plan";
import { topRiskDriver } from "../src/lib/universe-table";
import { instantiateWorkpaperTemplate } from "../src/lib/workpaper";
import {
  calculateInherentScore,
  calculateResidualScore,
  riskLevelFor,
} from "../src/lib/scoring";

const prisma = new PrismaClient();

const workspaceId = "ws_demo";
const riskModelId = "rm_default";
const cycleId = "cyc_2026";
const thresholds = { low: 0, medium: 1.5, high: 2.5, critical: 3.5 };
const levelThresholds = JSON.stringify(thresholds);

const factorDefinitions = [
  { id: "rf_impact", code: "impact", name: "Dampak", weight: 0.25 },
  { id: "rf_likelihood", code: "likelihood", name: "Kemungkinan", weight: 0.25 },
  { id: "rf_fraud", code: "fraud", name: "Kecenderungan Fraud", weight: 0.15 },
  { id: "rf_regulatory", code: "regulatory", name: "Eksposur Regulasi", weight: 0.15 },
  { id: "rf_complexity", code: "complexity", name: "Kompleksitas", weight: 0.1 },
  { id: "rf_change", code: "change", name: "Tingkat Perubahan", weight: 0.05 },
  { id: "rf_third_party", code: "third_party", name: "Pihak Ketiga", weight: 0.05 },
];

async function seedWorkpaper(input: {
  id: string;
  engagementId: string;
  reference: string;
  templateKey: "test_of_control" | "substantive_test" | "analytical_review";
  rcmRowId?: string | null;
  status: "draft" | "in_review" | "reviewed" | "signed_off";
  version: number;
  conclusion?: string;
  title?: string;
  purpose?: string;
  procedure?: string;
  preparerId: string;
  reviewerId: string;
  createdById: string;
  submittedAt?: Date;
  reviewedAt?: Date;
  signoff?: { at: Date; userId: string; userName: string };
}): Promise<string> {
  const template = instantiateWorkpaperTemplate(input.templateKey);
  const title = input.title ?? template.title;
  const purpose = input.purpose ?? template.purpose;
  const procedure = input.procedure ?? template.procedure;
  const conclusion = input.conclusion ?? "";

  const existing = await prisma.workpaper.findUnique({
    where: {
      engagementId_reference: { engagementId: input.engagementId, reference: input.reference },
    },
  });
  if (existing) return existing.id;

  const created = await prisma.workpaper.create({
    data: {
      id: input.id,
      engagementId: input.engagementId,
      reference: input.reference,
      title,
      purpose,
      procedure,
      conclusion,
      templateKey: input.templateKey,
      rcmRowId: input.rcmRowId ?? null,
      status: input.status,
      version: input.version,
      preparerId: input.preparerId,
      reviewerId: input.reviewerId,
      createdById: input.createdById,
      updatedById: input.createdById,
      submittedAt: input.submittedAt ?? null,
      reviewedAt: input.reviewedAt ?? null,
      signedOffAt: input.signoff?.at ?? null,
      signedOffById: input.signoff?.userId ?? null,
      signedOffByName: input.signoff?.userName ?? null,
      signoffHash: input.signoff
        ? sha256Hex(JSON.stringify({ title, purpose, procedure, conclusion }))
        : null,
    },
  });

  return created.id;
}

async function seedNote(input: {
  id: string;
  workpaperId: string;
  body: string;
  severity: "minor" | "major" | "blocking";
  authorId: string;
  assigneeId?: string | null;
  createdAt: Date;
  resolution?: string;
  resolvedById?: string;
  resolvedAt?: Date;
}): Promise<void> {
  const existing = await prisma.workpaperNote.findUnique({ where: { id: input.id } });
  if (existing) return;

  await prisma.workpaperNote.create({
    data: {
      id: input.id,
      workpaperId: input.workpaperId,
      body: input.body,
      severity: input.severity,
      status: input.resolution ? "resolved" : "open",
      authorId: input.authorId,
      assigneeId: input.assigneeId ?? null,
      createdAt: input.createdAt,
      resolution: input.resolution ?? null,
      resolvedById: input.resolution ? (input.resolvedById ?? null) : null,
      resolvedAt: input.resolution ? (input.resolvedAt ?? null) : null,
    },
  });
}

async function seedEvidence(input: {
  id: string;
  engagementId: string;
  workpaperId: string;
  rcmRowId?: string | null;
  label: string;
  fileName: string;
  mimeType: string;
  source: string;
  periodLabel: string | null;
  capturedAt: Date;
  version: number;
  content: string;
  supersedesId?: string | null;
  uploadedById: string;
  createdAt: Date;
}): Promise<void> {
  const existing = await prisma.evidenceFile.findUnique({ where: { id: input.id } });
  if (existing) return;

  const storageKey = storageKeyFor({
    workspaceId,
    engagementId: input.engagementId,
    workpaperId: input.workpaperId,
    version: input.version,
    fileName: input.fileName,
  });
  const stored = await putEvidence(storageKey, Buffer.from(input.content, "utf8"));

  await prisma.evidenceFile.create({
    data: {
      id: input.id,
      workpaperId: input.workpaperId,
      rcmRowId: input.rcmRowId ?? null,
      label: input.label,
      fileName: input.fileName,
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      source: input.source,
      periodLabel: input.periodLabel,
      capturedAt: input.capturedAt,
      version: input.version,
      supersedesId: input.supersedesId ?? null,
      uploadedById: input.uploadedById,
      createdAt: input.createdAt,
    },
  });
}

type FindingSeed = {
  id: string;
  engagementId: string;
  reference: string;
  title: string;
  condition: string;
  criteria: string;
  cause?: string;
  effect?: string;
  recommendation?: string;
  severity: "low" | "medium" | "high" | "critical";
  status:
    | "draft"
    | "communicated"
    | "in_remediation"
    | "pending_validation"
    | "closed"
    | "reopened"
    | "accepted_risk";
  progressPercent?: number;
  version: number;
  workpaperId?: string | null;
  rcmRowId?: string | null;
  ownerUserId?: string | null;
  dueDate?: Date | null;
  managementResponse?: string;
  plannedAction?: string;
  riskJustification?: string;
  createdById: string;
  createdAt: Date;
  communicatedAt?: Date | null;
  remediationStartedAt?: Date | null;
  validationSubmittedAt?: Date | null;
  validatedById?: string | null;
  closedAt?: Date | null;
  reopenedAt?: Date | null;
  riskAcceptedAt?: Date | null;
  riskAcceptedById?: string | null;
  evidenceIds?: string[];
  updates?: {
    id: string;
    body: string;
    statusFrom: string;
    statusTo: string;
    progressPercent: number;
    authorId: string;
    createdAt: Date;
  }[];
};

async function seedFinding(input: FindingSeed): Promise<string> {
  const existing = await prisma.finding.findUnique({
    where: {
      engagementId_reference: {
        engagementId: input.engagementId,
        reference: input.reference,
      },
    },
  });

  if (existing) return existing.id;

  const created = await prisma.finding.create({
    data: {
      id: input.id,
      engagementId: input.engagementId,
      reference: input.reference,
      title: input.title,
      condition: input.condition,
      criteria: input.criteria,
      cause: input.cause ?? "",
      effect: input.effect ?? "",
      recommendation: input.recommendation ?? "",
      severity: input.severity,
      status: input.status,
      progressPercent: input.progressPercent ?? 0,
      version: input.version,
      workpaperId: input.workpaperId ?? null,
      rcmRowId: input.rcmRowId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      dueDate: input.dueDate ?? null,
      managementResponse: input.managementResponse ?? "",
      plannedAction: input.plannedAction ?? "",
      riskJustification: input.riskJustification ?? "",
      createdById: input.createdById,
      updatedById: input.createdById,
      createdAt: input.createdAt,
      communicatedAt: input.communicatedAt ?? null,
      remediationStartedAt: input.remediationStartedAt ?? null,
      validationSubmittedAt: input.validationSubmittedAt ?? null,
      validatedById: input.validatedById ?? null,
      closedAt: input.closedAt ?? null,
      reopenedAt: input.reopenedAt ?? null,
      riskAcceptedAt: input.riskAcceptedAt ?? null,
      riskAcceptedById: input.riskAcceptedById ?? null,
    },
  });

  for (const update of input.updates ?? []) {
    const seen = await prisma.findingUpdate.findUnique({ where: { id: update.id } });
    if (seen) continue;

    await prisma.findingUpdate.create({
      data: {
        id: update.id,
        findingId: created.id,
        body: update.body,
        statusFrom: update.statusFrom,
        statusTo: update.statusTo,
        progressPercent: update.progressPercent,
        authorId: update.authorId,
        createdAt: update.createdAt,
      },
    });
  }

  if (input.evidenceIds?.length) {
    await prisma.evidenceFile.updateMany({
      where: { id: { in: input.evidenceIds } },
      data: { findingId: created.id },
    });
  }

  return created.id;
}

async function purgeLegacyDemoUniverse(): Promise<void> {
  await prisma.engagement.deleteMany({ where: { workspaceId } });
  await prisma.auditPlan.deleteMany({ where: { workspaceId } });
  await prisma.riskAssessment.deleteMany({ where: { workspaceId } });
  await prisma.auditEvent.deleteMany({
    where: {
      workspaceId,
      objectType: {
        in: [
          "audit_entity",
          "risk_assessment",
          "audit_plan",
          "engagement",
          "workpaper",
          "evidence_file",
          "finding",
        ],
      },
    },
  });

  const levels = await prisma.auditEntity.groupBy({
    by: ["depth"],
    where: { workspaceId },
  });

  for (const depth of levels.map((level) => level.depth).sort((a, b) => b - a)) {
    await prisma.auditEntity.deleteMany({ where: { workspaceId, depth } });
  }

  await rm(resolve(process.env.EVIDENCE_DIR ?? ".evidence", workspaceId), {
    recursive: true,
    force: true,
  });
}

async function main() {
  const passwordHash = await hash("Password123!", 10);
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: { name: "RS Umum Nusantara Sehat", slug: "rsus-nusantara-sehat" },
    create: {
      id: workspaceId,
      name: "RS Umum Nusantara Sehat",
      slug: "rsus-nusantara-sehat",
    },
  });

  const users = [
    { id: "usr_admin", email: "admin@demo.local", name: "Ayu Admin", role: "ADMIN" },
    {
      id: "usr_cae",
      email: "cae@demo.local",
      name: "Ratna Wijaya, AK, CA",
      role: "CAE",
    },
    {
      id: "usr_manager",
      email: "manager@demo.local",
      name: "Bima Pratama, SKM, M.Kes",
      role: "MANAGER",
    },
    {
      id: "usr_auditor",
      email: "auditor@demo.local",
      name: "Sinta Maharani, AMK",
      role: "AUDITOR",
    },
    {
      id: "usr_reviewer",
      email: "reviewer@demo.local",
      name: "Dimas Saputra, S.Farm, Apt",
      role: "REVIEWER",
    },
    {
      id: "usr_owner",
      email: "owner@demo.local",
      name: "Rendi Kurniawan",
      role: "PROCESS_OWNER",
    },
    {
      id: "usr_owner_yanmed",
      email: "yanmed@demo.local",
      name: "dr. Aditya Nugroho, Sp.PD",
      role: "PROCESS_OWNER",
    },
    {
      id: "usr_owner_keper",
      email: "keper@demo.local",
      name: "Ns. Wulan Ayuningtyas, S.Kep, Ns",
      role: "PROCESS_OWNER",
    },
    {
      id: "usr_owner_penunjang",
      email: "penunjang@demo.local",
      name: "Ani Rohaeni, A.Md.Kes",
      role: "PROCESS_OWNER",
    },
    {
      id: "usr_owner_farmasi",
      email: "farmasi@demo.local",
      name: "Farla Octaviana, S.Farm, Apt",
      role: "PROCESS_OWNER",
    },
    {
      id: "usr_owner_rekam",
      email: "rekam@demo.local",
      name: "Titis Haryani, A.Md.RMIK",
      role: "PROCESS_OWNER",
    },
    {
      id: "usr_owner_umum",
      email: "umum@demo.local",
      name: "Gunawan Siregar",
      role: "PROCESS_OWNER",
    },
    {
      id: "usr_owner_simrs",
      email: "simrs@demo.local",
      name: "Bayu Anggara, S.Kom",
      role: "PROCESS_OWNER",
    },
    {
      id: "usr_owner_keuangan",
      email: "keuangan@demo.local",
      name: "Lestari Pudjiastuti, SE, M.Ak",
      role: "PROCESS_OWNER",
    },
    {
      id: "usr_owner_sdm",
      email: "sdm@demo.local",
      name: "Hendra Kusuma, S.E",
      role: "PROCESS_OWNER",
    },
    {
      id: "usr_owner_mutu",
      email: "mutu@demo.local",
      name: "Ns. Citra Puspita, S.Kep, M.KM",
      role: "PROCESS_OWNER",
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        email: user.email,
        passwordHash,
        isActive: true,
      },
      create: {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash,
      },
    });

    await prisma.membership.upsert({
      where: {
        workspaceId_userId: { workspaceId, userId: user.id },
      },
      update: { role: user.role },
      create: {
        workspaceId,
        userId: user.id,
        role: user.role,
      },
    });
  }

  await prisma.riskModel.upsert({
    where: { id: riskModelId },
    update: {
      name: "IA Risk Model 2026",
      status: "active",
      levelThresholds,
      isDefault: true,
      approvedById: "usr_cae",
      approvedAt: new Date("2026-01-08T09:00:00Z"),
    },
    create: {
      id: riskModelId,
      workspaceId,
      name: "IA Risk Model 2026",
      description:
        "Model risiko default untuk audit universe: dampak, kemungkinan, fraud, regulasi, kompleksitas, perubahan, dan pihak ketiga.",
      status: "active",
      scaleMin: 1,
      scaleMax: 5,
      controlReductionMax: 0.5,
      levelThresholds,
      isDefault: true,
      methodologyVersion: "2026.1",
      version: 1,
      createdById: "usr_admin",
      approvedById: "usr_cae",
      approvedAt: new Date("2026-01-08T09:00:00Z"),
    },
  });

  for (const [index, factor] of factorDefinitions.entries()) {
    await prisma.riskFactor.upsert({
      where: { id: factor.id },
      update: {
        name: factor.name,
        weight: factor.weight,
        isRequired: true,
        sortOrder: index,
      },
      create: {
        id: factor.id,
        riskModelId,
        code: factor.code,
        name: factor.name,
        weight: factor.weight,
        isRequired: true,
        sortOrder: index,
      },
    });
  }

  await prisma.riskCycle.upsert({
    where: { id: cycleId },
    update: {
      name: "Siklus Risiko 2026",
      status: "active",
    },
    create: {
      id: cycleId,
      workspaceId,
      name: "Siklus Risiko 2026",
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-12-31T23:59:59Z"),
      status: "active",
      createdById: "usr_cae",
      activatedAt: new Date("2026-01-08T09:00:00Z"),
    },
  });

  await purgeLegacyDemoUniverse();

  type AssessmentState = "approved" | "draft" | "none";

  type UniverseScores = readonly [
    impact: number,
    likelihood: number,
    fraud: number,
    regulatory: number,
    complexity: number,
    change: number,
    thirdParty: number,
    controlEffectiveness: number,
  ];

  type UniverseNode = {
    id: string;
    parentId: string | null;
    code: string;
    name: string;
    type: string;
    description: string;
    ownerUserId: string;
    tags: string[];
    scores: UniverseScores | null;
    assessment: AssessmentState;
  };

  const universeNodes: UniverseNode[] = [
    {
      id: "ent_rs",
      parentId: null,
      code: "RSNS",
      name: "RS Umum Nusantara Sehat",
      type: "organization_unit",
      description:
        "Rumah sakit umum tipe B dengan 380 tempat tidur; simpul akar audit universe 2026.",
      ownerUserId: "usr_cae",
      tags: ["rumah-sakit", "tipe-b"],
      scores: [4, 4, 3, 4, 4, 3, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_governance",
      parentId: "ent_rs",
      code: "GOV",
      name: "Tata Kelola, Direksi & Dewan Pengawas",
      type: "organization_unit",
      description:
        "Peran Direksi, Dewan Pengawas, dan komite di bawahnya sesuai UU 17/2023 tentang Kesehatan.",
      ownerUserId: "usr_cae",
      tags: ["tata-kelola", "governance"],
      scores: [4, 2, 3, 5, 3, 2, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_riskok",
      parentId: "ent_governance",
      code: "RISK-OK",
      name: "Manajemen Risiko Korporasi & Rencana Bisnis RS",
      type: "risk_domain",
      description:
        "Register risiko rumah sakit, Rencana Bisnis Jangka Panjang, dan pelaporan ke Dewan Pengawas.",
      ownerUserId: "usr_cae",
      tags: ["risk-management", "planning"],
      scores: [4, 3, 2, 4, 4, 3, 2, 3],
      assessment: "draft",
    },
    {
      id: "ent_komite",
      parentId: "ent_governance",
      code: "KOMITE",
      name: "Komite Medik, Komite Keperawatan & Komite Etik",
      type: "organization_unit",
      description:
        "Kredensial, privilese, audit mortalitas, dan Etik & Hukum RS atas profesi di RS.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["profesi", "kredensial"],
      scores: [3, 2, 1, 4, 3, 2, 1, 5],
      assessment: "approved",
    },
    {
      id: "ent_yankes",
      parentId: "ent_rs",
      code: "YANMED",
      name: "Bidang Pelayanan Medis",
      type: "organization_unit",
      description:
        "Seluruh layanan klinis: gawat darurat, rawat inap, rawat jalan, kritikal, dan maternal.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["klinis", "pelayanan"],
      scores: [5, 4, 2, 5, 4, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_igd",
      parentId: "ent_yankes",
      code: "IGD",
      name: "Instalasi Gawat Darurat & Triase",
      type: "business_process",
      description:
        "Layanan 24 jam, triase, response time, dan penanganan kasus emergensi serta kegawatdaruratan obstetri.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["24-jam", "keselamatan-pasien"],
      scores: [4, 4, 1, 4, 4, 3, 1, 3],
      assessment: "approved",
    },
    {
      id: "ent_ranap",
      parentId: "ent_yankes",
      code: "RANAP",
      name: "Rawat Inap Umum & VIP",
      type: "business_process",
      description:
        "Siklus perawatan inap, visite dokter, pulang paksa, dan lama hari perawatan.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["inap", "kapasitas"],
      scores: [4, 4, 2, 4, 4, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_icu",
      parentId: "ent_yankes",
      code: "ICU",
      name: "Intensive Care (ICU, HCU, NICU, PICU)",
      type: "business_process",
      description:
        "Perawatan kritikal, rasio perawat-pasien, ventilator, dan alur rujukan naik-turun.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["kritikal", "ventilator"],
      scores: [5, 3, 1, 4, 4, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_rajal",
      parentId: "ent_yankes",
      code: "RAJAL",
      name: "Rawat Jalan & Poliklinik Spesialis",
      type: "business_process",
      description:
        "Antrean, rujukan balik, praktik dokter spesialis paruh waktu, dan kapasitas poli.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["poliklinik", "antrean"],
      scores: [3, 4, 2, 3, 3, 3, 2, 4],
      assessment: "approved",
    },
    {
      id: "ent_vk",
      parentId: "ent_yankes",
      code: "VK",
      name: "Kamar Bersalin & Perinatologi",
      type: "business_process",
      description:
        "Persalinan, asuhan intrapartum, Bayi Baru Lahir (BBL) resusitasi, dan ASI eksklusif.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["maternal", "perinatologi"],
      scores: [5, 3, 2, 4, 4, 2, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_ok",
      parentId: "ent_yankes",
      code: "OK",
      name: "Kamar Bedah (Operating Theatre) & Anestesi",
      type: "business_process",
      description:
        "Jadwal operasi, surgical safety checklist, anestesi, dan instrumentasi bedah.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["bedah", "anestesi"],
      scores: [5, 3, 2, 4, 5, 3, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_hd",
      parentId: "ent_yankes",
      code: "HD",
      name: "Instalasi Hemodialisis",
      type: "business_process",
      description:
        "Tindakan cuci darah rutin pasien gagal ginjal, air treatmen, dan klaim per sesi.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["renal", "tindakan"],
      scores: [5, 3, 2, 4, 4, 2, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_onk",
      parentId: "ent_yankes",
      code: "ONK",
      name: "Unit Onkologi & Kemoterapi",
      type: "business_process",
      description:
        "Tata laksana kanker, peracikan kemoterapi sitotoksik, dan penanganan efek samping.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["onkologi", "sitotoksik"],
      scores: [5, 3, 2, 4, 4, 4, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_keper",
      parentId: "ent_rs",
      code: "KEPER",
      name: "Bidang Keperawatan",
      type: "organization_unit",
      description:
        "Asuhan keperawatan di seluruh unit, pendokumentasian, dan pengendalian mutu tindakan.",
      ownerUserId: "usr_owner_keper",
      tags: ["keperawatan", "asuhan"],
      scores: [4, 4, 2, 4, 4, 3, 1, 3],
      assessment: "approved",
    },
    {
      id: "ent_askep",
      parentId: "ent_keper",
      code: "ASKEP",
      name: "Asuhan Keperawatan & Pendokumentasian",
      type: "business_process",
      description:
        "Tahapan asuhan, identifikasi pasien, pemberian obat, dan serah terima (handover) jaga.",
      ownerUserId: "usr_owner_keper",
      tags: ["asuhan", "dokumentasi"],
      scores: [4, 4, 2, 4, 4, 3, 1, 3],
      assessment: "approved",
    },
    {
      id: "ent_tenaga_keper",
      parentId: "ent_keper",
      code: "TENAGA-KEPER",
      name: "Ketenagaan & Penjadwalan Perawat",
      type: "business_process",
      description:
        "Beban kerja perawat, shift 12 jam, lembur, dan pemenuhan rasio tempat tidur.",
      ownerUserId: "usr_owner_keper",
      tags: ["sdm-klinis", "shift"],
      scores: [3, 4, 3, 3, 3, 3, 2, 2],
      assessment: "approved",
    },
    {
      id: "ent_penunjang",
      parentId: "ent_rs",
      code: "PJANG-MED",
      name: "Instalasi Penunjang Medik",
      type: "organization_unit",
      description:
        "Farmasi, laboratorium, radiologi, sterilisasi, gizi, transfusi, dan rehabilitasi medis.",
      ownerUserId: "usr_owner_penunjang",
      tags: ["penunjang", "diagnostik"],
      scores: [4, 4, 3, 4, 4, 3, 4, 3],
      assessment: "approved",
    },
    {
      id: "ent_farmasi",
      parentId: "ent_penunjang",
      code: "FARMA",
      name: "Instalasi Farmasi & Penyediaan Obat",
      type: "business_process",
      description:
        "Formularium, pengadaan obat dan bahan medis habis pakai, serta pelayanan resep.",
      ownerUserId: "usr_owner_farmasi",
      tags: ["obat", "formularium"],
      scores: [5, 4, 4, 5, 4, 3, 4, 3],
      assessment: "approved",
    },
    {
      id: "ent_highalert",
      parentId: "ent_farmasi",
      code: "HIGH-ALERT",
      name: "Obat High-Alert, LASA, Narkotika & Psikotropika",
      type: "business_process",
      description:
        "Penyimpanan terpisah, double check, dan pelaporan khusus narkotika-psikotropika.",
      ownerUserId: "usr_owner_farmasi",
      tags: ["medication-safety", "narkotika"],
      scores: [5, 4, 3, 5, 4, 3, 3, 2],
      assessment: "approved",
    },
    {
      id: "ent_stokfarm",
      parentId: "ent_farmasi",
      code: "STOK-FARMA",
      name: "Stok, Expired Date, Opname & Sisa Pakai Obat",
      type: "business_process",
      description:
        "Peredaran obat, stok opname, mendekati ED, dan pemusnahan obat tidak layak pakai.",
      ownerUserId: "usr_owner_farmasi",
      tags: ["persediaan", "ed"],
      scores: [4, 4, 4, 3, 3, 3, 4, 2],
      assessment: "approved",
    },
    {
      id: "ent_resep",
      parentId: "ent_farmasi",
      code: "RESEP",
      name: "Peresepan, Dispensing & Pelayanan Resep",
      type: "business_process",
      description:
        "Verifikasi resep, racik, penundaan resep, dan obat bawa pulang pasien rawat jalan.",
      ownerUserId: "usr_owner_farmasi",
      tags: ["dispensing", "resep"],
      scores: [4, 4, 3, 4, 4, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_lab",
      parentId: "ent_penunjang",
      code: "LAB",
      name: "Instalasi Laboratorium",
      type: "business_process",
      description:
        "Pemeriksaan spesimen, nilai kritis, kalibrasi alat, dan rujukan tes luar.",
      ownerUserId: "usr_owner_penunjang",
      tags: ["diagnostik", "nilai-kritis"],
      scores: [4, 4, 2, 4, 4, 3, 4, 3],
      assessment: "approved",
    },
    {
      id: "ent_rm_file",
      parentId: "ent_penunjang",
      code: "RM-FILING",
      name: "Berkas Rekam Medis, Retensi & Pemusnahan",
      type: "business_process",
      description:
        "Perencanaan berkas, peminjaman, retensi, dan pemusnahan rekam medis.",
      ownerUserId: "usr_owner_rekam",
      tags: ["rekam-medis", "retensi"],
      scores: null,
      assessment: "none",
    },
    {
      id: "ent_rad",
      parentId: "ent_penunjang",
      code: "RAD",
      name: "Instalasi Radiologi & Diagnostik Imaging",
      type: "business_process",
      description:
        "Pemeriksaan radiologi, proteksi radiasi, dan pembacaan hasil oleh radiolog.",
      ownerUserId: "usr_owner_penunjang",
      tags: ["radiologi", "proteksi-radiasi"],
      scores: [4, 3, 2, 4, 4, 3, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_iral",
      parentId: "ent_penunjang",
      code: "IRAL",
      name: "Instalasi Sterilisasi Alat (IRAL/CSSD)",
      type: "business_process",
      description:
        "Daur ulang instrumentasi bedah, indikator sterilisasi, dan pelacakan instrumen.",
      ownerUserId: "usr_owner_penunjang",
      tags: ["sterilisasi", "cssd"],
      scores: [5, 3, 2, 4, 3, 2, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_gizi",
      parentId: "ent_penunjang",
      code: "GIZI",
      name: "Instalasi Gizi, Diet Pasien & Dapur",
      type: "business_process",
      description:
        "Penyusunan diet, hygiene sanitasi makanan, dan distribusi makan pasien.",
      ownerUserId: "usr_owner_penunjang",
      tags: ["gizi", "diet"],
      scores: [4, 4, 3, 4, 3, 2, 3, 5],
      assessment: "approved",
    },
    {
      id: "ent_utd",
      parentId: "ent_penunjang",
      code: "UTD",
      name: "Unit Transfusi Darah",
      type: "business_process",
      description:
        "Screening donor, kompabilitas, penyimpanan komponen darah, dan pelacakan reaksi.",
      ownerUserId: "usr_owner_penunjang",
      tags: ["darah", "screening"],
      scores: [5, 3, 2, 5, 3, 2, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_fisioterapi",
      parentId: "ent_penunjang",
      code: "FISIOTERAPI",
      name: "Unit Fisioterapi & Rehabilitasi Medis",
      type: "business_process",
      description:
        "Program rehabilitasi, jumlah kunjungan terapi, dan penagihan tindakan.",
      ownerUserId: "usr_owner_penunjang",
      tags: ["rehabilitasi"],
      scores: [3, 2, 1, 3, 3, 2, 1, 5],
      assessment: "draft",
    },
    {
      id: "ent_umum",
      parentId: "ent_rs",
      code: "UMUM",
      name: "Bagian Umum & Penunjang Non-Medik",
      type: "organization_unit",
      description:
        "Gudang, rumah tangga, kebersihan, keamanan, utilitas, dan pengelolaan limbah.",
      ownerUserId: "usr_owner_umum",
      tags: ["non-medik", "fasilitas"],
      scores: [3, 4, 3, 3, 4, 3, 5, 3],
      assessment: "approved",
    },
    {
      id: "ent_gudang",
      parentId: "ent_umum",
      code: "GUDANG",
      name: "Gudang, Inventaris Non-Medis & Distribusi",
      type: "business_process",
      description:
        "Penerimaan barang, penyimpanan, distribusi ke unit, dan stock opname non-medis.",
      ownerUserId: "usr_owner_umum",
      tags: ["logistik", "opname"],
      scores: [3, 4, 4, 3, 3, 3, 4, 2],
      assessment: "approved",
    },
    {
      id: "ent_limbah",
      parentId: "ent_umum",
      code: "LIMBAH-B3",
      name: "Pengelolaan Limbah B3 & Sanitasi RS",
      type: "business_process",
      description:
        "Pemisahan limbah infeksius dan B3, TPS limbah, insinerator, dan laporann ERAN.",
      ownerUserId: "usr_owner_umum",
      tags: ["limbah-b3", "environment"],
      scores: [4, 3, 2, 5, 3, 2, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_binjas",
      parentId: "ent_umum",
      code: "BINJAS",
      name: "Binjas: Kebersihan, Laundry & Kamar Jenazah",
      type: "business_process",
      description:
        "Kebersihan lingkungan, laundry linen pasien, dan pelayanan mayat.",
      ownerUserId: "usr_owner_umum",
      tags: ["kebersihan", "laundry"],
      scores: null,
      assessment: "none",
    },
    {
      id: "ent_security",
      parentId: "ent_umum",
      code: "SECURITY",
      name: "Keamanan, Ketertiban & Pengawasan CCTV",
      type: "business_process",
      description:
        "Penjagaan area rawan, parkir, dan pemantauan CCTV di area publik serta rekam medis.",
      ownerUserId: "usr_owner_umum",
      tags: ["keamanan", "cctv"],
      scores: null,
      assessment: "none",
    },
    {
      id: "ent_ambulans",
      parentId: "ent_umum",
      code: "AMBULANS",
      name: "Ambulans, Rujukan & Penanggulangan Gawat Darurat",
      type: "business_process",
      description:
        "Rujukan masuk-keluar, response time ambulans, dan aktivasi bencana.",
      ownerUserId: "usr_owner_umum",
      tags: ["rujukan", "emergency"],
      scores: [4, 3, 1, 4, 4, 2, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_ipsrs",
      parentId: "ent_umum",
      code: "IPSRS",
      name: "IPSRS: Utilitas, Gas Medis & Pemeliharaan Alat",
      type: "business_process",
      description:
        "Instalasi listrik, gas medis, air bersih, dan pemeliharaan preventif alkes.",
      ownerUserId: "usr_owner_umum",
      tags: ["utilitas", "gas-medis"],
      scores: [4, 3, 2, 4, 4, 3, 4, 2],
      assessment: "draft",
    },
    {
      id: "ent_simrs",
      parentId: "ent_rs",
      code: "SIMRS",
      name: "Unit SIMRS & Teknologi Informasi",
      type: "system",
      description:
        "Sistem informasi manajemen RS, infrastruktur, aplikasi penunjang, dan layanan TI.",
      ownerUserId: "usr_owner_simrs",
      tags: ["simrs", "aplikasi"],
      scores: [4, 4, 3, 4, 5, 4, 4, 3],
      assessment: "approved",
    },
    {
      id: "ent_itgc",
      parentId: "ent_simrs",
      code: "ITGC",
      name: "ITGC SIMRS: Akses, Perubahan & Operasi",
      type: "system",
      description:
        "Manajemen hak akses, change management, job terjadwal, dan log aktivitas.",
      ownerUserId: "usr_owner_simrs",
      tags: ["itgc", "akses"],
      scores: [4, 4, 3, 4, 4, 4, 3, 3],
      assessment: "draft",
    },
    {
      id: "ent_rme",
      parentId: "ent_simrs",
      code: "RME",
      name: "Rekam Medis Elektronik & Interoperabilitas SATUSEHAT",
      type: "system",
      description:
        "Implementasi RME, pengiriman data ke SATUSEHAT, dan konsistensi data klinis.",
      ownerUserId: "usr_owner_rekam",
      tags: ["rme", "satusehat"],
      scores: [4, 4, 3, 5, 4, 4, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_secinfo",
      parentId: "ent_simrs",
      code: "SEC-INF",
      name: "Keamanan Informasi & Perlindungan Data Pribadi",
      type: "risk_domain",
      description:
        "Perlindungan data pasien sesuai UU 27/2022, klasifikasi data, dan penanganan insiden siber.",
      ownerUserId: "usr_owner_simrs",
      tags: ["pdp", "cyber"],
      scores: [5, 3, 4, 5, 4, 4, 3, 2],
      assessment: "approved",
    },
    {
      id: "ent_bcp",
      parentId: "ent_simrs",
      code: "BCP-DR",
      name: "Backup, Disaster Recovery & Kontinuitas Layanan",
      type: "system",
      description:
        "Retensi backup, uji pemulihan, dan rencana kontinuitas operasional RS.",
      ownerUserId: "usr_owner_simrs",
      tags: ["bcp", "backup"],
      scores: [5, 2, 1, 4, 4, 3, 3, 2],
      assessment: "draft",
    },
    {
      id: "ent_billing",
      parentId: "ent_simrs",
      code: "BILLING",
      name: "Sistem Billing, Kasir & Rekonsiliasi Harian",
      type: "system",
      description:
        "Entry tindakan, penagihan, pembayaran kasir, dan rekonsiliasi harian.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["billing", "kasir"],
      scores: [4, 4, 4, 4, 4, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_keuangan",
      parentId: "ent_rs",
      code: "KEU",
      name: "Bagian Keuangan, Tagihan & Akuntansi",
      type: "organization_unit",
      description:
        "Siklus pendapatan dan pengeluaran RS, pelaporan keuangan, dan kepatuhan fiskal.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["keuangan", "fiskal"],
      scores: [4, 4, 4, 5, 4, 3, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_klaim",
      parentId: "ent_keuangan",
      code: "KLAIM-JKN",
      name: "Pendapatan Jasa Pelayanan & Klaim JKN",
      type: "business_process",
      description:
        "Klaim INA-CBGs dan non-INA-CBGs kepada BPJS Kesehatan serta penjamin lain.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["jkn", "ina-cbgs"],
      scores: [4, 5, 4, 5, 4, 4, 3, 2],
      assessment: "approved",
    },
    {
      id: "ent_coding",
      parentId: "ent_klaim",
      code: "CODING",
      name: "Kodefikasi Diagnosis, Prosedur & INA-CBGs",
      type: "business_process",
      description:
        "Coding ICD-10/ICD-9CM, groupers, dan akurasi kode terhadap dokumentasi klinis.",
      ownerUserId: "usr_owner_rekam",
      tags: ["coding", "ina-cbgs"],
      scores: [4, 5, 4, 5, 4, 4, 2, 2],
      assessment: "approved",
    },
    {
      id: "ent_pending",
      parentId: "ent_klaim",
      code: "PENDING-CLAIM",
      name: "Pending Claim, Verifikasi & Dispute Klaim",
      type: "business_process",
      description:
        "Klaim pending akibat berkas, audit mutually exclusive, dan dispute dengan verifier.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["pending", "verifikasi"],
      scores: [4, 4, 3, 4, 3, 3, 3, 2],
      assessment: "approved",
    },
    {
      id: "ent_piutang",
      parentId: "ent_keuangan",
      code: "PIUTANG",
      name: "Piutang BPJS, Asuransi & Penagihan Pasien",
      type: "business_process",
      description:
        "Umur piutang, verifikasi berkas penagihan, dan tunggakan pasien umum.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["piutang", "aging"],
      scores: [4, 4, 3, 3, 3, 3, 4, 3],
      assessment: "approved",
    },
    {
      id: "ent_p2p",
      parentId: "ent_keuangan",
      code: "P2P",
      name: "Siklus Pengadaan sampai Pembayaran Utang Usaha",
      type: "business_process",
      description:
        "Permintaan pembelian, PO, penerimaan barang, faktur, dan pembayaran rekanan.",
      ownerUserId: "usr_owner_umum",
      tags: ["procure-to-pay", "utang"],
      scores: [4, 4, 4, 4, 3, 3, 5, 2],
      assessment: "approved",
    },
    {
      id: "ent_jasmed",
      parentId: "ent_keuangan",
      code: "JASMED",
      name: "Pembagian Jasa Medis Dokter & Insentif Unit",
      type: "business_process",
      description:
        "Perhitungan jasa medis dokter dan distribusi insentif unit berdasarkan kinerja.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["jasa-medik", "insentif"],
      scores: [4, 4, 4, 4, 3, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_asset",
      parentId: "ent_keuangan",
      code: "ASET",
      name: "Aset Tetap, Alkes & Penyusutan",
      type: "business_process",
      description:
        "Kapitalisasi, label aset, mutasi, penyusutan alkes, dan penghapusan aset.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["aset", "alkes"],
      scores: [4, 3, 3, 4, 3, 3, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_pajak",
      parentId: "ent_keuangan",
      code: "PAJAK",
      name: "Kepatuhan Perpajakan RS",
      type: "business_process",
      description:
        "PPh 21 jasa dokter dan pegawai, PPh 23 jasa pihak ketiga, dan PPN masukan.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["pajak", "kepatuhan"],
      scores: [4, 3, 3, 5, 3, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_gl",
      parentId: "ent_keuangan",
      code: "GL",
      name: "Akuntansi, Penutupan Buku & Pelaporan",
      type: "business_process",
      description:
        "Jurnal, rekonsiliasi, close period, dan laporan keuangan serta catatan atas laporan.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["accounting", "close"],
      scores: [4, 3, 3, 4, 4, 3, 2, 4],
      assessment: "approved",
    },
    {
      id: "ent_kas",
      parentId: "ent_keuangan",
      code: "KAS",
      name: "Kas, Bank & Manajemen Likuiditas",
      type: "business_process",
      description:
        "Kas kecil unit, setor tunai harian, dan perencanaan kebutuhan kas RS.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["kas", "bank"],
      scores: null,
      assessment: "none",
    },
    {
      id: "ent_sdm",
      parentId: "ent_rs",
      code: "SDM-DIKLAT",
      name: "Bagian SDM, Pendidikan & Penelitian",
      type: "organization_unit",
      description:
        "Ketenagaan, kepegawaian, diklat, dan program pendidikan RS sebagai RS pendidikan.",
      ownerUserId: "usr_owner_sdm",
      tags: ["sdm", "diklat"],
      scores: [3, 4, 3, 4, 3, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_rekrut",
      parentId: "ent_sdm",
      code: "REKRUT",
      name: "Rekrutmen, Onboarding & Kontrak Kerja",
      type: "business_process",
      description:
        "Seleksi, masa percobaan, dan perjanjian kerja sama tenaga kesehatan.",
      ownerUserId: "usr_owner_sdm",
      tags: ["rekrutmen", "kontrak"],
      scores: [3, 3, 4, 4, 3, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_izinsdm",
      parentId: "ent_sdm",
      code: "STR-SIP",
      name: "Kompetensi, STR/SIP & Perizinan Tenaga Kesehatan",
      type: "business_process",
      description:
        "Kepemilikan STR/SIP, izin praktik, dan pemantauan masa berlaku dokumen tenaga kesehatan.",
      ownerUserId: "usr_owner_sdm",
      tags: ["perizinan", "kompetensi"],
      scores: [4, 3, 3, 5, 3, 3, 1, 3],
      assessment: "approved",
    },
    {
      id: "ent_diklat",
      parentId: "ent_sdm",
      code: "DIKLAT",
      name: "Pendidikan, Pelatihan & Program Internsip (PPI)",
      type: "business_process",
      description:
        "Diklat internal, pelatihan wajib, dan pembimbingan peserta internsip serta residen.",
      ownerUserId: "usr_owner_sdm",
      tags: ["diklat", "pendidikan"],
      scores: null,
      assessment: "none",
    },
    {
      id: "ent_payroll",
      parentId: "ent_sdm",
      code: "PAYROLL",
      name: "Penggajian, Lembur & Jaminan Sosial",
      type: "business_process",
      description:
        "Run payroll, lembur klinis, iuran BPJS Kesehatan/Ketenagakerjaan, dan gaji dokter kontrak.",
      ownerUserId: "usr_owner_sdm",
      tags: ["payroll", "iuran"],
      scores: [4, 3, 4, 4, 3, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_mutu",
      parentId: "ent_rs",
      code: "MUTU",
      name: "Unit Mutu, Manajemen Risiko & Keselamatan Pasien",
      type: "risk_domain",
      description:
        "Siklus mutu, indikator nasional, manajemen risiko RS, dan keselamatan pasien.",
      ownerUserId: "usr_owner_mutu",
      tags: ["mutu", "safety"],
      scores: [4, 3, 2, 5, 4, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_pmkp",
      parentId: "ent_mutu",
      code: "PMKP",
      name: "Program Mutu & Peningkatan Klinis (PMKP)",
      type: "business_process",
      description:
        "Indikator mutu unit, penelitian klinik, dan evaluasi berkala layanan prioritas.",
      ownerUserId: "usr_owner_mutu",
      tags: ["indikator", "pmkp"],
      scores: [4, 3, 2, 4, 4, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_ikp",
      parentId: "ent_mutu",
      code: "IKP",
      name: "Pelaporan Insiden & Keselamatan Pasien",
      type: "business_process",
      description:
        "Pelaporan insiden/non-punitive, analisis akar masalah, dan tindak lanjut rekomendasi.",
      ownerUserId: "usr_owner_mutu",
      tags: ["insiden", "rca"],
      scores: [4, 4, 1, 5, 3, 3, 1, 3],
      assessment: "approved",
    },
    {
      id: "ent_ppi",
      parentId: "ent_mutu",
      code: "PPI",
      name: "Pencegahan & Pengendalian Infeksi",
      type: "business_process",
      description:
        "Surveilans HAIs, cuci tangan, ICRA, dan audit kepatuhan PPI di unit.",
      ownerUserId: "usr_owner_mutu",
      tags: ["hais", "surveilans"],
      scores: [5, 3, 1, 5, 4, 2, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_k3",
      parentId: "ent_mutu",
      code: "K3RS",
      name: "K3 Rumah Sakit & Penanganan Bencana",
      type: "business_process",
      description:
        "Keselamatan kerja pegawai, api & listrik, kecelakaan kerja, dan simulasi bencana.",
      ownerUserId: "usr_owner_mutu",
      tags: ["k3", "bencana"],
      scores: [4, 3, 1, 5, 3, 2, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_kepatuhan",
      parentId: "ent_rs",
      code: "PATUH",
      name: "Kepatuhan Regulasi & Manajemen Anti-Fraud",
      type: "risk_domain",
      description:
        "Perizinan RS, akreditasi, gratifikasi, whistleblowing, dan kepatuhan program JKN.",
      ownerUserId: "usr_cae",
      tags: ["compliance", "anti-fraud"],
      scores: [4, 3, 4, 5, 3, 3, 3, 3],
      assessment: "approved",
    },
    {
      id: "ent_izinrs",
      parentId: "ent_kepatuhan",
      code: "IZIN-RS",
      name: "Perizinan, Klasifikasi & Standar Sarana RS",
      type: "risk_domain",
      description:
        "Izin operasional, klasifikasi tipe RS, izin alkes, dan standar sarana prasarana.",
      ownerUserId: "usr_cae",
      tags: ["perizinan", "klasifikasi"],
      scores: [5, 2, 3, 5, 3, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_akreditasi",
      parentId: "ent_kepatuhan",
      code: "AKREDITASI",
      name: "Akreditasi RS (KARS/LAFKI)",
      type: "risk_domain",
      description:
        "Persiapan dan pemenuhan standar akreditasi, telusur, serta tindak lanjut rekomendasi survei.",
      ownerUserId: "usr_owner_mutu",
      tags: ["akreditasi", "standar"],
      scores: [4, 3, 2, 5, 3, 3, 2, 3],
      assessment: "approved",
    },
    {
      id: "ent_gratifikasi",
      parentId: "ent_kepatuhan",
      code: "GRATIFIKASI",
      name: "Gratifikasi, Konflik Kepentingan & Whistleblowing",
      type: "risk_domain",
      description:
        "Laporan gratifikasi dari rekanan, deklarasi konflik kepentingan, dan kanal whistleblowing.",
      ownerUserId: "usr_cae",
      tags: ["anti-bribery", "coi"],
      scores: [4, 3, 5, 4, 3, 3, 3, 2],
      assessment: "approved",
    },
    {
      id: "ent_hakpas",
      parentId: "ent_kepatuhan",
      code: "HAK-PAS",
      name: "Hak Pasien, Informed Consent & Pengaduan",
      type: "business_process",
      description:
        "Persetujuan tindakan, penolakan tindakan, informasi tagihan, dan penanganan pengaduan.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["patient-rights", "complaint"],
      scores: [4, 3, 2, 5, 3, 3, 1, 3],
      assessment: "approved",
    },
    {
      id: "ent_jkn",
      parentId: "ent_kepatuhan",
      code: "JKN",
      name: "Kepatuhan Kerja Sama BPJS Kesehatan & TPM",
      type: "risk_domain",
      description:
        "Perjanjian kerja sama, tim mutually exclusive, dan temuan audit kepatuhan klaim.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["bpjs", "tpm"],
      scores: [5, 4, 4, 5, 4, 4, 4, 2],
      assessment: "approved",
    },
    {
      id: "ent_pkrs",
      parentId: "ent_kepatuhan",
      code: "PKRS",
      name: "Pemberdayaan Pasien & Promosi Kesehatan (PKRS)",
      type: "business_process",
      description:
        "Edukasi pasien, kelompok dukungan, dan media promosi kesehatan RS.",
      ownerUserId: "usr_owner_mutu",
      tags: ["edukasi", "promkes"],
      scores: null,
      assessment: "none",
    },
    {
      id: "ent_mitra",
      parentId: "ent_rs",
      code: "MITRA",
      name: "Pihak Ketiga & Kerja Sama",
      type: "third_party",
      description:
        "Rekanan pengadaan, alih daya, rujukan penunjang, penjamin, dan kerja sama profesi.",
      ownerUserId: "usr_owner_umum",
      tags: ["third-party", "vendor"],
      scores: [4, 4, 4, 4, 4, 3, 5, 2],
      assessment: "approved",
    },
    {
      id: "ent_vendor",
      parentId: "ent_mitra",
      code: "VENDOR",
      name: "Rekanan Pengadaan Barang & Jasa",
      type: "third_party",
      description:
        "Pemasok obat, alkes, binjasso, dan jasa penunjang RS; master data dan klasifikasi rekanan.",
      ownerUserId: "usr_owner_umum",
      tags: ["vendor", "master-data"],
      scores: [5, 4, 5, 3, 3, 3, 5, 2],
      assessment: "approved",
    },
    {
      id: "ent_onboard",
      parentId: "ent_vendor",
      code: "ONBOARD",
      name: "Onboarding, Master & Klasifikasi Rekanan",
      type: "third_party",
      description:
        "Verifikasi dokumen rekanan, penetapan nomor rekanan, dan kategori barang/jasa.",
      ownerUserId: "usr_owner_umum",
      tags: ["onboarding", "master"],
      scores: [4, 4, 4, 4, 3, 3, 5, 2],
      assessment: "approved",
    },
    {
      id: "ent_sla",
      parentId: "ent_vendor",
      code: "SLA-REKANAN",
      name: "Kontrak, SLA & Evaluasi Kinerja Rekanan",
      type: "third_party",
      description:
        "Masa kontrak, service level, penalti keterlambatan, dan evaluasi tahunan rekanan.",
      ownerUserId: "usr_owner_umum",
      tags: ["kontrak", "sla"],
      scores: null,
      assessment: "none",
    },
    {
      id: "ent_alihdaya",
      parentId: "ent_mitra",
      code: "ALIHDAYA",
      name: "Alih Daya Keamanan, Kebersihan & Penunjang",
      type: "third_party",
      description:
        "Pegawai alih daya, izin kerja, absensi, dan pengendalian mutu layanan vendor.",
      ownerUserId: "usr_owner_umum",
      tags: ["outsourcing"],
      scores: [3, 4, 3, 4, 3, 3, 5, 3],
      assessment: "approved",
    },
    {
      id: "ent_rujukan",
      parentId: "ent_mitra",
      code: "RUJLUAR",
      name: "Kerja Sama Rujukan & Penunjang Luar",
      type: "third_party",
      description:
        "Rujukan spesialistik, pemeriksaan penunjang ke RS/laboratorium mitra, dan balas hasil.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["rujukan", "mitra-klinik"],
      scores: [4, 3, 2, 4, 3, 3, 5, 3],
      assessment: "approved",
    },
    {
      id: "ent_asuransi",
      parentId: "ent_mitra",
      code: "ASURANSI",
      name: "Asuransi Kesehatan, TPA & Penjamin Lainnya",
      type: "third_party",
      description:
        "Kerja sama penjamin swasta, Third Party Administrator, dan batas plafon layanan.",
      ownerUserId: "usr_owner_keuangan",
      tags: ["asuransi", "tpa"],
      scores: [4, 3, 3, 4, 3, 3, 5, 3],
      assessment: "approved",
    },
    {
      id: "ent_dokkon",
      parentId: "ent_mitra",
      code: "DOKKON",
      name: "Kerja Sama Dokter Paruh Waktu & RSPP",
      type: "third_party",
      description:
        "Kontrak dokter paruh waktu, RSPP, dan jasa profesional eksternal.",
      ownerUserId: "usr_owner_yanmed",
      tags: ["dokter-kontrak", "profesional"],
      scores: [4, 3, 4, 4, 3, 3, 4, 2],
      assessment: "draft",
    },
  ];

  const nodeById = new Map(universeNodes.map((node) => [node.id, node]));

  function depthFor(node: UniverseNode): number {
    let depth = 0;
    let parentId = node.parentId;

    while (parentId) {
      depth += 1;
      parentId = nodeById.get(parentId)?.parentId ?? null;
    }

    return depth;
  }

  for (const [index, node] of universeNodes.entries()) {
    await prisma.auditEntity.upsert({
      where: { id: node.id },
      update: {
        parentId: node.parentId,
        code: node.code,
        name: node.name,
        type: node.type,
        description: node.description,
        ownerUserId: node.ownerUserId,
        tags: JSON.stringify(node.tags),
        depth: depthFor(node),
        sortOrder: index,
        status: "active",
        archivedAt: null,
      },
      create: {
        id: node.id,
        workspaceId,
        parentId: node.parentId,
        code: node.code,
        name: node.name,
        type: node.type,
        description: node.description,
        ownerUserId: node.ownerUserId,
        tags: JSON.stringify(node.tags),
        depth: depthFor(node),
        sortOrder: index,
        createdById: "usr_admin",
        updatedById: "usr_admin",
      },
    });
  }

  function scoresFor(node: UniverseNode): { code: string; weight: number; score: number }[] {
    if (!node.scores) {
      return [];
    }

    return factorDefinitions.map((factor, position) => ({
      code: factor.code,
      weight: factor.weight,
      score: node.scores![position],
    }));
  }

  for (const node of universeNodes) {
    if (!node.scores) {
      continue;
    }

    const factorScores = scoresFor(node);
    const inherent = calculateInherentScore(factorScores);
    const control = node.scores[7];
    const residual = calculateResidualScore({
      inherentScore: inherent,
      controlEffectivenessScore: control,
    });
    const level = riskLevelFor(residual, thresholds);
    const driver = topRiskDriver(
      factorScores.map((score) => ({
        code: score.code,
        label:
          factorDefinitions.find((factor) => factor.code === score.code)?.name ??
          score.code,
        weight: score.weight,
        score: score.score,
      })),
    );
    const status = node.assessment === "draft" ? "draft" : "approved";
    const approvedAt =
      status === "approved" ? new Date("2026-02-10T10:00:00Z") : null;

    await prisma.riskAssessment.upsert({
      where: { id: `ra_${node.id.slice(4)}` },
      update: {
        entityId: node.id,
        status,
        inherentScore: inherent,
        controlEffectivenessScore: control,
        residualScore: residual,
        riskLevel: level,
        assessedById: "usr_auditor",
        approvedById: status === "approved" ? "usr_cae" : null,
        submittedAt: status === "approved" ? new Date("2026-02-05T10:00:00Z") : null,
        approvedAt,
        calculatedAt: new Date("2026-02-01T10:00:00Z"),
        isCurrent: true,
      },
      create: {
        id: `ra_${node.id.slice(4)}`,
        workspaceId,
        entityId: node.id,
        cycleId,
        riskModelId,
        status,
        inherentScore: inherent,
        controlEffectivenessScore: control,
        residualScore: residual,
        riskLevel: level,
        rationale: `Penilaian 2026 atas ${node.name}; pendorong risiko utama ${driver?.label?.toLowerCase()} dengan skor ${driver?.score} dari 5, berdasarkan volume pelayanan, eksposur regulasi, dan diskusi dengan process owner.`,
        isCurrent: true,
        version: 1,
        assessedById: "usr_auditor",
        assessedAt: new Date("2026-02-01T10:00:00Z"),
        approvedById: status === "approved" ? "usr_cae" : null,
        approvedAt,
        submittedAt: status === "approved" ? new Date("2026-02-05T10:00:00Z") : null,
        calculatedAt: new Date("2026-02-01T10:00:00Z"),
        calculationVersion: "2026.1",
        createdById: "usr_auditor",
        updatedById: "usr_auditor",
      },
    });

    for (const { code, score } of factorScores) {
      const factor = factorDefinitions.find((candidate) => candidate.code === code)!;

      await prisma.riskFactorScore.upsert({
        where: {
          assessmentId_riskFactorId: {
            assessmentId: `ra_${node.id.slice(4)}`,
            riskFactorId: factor.id,
          },
        },
        update: { score },
        create: {
          assessmentId: `ra_${node.id.slice(4)}`,
          riskFactorId: factor.id,
          score,
          rationale: `Skor ${factor.name.toLowerCase()} untuk ${node.name} berdasarkan data pelayanan dan wawancara process owner.`,
        },
      });
    }

    if (status === "approved") {
      await prisma.riskAssessmentReview.upsert({
        where: { id: `rev_ra_${node.id.slice(4)}` },
        update: {},
        create: {
          id: `rev_ra_${node.id.slice(4)}`,
          assessmentId: `ra_${node.id.slice(4)}`,
          action: "approve",
          fromStatus: "submitted",
          toStatus: "approved",
          comment: "Disetujui untuk digunakan dalam risk ranking 2026.",
          actorId: "usr_cae",
          createdAt: approvedAt ?? new Date(),
        },
      });
    }
  }

  const planId = "plan_2026";
  await prisma.auditPlan.upsert({
    where: { id: planId },
    update: {
      name: "Rencana Audit Internal 2026",
      objective:
        "Memberikan assurance independen atas efektivitas pengendalian internal, manajemen risiko, dan tata kelola pelayanan rumah sakit.",
      scope:
        "Seluruh unit dalam audit universe RS 2026, diprioritaskan pada perbekalan farmasi, klaim JKN, SIMRS, dan pengelolaan rekanan.",
      status: "approved",
      isCurrent: true,
      approvedById: "usr_cae",
      approvedAt: new Date("2026-02-20T10:00:00Z"),
    },
    create: {
      id: planId,
      workspaceId,
      year: 2026,
      name: "Rencana Audit Internal 2026",
      objective:
        "Memberikan assurance independen atas efektivitas pengendalian internal, manajemen risiko, dan tata kelola pelayanan rumah sakit.",
      scope:
        "Seluruh unit dalam audit universe RS 2026, diprioritaskan pada perbekalan farmasi, klaim JKN, SIMRS, dan pengelolaan rekanan.",
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-12-31T23:59:59Z"),
      status: "approved",
      version: 1,
      isCurrent: true,
      ownerUserId: "usr_cae",
      createdById: "usr_manager",
      approvedById: "usr_cae",
      submittedAt: new Date("2026-02-15T10:00:00Z"),
      approvedAt: new Date("2026-02-20T10:00:00Z"),
    },
  });

  const capacities: { role: string; availableHours: number }[] = [
    { role: "CAE", availableHours: 120 },
    { role: "MANAGER", availableHours: 320 },
    { role: "AUDITOR", availableHours: 640 },
    { role: "REVIEWER", availableHours: 160 },
  ];

  for (const capacity of capacities) {
    if (!isPlanRole(capacity.role)) {
      throw new Error(`Seed: role ${capacity.role} bukan role perencanaan`);
    }

    await prisma.auditPlanCapacity.upsert({
      where: { planId_role: { planId, role: capacity.role } },
      update: { availableHours: capacity.availableHours },
      create: {
        planId,
        role: capacity.role,
        availableHours: capacity.availableHours,
      },
    });
  }

  const planEngagementSeeds = [
    {
      entityId: "ent_vendor",
      title: "Audit Master Rekanan & Pengadaan Perbekalan Farmasi",
      engagementType: "fraud",
      quarter: 1,
      actualHours: 40,
      status: "in_progress",
      allocations: [
        { role: "MANAGER", hours: 40 },
        { role: "AUDITOR", hours: 120 },
      ],
    },
    {
      entityId: "ent_p2p",
      title: "Audit Siklus Pengadaan sampai Pembayaran Utang Usaha",
      engagementType: "operational",
      quarter: 2,
      actualHours: 0,
      status: "planned",
      allocations: [
        { role: "MANAGER", hours: 24 },
        { role: "AUDITOR", hours: 96 },
      ],
    },
    {
      entityId: "ent_klaim",
      title: "Audit Siklus Pendapatan & Klaim JKN (INA-CBGs)",
      engagementType: "financial",
      quarter: 2,
      actualHours: 0,
      status: "planned",
      allocations: [{ role: "AUDITOR", hours: 80 }],
    },
    {
      entityId: "ent_payroll",
      title: "Audit Kepatuhan Penggajian & Jasa Pelayanan",
      engagementType: "compliance",
      quarter: 3,
      actualHours: 0,
      status: "planned",
      allocations: [
        { role: "MANAGER", hours: 24 },
        { role: "AUDITOR", hours: 96 },
      ],
    },
    {
      entityId: "ent_highalert",
      title: "Audit Penanganan Obat High-Alert & Narkotika",
      engagementType: "compliance",
      quarter: 4,
      actualHours: 0,
      status: "planned",
      allocations: [
        { role: "MANAGER", hours: 16 },
        { role: "AUDITOR", hours: 64 },
      ],
    },
  ];

  for (const [index, seed] of planEngagementSeeds.entries()) {
    const assessment = await prisma.riskAssessment.findFirst({
      where: {
        workspaceId,
        entityId: seed.entityId,
        status: "approved",
        isCurrent: true,
      },
      orderBy: { approvedAt: "desc" },
    });

    if (!assessment || assessment.residualScore === null || !assessment.riskLevel) {
      continue;
    }

    const estimatedHours = seed.allocations.reduce(
      (total, allocation) => total + allocation.hours,
      0,
    );

    const engagement = await prisma.auditPlanEngagement.upsert({
      where: { planId_entityId: { planId, entityId: seed.entityId } },
      update: {
        riskAssessmentId: assessment.id,
        title: seed.title,
        engagementType: seed.engagementType,
        quarter: seed.quarter,
        sourceRiskScore: assessment.residualScore,
        sourceRiskLevel: assessment.riskLevel,
        sourceRationale: assessment.rationale,
        riskScore: assessment.residualScore,
        riskLevel: assessment.riskLevel,
        estimatedHours,
        actualHours: seed.actualHours,
        status: seed.status,
        sortOrder: index,
      },
      create: {
        planId,
        entityId: seed.entityId,
        riskAssessmentId: assessment.id,
        title: seed.title,
        engagementType: seed.engagementType,
        quarter: seed.quarter,
        sourceRiskScore: assessment.residualScore,
        sourceRiskLevel: assessment.riskLevel,
        sourceRationale: assessment.rationale,
        riskScore: assessment.residualScore,
        riskLevel: assessment.riskLevel,
        estimatedHours,
        actualHours: seed.actualHours,
        status: seed.status,
        sortOrder: index,
      },
    });

    for (const allocation of seed.allocations) {
      await prisma.auditPlanAllocation.upsert({
        where: {
          engagementId_role: {
            engagementId: engagement.id,
            role: allocation.role,
          },
        },
        update: { estimatedHours: allocation.hours },
        create: {
          engagementId: engagement.id,
          role: allocation.role,
          estimatedHours: allocation.hours,
        },
      });
    }
  }

  const vendorPlanEngagement = await prisma.auditPlanEngagement.findUnique({
    where: { planId_entityId: { planId, entityId: "ent_vendor" } },
  });
  const pajakAssessment = await prisma.riskAssessment.findFirst({
    where: {
      workspaceId,
      entityId: "ent_pajak",
      status: "approved",
      isCurrent: true,
    },
    orderBy: { approvedAt: "desc" },
  });

  const engagementSeeds = [
    {
      code: "ENG-2026-001",
      title: "Audit Master Rekanan & Perbekalan Farmasi",
      engagementType: "financial",
      templateKey: "financial",
      entityId: "ent_vendor",
      planEngagementId: vendorPlanEngagement?.id ?? null,
      riskAssessmentId: vendorPlanEngagement?.riskAssessmentId ?? "ra_vendor",
      adHocReason: null,
      status: "fieldwork",
      startDate: new Date("2026-01-15T00:00:00Z"),
      endDate: new Date("2026-03-31T00:00:00Z"),
      budgetHours: 160,
      transitions: [
        {
          action: "advance",
          fromStatus: "draft",
          toStatus: "planning",
          note: "Planning kickoff disetujui Ketua Tim Audit.",
          actorId: "usr_manager",
          createdAt: new Date("2026-01-10T09:00:00Z"),
        },
        {
          action: "advance",
          fromStatus: "planning",
          toStatus: "fieldwork",
          note: "RCM lengkap; fieldwork pada Instalasi Farmasi dan Bagian Umum dimulai.",
          actorId: "usr_auditor",
          createdAt: new Date("2026-01-20T09:00:00Z"),
        },
      ],
    },
    {
      code: "ENG-2026-002",
      title: "Review Kepatuhan Perpajakan RS & Klaim Jasa Medis",
      engagementType: "compliance",
      templateKey: "compliance",
      entityId: "ent_pajak",
      planEngagementId: null,
      riskAssessmentId: pajakAssessment?.id ?? null,
      adHocReason:
        "Permintaan Komite Audit Dewan Pengawas atas keterlambatan setor PPh 21 jasa dokter masa Q2 2026.",
      status: "planning",
      startDate: new Date("2026-05-01T00:00:00Z"),
      endDate: new Date("2026-06-30T00:00:00Z"),
      budgetHours: 80,
      transitions: [
        {
          action: "advance",
          fromStatus: "draft",
          toStatus: "planning",
          note: "Disetujui sebagai review insidental oleh Kepala SPI.",
          actorId: "usr_cae",
          createdAt: new Date("2026-04-28T09:00:00Z"),
        },
      ],
    },
  ];

  for (const seed of engagementSeeds) {
    const template = instantiateTemplate(seed.templateKey);
    const existing = await prisma.engagement.findUnique({
      where: { workspaceId_code: { workspaceId, code: seed.code } },
    });

    if (existing) {
      await prisma.engagement.update({
        where: { id: existing.id },
        data: {
          title: seed.title,
          objective: template.objective,
          scope: template.scope,
          entityId: seed.entityId,
          riskAssessmentId: seed.riskAssessmentId,
          planEngagementId: seed.planEngagementId,
          adHocReason: seed.adHocReason,
          startDate: seed.startDate,
          endDate: seed.endDate,
          budgetHours: seed.budgetHours,
        },
      });
      continue;
    }

    await prisma.engagement.create({
      data: {
        workspaceId,
        code: seed.code,
        title: seed.title,
        engagementType: seed.engagementType,
        templateKey: seed.templateKey,
        objective: template.objective,
        scope: template.scope,
        status: seed.status,
        entityId: seed.entityId,
        riskAssessmentId: seed.riskAssessmentId,
        planEngagementId: seed.planEngagementId,
        adHocReason: seed.adHocReason,
        startDate: seed.startDate,
        endDate: seed.endDate,
        budgetHours: seed.budgetHours,
        preparerId: "usr_auditor",
        reviewerId: "usr_manager",
        approverId: "usr_cae",
        createdById: "usr_manager",
        updatedById: "usr_manager",
        rcmRows: {
          create: template.rows.map((row, index) => ({
            ...row,
            sortOrder: index,
          })),
        },
        transitions: {
          create: seed.transitions,
        },
      },
    });
  }

  const vendorEngagement = await prisma.engagement.findUnique({
    where: { workspaceId_code: { workspaceId, code: "ENG-2026-001" } },
    include: { rcmRows: { orderBy: { sortOrder: "asc" } } },
  });

  if (vendorEngagement) {
    const rowA = vendorEngagement.rcmRows[0]?.id ?? null;
    const rowB = vendorEngagement.rcmRows[1]?.id ?? null;
    const preparerId = vendorEngagement.preparerId;
    const reviewerId = vendorEngagement.reviewerId;
    const reviewerName =
      users.find((user) => user.id === reviewerId)?.name ?? "Reviewer";

    const wpControl = await seedWorkpaper({
      id: "wp_vendor_001",
      engagementId: vendorEngagement.id,
      reference: "WP-001",
      templateKey: "test_of_control",
      rcmRowId: rowA,
      status: "signed_off",
      version: 4,
      conclusion:
        "Pengendalian approval master rekanan berjalan efektif. Tiga dari 25 perubahan tidak memiliki bukti approval lapis kedua, seluruhnya sudah dikoreksi sebelum data rekanan aktif. Tidak ada dampak terhadap reliance pengendalian.",
      preparerId,
      reviewerId,
      createdById: preparerId,
      submittedAt: new Date("2026-02-04T09:00:00Z"),
      reviewedAt: new Date("2026-02-09T16:00:00Z"),
      signoff: {
        at: new Date("2026-02-11T08:30:00Z"),
        userId: reviewerId,
        userName: reviewerName,
      },
    });

    await seedEvidence({
      id: "evf_vendor_matrix_v1",
      engagementId: vendorEngagement.id,
      workpaperId: wpControl,
      rcmRowId: rowA,
      label: "Matriks approval perubahan master rekanan",
      fileName: "matriks-approval-master-rekanan.csv",
      mimeType: "text/csv",
      source: "client_system",
      periodLabel: "Q1 2026",
      capturedAt: new Date("2026-02-02T00:00:00Z"),
      version: 1,
      uploadedById: preparerId,
      createdAt: new Date("2026-02-02T10:00:00Z"),
      content:
        "vendor_id,nama_rekanan,diubah_oleh,disetujui_oleh,tanggal_perubahan\n2001,PT Farmasi Nusantara Sentosa,ADM,KA-UMUM,2026-01-08\n2002,CV Alkes Medika Prima,sis,ADM,2026-01-12\n2003,PT Bina Sanitaria,ADM,KEU,2026-01-19\n",
    });

    await seedEvidence({
      id: "evf_vendor_matrix_v2",
      engagementId: vendorEngagement.id,
      workpaperId: wpControl,
      rcmRowId: rowA,
      label: "Matriks approval perubahan master rekanan",
      fileName: "matriks-approval-master-rekanan.csv",
      mimeType: "text/csv",
      source: "client_system",
      periodLabel: "Q1 2026",
      capturedAt: new Date("2026-02-06T00:00:00Z"),
      version: 2,
      supersedesId: "evf_vendor_matrix_v1",
      uploadedById: preparerId,
      createdAt: new Date("2026-02-06T14:20:00Z"),
      content:
        "vendor_id,nama_rekanan,diubah_oleh,disetujui_oleh,tanggal_perubahan\n2001,PT Farmasi Nusantara Sentosa,ADM,KA-UMUM,2026-01-08\n2002,CV Alkes Medika Prima,sis,ADM,2026-01-12\n2003,PT Bina Sanitaria,ADM,KEU,2026-01-19\n2004,CV Cipta Reagen Lab,sis,KEU,2026-01-27\n",
    });

    await seedEvidence({
      id: "evf_vendor_reperformance",
      engagementId: vendorEngagement.id,
      workpaperId: wpControl,
      rcmRowId: rowA,
      label: "Reperformance approval tiga rekanan baru",
      fileName: "reperformance-approval-rekanan.txt",
      mimeType: "text/plain",
      source: "reperformance",
      periodLabel: "Q1 2026",
      capturedAt: new Date("2026-02-05T00:00:00Z"),
      version: 1,
      uploadedById: preparerId,
      createdAt: new Date("2026-02-05T09:10:00Z"),
      content:
        "Reperformance oleh Sinta Maharani pada 5 Februari 2026.\nRekanan 2001: approval lapis dua tercatat pada sistem, cocok dengan naskah kontrak.\nRekanan 2002: tidak ada approval lapis dua saat perubahan, dikoreksi 15 Januari 2026.\nRekanan 2003: approval lengkap.\n",
    });

    await seedNote({
      id: "wpn_vendor_001",
      workpaperId: wpControl,
      body: "Perluas sampel rekanan 2002-2004 dan lampirkan bukti koreksi atas perubahan tanpa approval lapis kedua.",
      severity: "minor",
      authorId: reviewerId,
      assigneeId: preparerId,
      createdAt: new Date("2026-02-09T16:10:00Z"),
      resolution:
        "Bukti koreksi dan matriks versi 2 sudah dilampirkan pada workpaper ini.",
      resolvedById: preparerId,
      resolvedAt: new Date("2026-02-10T09:00:00Z"),
    });

    const wpSubstantive = await seedWorkpaper({
      id: "wp_vendor_002",
      engagementId: vendorEngagement.id,
      reference: "WP-002",
      templateKey: "substantive_test",
      rcmRowId: rowB,
      status: "in_review",
      version: 2,
      conclusion:
        "Saldo utang usaha ke rekanan yang diuji cocok dengan buku besar. Dua faktur perbekalan farmasi belum terkonfirmasi dan masih dalam proses call-back.",
      preparerId,
      reviewerId,
      createdById: preparerId,
      submittedAt: new Date("2026-02-18T09:00:00Z"),
    });

    await seedEvidence({
      id: "evf_vendor_callbak",
      engagementId: vendorEngagement.id,
      workpaperId: wpSubstantive,
      rcmRowId: rowB,
      label: "Call-back konfirmasi saldo rekanan",
      fileName: "call-back-konfirmasi-rekanan.txt",
      mimeType: "text/plain",
      source: "interview",
      periodLabel: "Per 31 Januari 2026",
      capturedAt: new Date("2026-02-17T00:00:00Z"),
      version: 1,
      uploadedById: preparerId,
      createdAt: new Date("2026-02-17T15:40:00Z"),
      content:
        "Telepon dengan Bagian Utang Usaha, 17 Februari 2026.\nDua saldo dalam dispute karena potongan harga yang belum dibukukan.\n",
    });

    await seedNote({
      id: "wpn_vendor_002",
      workpaperId: wpSubstantive,
      body: "Konfirmasi tertulis belum diperoleh untuk dua saldo material. Lampirkan respons rekanan sebelum sign-off.",
      severity: "blocking",
      authorId: reviewerId,
      assigneeId: preparerId,
      createdAt: new Date("2026-02-19T08:30:00Z"),
    });

    await seedWorkpaper({
      id: "wp_vendor_003",
      engagementId: vendorEngagement.id,
      reference: "WP-003",
      templateKey: "analytical_review",
      status: "draft",
      version: 1,
      preparerId,
      reviewerId,
      createdById: preparerId,
    });
  }

  const taxEngagement = await prisma.engagement.findUnique({
    where: { workspaceId_code: { workspaceId, code: "ENG-2026-002" } },
    include: { rcmRows: { orderBy: { sortOrder: "asc" } } },
  });

  if (taxEngagement) {
    await seedWorkpaper({
      id: "wp_tax_001",
      engagementId: taxEngagement.id,
      reference: "WP-001",
      templateKey: "test_of_control",
      rcmRowId: taxEngagement.rcmRows[0]?.id ?? null,
      status: "draft",
      version: 1,
      preparerId: taxEngagement.preparerId,
      reviewerId: taxEngagement.reviewerId,
      createdById: taxEngagement.preparerId,
    });
  }

  if (vendorEngagement) {
    const vendorWorkpapers = await prisma.workpaper.findMany({
      where: { engagementId: vendorEngagement.id },
    });
    const wpControl =
      vendorWorkpapers.find((row) => row.reference === "WP-001")?.id ?? null;
    const wpSubstantive =
      vendorWorkpapers.find((row) => row.reference === "WP-002")?.id ?? null;
    const wpAnalytical =
      vendorWorkpapers.find((row) => row.reference === "WP-003")?.id ?? null;
    const rowA = vendorEngagement.rcmRows[0]?.id ?? null;
    const rowB = vendorEngagement.rcmRows[1]?.id ?? null;

    await seedFinding({
      id: "fnd_vendor_001",
      engagementId: vendorEngagement.id,
      reference: "TD-001",
      title: "Perubahan master rekanan tanpa approval lapis kedua",
      condition:
        "Tiga dari 25 perubahan data master rekanan pada Q1 2026 tidak memiliki bukti approval lapis kedua, baik pada log SIMRS maupun berkas pengadaan.",
      criteria:
        "Peraturan Direksi RS No. PD-04 tentang Tata Kelola Pengadaan mengatur approval berlapis untuk setiap perubahan data master rekanan, termasuk perubahan nama dan rekening bank.",
      cause:
        "Peran approver kedua belum diaktifkan pada modul master rekanan karena template peran disalin dari konfigurasi lama yang hanya mengenal satu tingkat approval.",
      effect:
        "Perubahan rekening bank rekanan dapat lolos tanpa deteksi, membuka celah pembayaran kepada pihak yang tidak berhak.",
      recommendation:
        "Aktifkan validasi dua tingkat pada modul master rekanan untuk seluruh unit pengguna dan tambahkan laporan pengecualian mingguan.",
      severity: "high",
      status: "in_remediation",
      progressPercent: 40,
      version: 3,
      workpaperId: wpControl,
      rcmRowId: rowA,
      ownerUserId: "usr_owner_umum",
      dueDate: new Date("2026-11-30T00:00:00Z"),
      managementResponse:
        "Manajemen menerima temuan dan mengakui konfigurasi peran belum seragam di Instalasi Farmasi, Gudang, dan Bagian Umum.",
      plannedAction:
        "Rollout konfigurasi dua tingkat approval dilakukan bertahap per unit pengguna, disertai laporan pengecualian otomatis mingguan yang dikirim ke Bagian Keuangan.",
      createdById: "usr_auditor",
      createdAt: new Date("2026-02-20T09:00:00Z"),
      communicatedAt: new Date("2026-02-24T08:00:00Z"),
      remediationStartedAt: new Date("2026-03-02T07:30:00Z"),
      evidenceIds: ["evf_vendor_matrix_v2"],
      updates: [
        {
          id: "fdu_vendor_001_1",
          body: "Konfigurasi peran approver kedua sudah diverifikasi untuk Bagian Umum dan Instalasi Farmasi.",
          statusFrom: "communicated",
          statusTo: "in_remediation",
          progressPercent: 15,
          authorId: "usr_owner_umum",
          createdAt: new Date("2026-03-02T07:30:00Z"),
        },
        {
          id: "fdu_vendor_001_2",
          body:
            "Rollout masuk rilis SIMRS 2.14 dan sudah aktif di enam dari sembilan unit pengguna. Sisa tiga unit dijadwalkan pada rilis 2.15 November 2026.",
          statusFrom: "in_remediation",
          statusTo: "in_remediation",
          progressPercent: 40,
          authorId: "usr_owner_umum",
          createdAt: new Date("2026-09-18T10:20:00Z"),
        },
      ],
    });

    await seedFinding({
      id: "fnd_vendor_002",
      engagementId: vendorEngagement.id,
      reference: "TD-002",
      title: "Perubahan rekening bank rekanan tanpa call-back konfirmasi",
      condition:
        "Dua perubahan rekening bank rekanan bernilai material dilakukan pada hari yang sama tanpa bukti call-back konfirmasi ke kontak independen rekanan.",
      criteria:
        "SOP AP-07 Konfirmasi Rekening Rekanan mewajibkan call-back dan penyimpanan bukti rekaman sebelum rekening baru dapat dibayar.",
      cause:
        "Proses call-back masih manual dan tidak terhubung dengan tiket perubahan, sehingga tidak ada penghalang sistem saat konfirmasi belum dilakukan.",
      effect:
        "Eksposur pengalihan pembayaran diperkirakan Rp 18,4 miliar per tahun atas rekanan dengan riwayat perubahan rekening.",
      recommendation:
        "Integrasikan tiket call-back dengan modul master rekanan dan blokir pembayaran pertama ke rekening baru sampai konfirmasi terekam.",
      severity: "critical",
      status: "pending_validation",
      progressPercent: 100,
      version: 4,
      workpaperId: wpControl,
      rcmRowId: rowA,
      ownerUserId: "usr_owner_umum",
      dueDate: new Date("2026-09-30T00:00:00Z"),
      managementResponse:
        "Manajemen setuju bahwa pengendalian manual tidak cukup untuk perubahan rekening bank rekanan.",
      plannedAction:
        "Pembayaran ke rekening baru diblokir otomatis sampai tiket call-back tertutup; integrasi rilis 2.15 dan telah diuji bersama Unit SIMRS.",
      createdById: "usr_auditor",
      createdAt: new Date("2026-02-20T09:10:00Z"),
      communicatedAt: new Date("2026-02-24T08:05:00Z"),
      remediationStartedAt: new Date("2026-03-05T09:00:00Z"),
      validationSubmittedAt: new Date("2026-10-15T14:00:00Z"),
      updates: [
        {
          id: "fdu_vendor_002_1",
          body:
            "Blokir pembayaran sementara diimplementasikan lewat konfigurasi payment hold dan sudah menahan tiga pembayaran ke rekening baru.",
          statusFrom: "in_remediation",
          statusTo: "in_remediation",
          progressPercent: 90,
          authorId: "usr_owner_umum",
          createdAt: new Date("2026-09-25T11:00:00Z"),
        },
        {
          id: "fdu_vendor_002_2",
          body:
            "Perbaikan permanen rilis 2.15 selesai diuji. Permohonan validasi penutupan diajukan dengan lampiran hasil UAT.",
          statusFrom: "in_remediation",
          statusTo: "pending_validation",
          progressPercent: 100,
          authorId: "usr_owner_umum",
          createdAt: new Date("2026-10-15T14:00:00Z"),
        },
      ],
    });

    await seedFinding({
      id: "fnd_vendor_003",
      engagementId: vendorEngagement.id,
      reference: "TD-003",
      title: "Duplikasi record rekanan pada master file",
      condition:
        "Tujuh belas pasangan rekanan dengan NPWP dan alamat yang sama terdaftar sebagai dua record aktif pada master file SIMRS.",
      criteria:
        "Standar Data Master PD-02 menetapkan satu rekanan untuk satu record aktif.",
      cause:
        "Proses onboarding tidak memvalidasi kombinasi NPWP dan nama sebagai kunci unik sehingga duplikasi lolos.",
      effect:
        "Laporan umur utang usaha tidak akurat dan terdapat risiko pembayaran ganda atas rekanan yang sama.",
      recommendation:
        "Lakukan pembersihan data duplikat dan aktifkan aturan validasi unik NPWP dan nama pada saat onboarding rekanan.",
      severity: "medium",
      status: "closed",
      progressPercent: 100,
      version: 5,
      workpaperId: wpSubstantive,
      rcmRowId: rowB,
      ownerUserId: "usr_owner_umum",
      dueDate: new Date("2026-08-31T00:00:00Z"),
      managementResponse:
        "Manajemen menerima temuan dan menjadwalkan pembersihan data bersama Unit SIMRS.",
      plannedAction:
        "Gabungkan record duplikat, lalu aktifkan aturan unik NPWP dan nama pada modul onboarding rekanan.",
      createdById: "usr_auditor",
      createdAt: new Date("2026-02-20T09:20:00Z"),
      communicatedAt: new Date("2026-02-24T08:10:00Z"),
      remediationStartedAt: new Date("2026-03-10T08:00:00Z"),
      validationSubmittedAt: new Date("2026-09-05T09:00:00Z"),
      closedAt: new Date("2026-09-15T10:00:00Z"),
      validatedById: "usr_manager",
      updates: [
        {
          id: "fdu_vendor_003_1",
          body:
            "Sebanyak 34 record duplikat telah digabung dan aturan validasi unik NPWP dan nama aktif di modul onboarding.",
          statusFrom: "in_remediation",
          statusTo: "pending_validation",
          progressPercent: 100,
          authorId: "usr_owner_umum",
          createdAt: new Date("2026-09-05T09:00:00Z"),
        },
        {
          id: "fdu_vendor_003_2",
          body:
            "Validasi selesai: pengujian ulang atas 10 sampel onboarding rekanan tidak menemukan duplikasi baru. Temuan dinyatakan selesai.",
          statusFrom: "pending_validation",
          statusTo: "closed",
          progressPercent: 100,
          authorId: "usr_manager",
          createdAt: new Date("2026-09-15T10:00:00Z"),
        },
      ],
    });

    await seedFinding({
      id: "fnd_vendor_004",
      engagementId: vendorEngagement.id,
      reference: "TD-004",
      title: "Hak ubah master rekanan masih dipegang satu pegawai di dua unit",
      condition:
        "Instalasi Farmasi dan Gudang, dengan total 40 rekanan aktif, hanya memiliki satu pegawai yang berhak mengubah data master rekanan.",
      criteria:
        "Matriks risiko P2P RS menetapkan pemisahan fungsi antara pengusul, pengubah, dan penyetuju data master.",
      cause:
        "Keterbatasan pegawai administrasi pada unit kecil membuat fungsi pengusul dan pengubah dirangkap satu orang.",
      effect:
        "Perubahan master pada dua unit tersebut tidak dapat dideteksi secara independen di tingkat unit.",
      recommendation:
        "Migrasikan hak ubah master rekanan ke Bagian Umum sehingga unit hanya mengajukan usulan perubahan.",
      severity: "high",
      status: "accepted_risk",
      progressPercent: 60,
      version: 4,
      workpaperId: wpControl,
      rcmRowId: rowA,
      ownerUserId: "usr_owner_umum",
      dueDate: new Date("2026-10-01T00:00:00Z"),
      managementResponse:
        "Manajemen unit menyampaikan bahwa pemisahan fungsi memerlukan satu tambahan pegawai administrasi yang dianggarkan pada 2027.",
      plannedAction:
        "Migrasi hak ubah ke Bagian Umum direncanakan bertahap mulai Q1 2027.",
      riskJustification:
        "Manajemen menerima residual risiko sampai migrasi ke Bagian Umum selesai Q1 2027. Compensating control berupa review laporan perubahan master rekanan mingguan oleh Bagian Keuangan telah berjalan dua kuartal tanpa pengecualian, dan Kepala SPI mencatat penerimaan risiko ini untuk dipantau pada QAIP kuartal berikutnya.",
      createdById: "usr_auditor",
      createdAt: new Date("2026-02-20T09:30:00Z"),
      communicatedAt: new Date("2026-02-24T08:15:00Z"),
      remediationStartedAt: new Date("2026-04-01T08:00:00Z"),
      riskAcceptedAt: new Date("2026-10-05T15:30:00Z"),
      riskAcceptedById: "usr_cae",
      updates: [
        {
          id: "fdu_vendor_004_1",
          body:
            "Review mingguan laporan perubahan master oleh Bagian Keuangan berjalan sejak April 2026 tanpa pengecualian.",
          statusFrom: "in_remediation",
          statusTo: "in_remediation",
          progressPercent: 60,
          authorId: "usr_owner_umum",
          createdAt: new Date("2026-09-20T09:00:00Z"),
        },
        {
          id: "fdu_vendor_004_2",
          body:
            "Residual risiko diterima dengan compensating control; pemantauan lanjutan ditetapkan pada kuartal I 2027.",
          statusFrom: "in_remediation",
          statusTo: "accepted_risk",
          progressPercent: 60,
          authorId: "usr_cae",
          createdAt: new Date("2026-10-05T15:30:00Z"),
        },
      ],
    });

    await seedFinding({
      id: "fnd_vendor_005",
      engagementId: vendorEngagement.id,
      reference: "TD-005",
      title: "Anomali konsentrasi pembelian pada rekanan baru",
      condition:
        "Enam rekanan baru menyumbang 34 persen dari nilai pembelian perbekalan Maret 2026, melebihi ambang 20 persen untuk pengujian tambahan.",
      criteria:
        "Peraturan Direksi PD-04 mewajibkan pengujian tambahan atas rekanan baru yang melampaui kontribusi 20 persen nilai pembelian bulanan.",
      severity: "medium",
      status: "draft",
      version: 1,
      workpaperId: wpAnalytical,
      rcmRowId: rowB,
      createdById: "usr_auditor",
      createdAt: new Date("2026-10-20T13:00:00Z"),
    });

    await seedFinding({
      id: "fnd_vendor_006",
      engagementId: vendorEngagement.id,
      reference: "TD-006",
      title: "Dokumen pendukung onboarding rekanan tidak lengkap",
      condition:
        "Sembilan dari dua puluh rekanan baru tidak memiliki kontrak kerja dan verifikasi NPWP pada berkas onboarding.",
      criteria:
        "SOP PRC-09 Kelengkapan Berkas Rekanan mewajibkan seluruh dokumen tersedia sebelum rekanan berstatus aktif.",
      cause:
        "Checklist onboarding dapat dilewati oleh peran Petugas Pengadaan tanpa persetujuan penyelia.",
      effect:
        "Rekanan tanpa dokumen sah dapat menerima pembelian, meningkatkan risiko ketidakpatuhan dan sengketa kontrak.",
      recommendation:
        "Kunci status rekanan aktif sampai seluruh dokumen wajib terunggah dan tervalidasi oleh penyelia pengadaan.",
      severity: "high",
      status: "communicated",
      version: 2,
      workpaperId: wpSubstantive,
      rcmRowId: rowB,
      ownerUserId: "usr_owner_umum",
      dueDate: new Date("2026-10-10T00:00:00Z"),
      managementResponse:
        "Manajemen mengakui checklist onboarding dapat dilewati dan akan menyesuaikan konfigurasi peran.",
      plannedAction:
        "Menambah validasi dokumen wajib pada modul master rekanan dan menugaskan penyelia pengadaan sebagai penyetuju akhir.",
      createdById: "usr_auditor",
      createdAt: new Date("2026-08-05T08:00:00Z"),
      communicatedAt: new Date("2026-08-08T07:30:00Z"),
      updates: [
        {
          id: "fdu_vendor_006_1",
          body:
            "Temuan dan rencana perbaikan disampaikan pada rapat triwulan bersama Bagian Umum, Instalasi Farmasi, dan Unit SIMRS.",
          statusFrom: "draft",
          statusTo: "communicated",
          progressPercent: 0,
          authorId: "usr_auditor",
          createdAt: new Date("2026-08-08T07:30:00Z"),
        },
      ],
    });

    await seedFinding({
      id: "fnd_vendor_007",
      engagementId: vendorEngagement.id,
      reference: "TD-007",
      title: "Blokir perubahan master di luar jam kerja belum berfungsi penuh",
      condition:
        "Pengujian ulang menemukan dua dari lima perubahan di luar jam kerja tetap tersimpan tanpa entri pada log override.",
      criteria:
        "Matriks risiko P2P RS mewajibkan perubahan di luar jam kerja tercatat dan disetujui penyelia.",
      cause:
        "Aturan pemblokiran hanya dipasang pada layar aplikasi, bukan pada antarmuka integrasi yang dipakai batch job SIMRS.",
      effect:
        "Perubahan luar jam kerja dapat terjadi tanpa jejak approval, menghambat deteksi dan investigasi.",
      recommendation:
        "Pasang validasi pemblokiran pada lapisan layanan dan tambahkan laporan harian override untuk direview penyelia pengadaan.",
      severity: "medium",
      status: "reopened",
      progressPercent: 70,
      version: 4,
      workpaperId: wpControl,
      rcmRowId: rowA,
      ownerUserId: "usr_owner_umum",
      dueDate: new Date("2026-09-01T00:00:00Z"),
      managementResponse:
        "Manajemen menyetujui perbaikan pada lapisan layanan dan menambahkan pelaporan override harian.",
      plannedAction:
        "Validasi dipindahkan ke service layer dan laporan override harian dikirim ke penyelia pengadaan.",
      createdById: "usr_auditor",
      createdAt: new Date("2026-05-12T09:00:00Z"),
      communicatedAt: new Date("2026-05-15T08:00:00Z"),
      remediationStartedAt: new Date("2026-05-20T08:00:00Z"),
      validationSubmittedAt: new Date("2026-08-28T10:00:00Z"),
      reopenedAt: new Date("2026-10-08T09:30:00Z"),
      updates: [
        {
          id: "fdu_vendor_007_1",
          body:
            "Validasi service layer selesai diuji dan laporan override harian sudah berjalan sejak Agustus 2026.",
          statusFrom: "in_remediation",
          statusTo: "pending_validation",
          progressPercent: 100,
          authorId: "usr_owner_umum",
          createdAt: new Date("2026-08-28T10:00:00Z"),
        },
        {
          id: "fdu_vendor_007_2",
          body:
            "Ditolak saat validasi: perubahan melalui batch job masih lolos tanpa log override. Lampirkan hasil pengujian ulang pada kanal integrasi.",
          statusFrom: "pending_validation",
          statusTo: "reopened",
          progressPercent: 70,
          authorId: "usr_manager",
          createdAt: new Date("2026-10-08T09:30:00Z"),
        },
      ],
    });
  }

  if (taxEngagement) {
    const taxWp = await prisma.workpaper.findFirst({
      where: { engagementId: taxEngagement.id, reference: "WP-001" },
    });

    await seedFinding({
      id: "fnd_tax_001",
      engagementId: taxEngagement.id,
      reference: "TD-001",
      title: "Keterlambatan setor PPh 21 jasa dokter tanpa jurnal penyesuaian",
      condition:
        "Setor PPh 21 atas jasa dokter masa Mei 2026 terlambat 11 hari dan sanksi bunga tidak dibukukan sebagai jurnal penyesuaian.",
      criteria:
        "Peraturan DJP menetapkan penyetoran paling lambat akhir bulan berikutnya, dan kebijakan akuntansi RS mengharuskan beban bunga dikenali saat terjadi.",
      cause:
        "Rekonsiliasi pajak-payroll dijalankan manual tanpa kalender tenggat pada modul GL.",
      effect:
        "Beban bunga terlambat sebesar Rp 42,7 juta tidak dikenali pada Q2 2026 dan expose RS pada sanksi administrasi berulang.",
      recommendation:
        "Pasang kalender tenggat kepatuhan pada modul GL dan otomatiskan jurnal pengakuan bunga sanksi pajak.",
      severity: "critical",
      status: "in_remediation",
      progressPercent: 25,
      version: 3,
      workpaperId: taxWp?.id ?? null,
      rcmRowId: taxEngagement.rcmRows[0]?.id ?? null,
      ownerUserId: "usr_owner_keuangan",
      dueDate: new Date("2026-06-01T00:00:00Z"),
      managementResponse:
        "Manajemen mengakui ketergantungan pada rekonsiliasi manual dan menyetujui otomatisasi tenggat.",
      plannedAction:
        "Menambahkan kalender tenggat kepatuhan di modul GL dan template jurnal otomatis untuk sanksi pajak.",
      createdById: "usr_cae",
      createdAt: new Date("2026-05-20T08:00:00Z"),
      communicatedAt: new Date("2026-05-25T07:00:00Z"),
      remediationStartedAt: new Date("2026-06-10T08:00:00Z"),
      updates: [
        {
          id: "fdu_tax_001_1",
          body:
            "Kalender tenggat kepatuhan baru dipasang untuk tiga jenis pajak utama; otomatisasi jurnal masih dalam analisis.",
          statusFrom: "communicated",
          statusTo: "in_remediation",
          progressPercent: 25,
          authorId: "usr_owner_keuangan",
          createdAt: new Date("2026-06-10T08:00:00Z"),
        },
      ],
    });

    await seedFinding({
      id: "fnd_tax_002",
      engagementId: taxEngagement.id,
      reference: "TD-002",
      title: "Faktur pajak masukan perbekalan tidak direkonsiliasi dengan GL",
      condition:
        "Empat faktur pajak masukan atas perbekalan farmasi yang dikreditkan pada Q2 2026 tidak memiliki padanan pada akun pajak dibayar di muka.",
      criteria:
        "Proses PAJ-02 mewajibkan rekonsiliasi faktur pajak masukan dengan GL setiap masa pajak.",
      cause: "",
      effect: "",
      recommendation: "",
      severity: "low",
      status: "draft",
      version: 1,
      workpaperId: taxWp?.id ?? null,
      rcmRowId: taxEngagement.rcmRows[1]?.id ?? null,
      createdById: "usr_cae",
      createdAt: new Date("2026-10-21T09:00:00Z"),
    });
  }

  const demoEvents = [
    {
      id: "evt_seed_1",
      action: "assessment.approved",
      objectType: "risk_assessment",
      objectId: "ra_p2p",
      actorId: "usr_cae",
      createdAt: new Date("2026-02-10T10:00:00Z"),
    },
    {
      id: "evt_seed_2",
      action: "assessment.approved",
      objectType: "risk_assessment",
      objectId: "ra_vendor",
      actorId: "usr_cae",
      createdAt: new Date("2026-02-10T10:05:00Z"),
    },
    {
      id: "evt_seed_3",
      action: "assessment.created",
      objectType: "risk_assessment",
      objectId: "ra_itgc",
      actorId: "usr_auditor",
      createdAt: new Date("2026-02-12T08:30:00Z"),
    },
    {
      id: "evt_seed_4",
      action: "audit_entity.created",
      objectType: "audit_entity",
      objectId: "ent_farmasi",
      actorId: "usr_admin",
      createdAt: new Date("2026-01-20T09:00:00Z"),
    },
    {
      id: "evt_seed_plan_1",
      action: "plan.approved",
      objectType: "audit_plan",
      objectId: planId,
      actorId: "usr_cae",
      createdAt: new Date("2026-02-20T10:00:00Z"),
    },
    {
      id: "evt_seed_engagement_1",
      action: "engagement.created",
      objectType: "engagement",
      objectId: "ENG-2026-001",
      actorId: "usr_manager",
      createdAt: new Date("2026-01-05T09:00:00Z"),
    },
    {
      id: "evt_seed_engagement_2",
      action: "engagement.created",
      objectType: "engagement",
      objectId: "ENG-2026-002",
      actorId: "usr_cae",
      createdAt: new Date("2026-04-25T09:00:00Z"),
    },
    {
      id: "evt_seed_workpaper_1",
      action: "workpaper.created",
      objectType: "workpaper",
      objectId: "wp_vendor_001",
      actorId: "usr_auditor",
      createdAt: new Date("2026-02-02T09:00:00Z"),
    },
    {
      id: "evt_seed_workpaper_2",
      action: "workpaper.signed_off",
      objectType: "workpaper",
      objectId: "wp_vendor_001",
      actorId: "usr_manager",
      createdAt: new Date("2026-02-11T08:30:00Z"),
    },
    {
      id: "evt_seed_evidence_1",
      action: "evidence.uploaded",
      objectType: "evidence_file",
      objectId: "evf_vendor_matrix_v2",
      actorId: "usr_auditor",
      createdAt: new Date("2026-02-06T14:20:00Z"),
    },
    {
      id: "evt_seed_finding_1",
      action: "finding.communicated",
      objectType: "finding",
      objectId: "fnd_vendor_001",
      actorId: "usr_auditor",
      createdAt: new Date("2026-02-24T08:00:00Z"),
    },
    {
      id: "evt_seed_finding_2",
      action: "finding.closed",
      objectType: "finding",
      objectId: "fnd_vendor_003",
      actorId: "usr_manager",
      createdAt: new Date("2026-09-15T10:00:00Z"),
    },
    {
      id: "evt_seed_finding_3",
      action: "finding.risk_accepted",
      objectType: "finding",
      objectId: "fnd_vendor_004",
      actorId: "usr_cae",
      createdAt: new Date("2026-10-05T15:30:00Z"),
    },
    {
      id: "evt_seed_finding_4",
      action: "finding.reopened",
      objectType: "finding",
      objectId: "fnd_vendor_007",
      actorId: "usr_manager",
      createdAt: new Date("2026-10-08T09:30:00Z"),
    },
  ];

  for (const event of demoEvents) {
    await prisma.auditEvent.upsert({
      where: { id: event.id },
      update: { objectId: event.objectId },
      create: {
        ...event,
        workspaceId,
        after: JSON.stringify({ seeded: true }),
      },
    });
  }

  console.log("Seed complete: demo@demo.local users use Password123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
