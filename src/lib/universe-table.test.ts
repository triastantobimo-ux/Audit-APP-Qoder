import { describe, expect, it } from "vitest";
import {
  buildUniverseCsv,
  buildUniverseQuery,
  nextSortState,
  parseSortDirection,
  parseSortKey,
  parseUniverseQuery,
  resolveViewMode,
  riskBarWidth,
  riskLevelRank,
  sortUniverseRows,
  topRiskDriver,
  type RiskDriver,
  type UniverseTableRow,
} from "./universe-table";

export function row(
  id: string,
  overrides: Partial<UniverseTableRow> = {},
): UniverseTableRow {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    type: "business_process",
    status: "active",
    depth: 1,
    sortOrder: 0,
    ownerName: null,
    assessmentState: "none",
    currentAssessment: null,
    ...overrides,
  };
}

function assessed(
  id: string,
  input: {
    inherent?: number | null;
    control?: number | null;
    residual?: number | null;
    riskLevel?: string | null;
    approvedAt?: string | null;
    status?: string;
    type?: string;
    driver?: RiskDriver | null;
  },
): UniverseTableRow {
  const approved = (input.status ?? "approved") === "approved";

  return row(id, {
    type: input.type ?? "business_process",
    assessmentState: approved ? "approved" : "pending",
    currentAssessment: {
      id: `ra_${id}`,
      status: input.status ?? "approved",
      inherentScore: input.inherent ?? null,
      controlEffectivenessScore: input.control ?? null,
      residualScore: input.residual ?? null,
      riskLevel: input.riskLevel ?? null,
      topDriver: input.driver ?? null,
      approvedAt: input.approvedAt ?? null,
      assessedAt: input.approvedAt ?? null,
    },
  });
}

describe("parseSortKey", () => {
  it("accepts the documented sort columns", () => {
    for (const key of [
      "name",
      "code",
      "type",
      "owner",
      "depth",
      "inherent",
      "control",
      "residual",
      "level",
      "assessment",
      "assessedAt",
      "status",
    ]) {
      expect(parseSortKey(key)).toBe(key);
    }
  });

  it("falls back to null for unknown or missing keys", () => {
    expect(parseSortKey("password")).toBeNull();
    expect(parseSortKey(undefined)).toBeNull();
    expect(parseSortKey(null)).toBeNull();
  });
});

describe("parseSortDirection", () => {
  it("normalises asc and desc and defaults to desc", () => {
    expect(parseSortDirection("asc")).toBe("asc");
    expect(parseSortDirection("ASC")).toBe("asc");
    expect(parseSortDirection("desc")).toBe("desc");
    expect(parseSortDirection("sideways")).toBe("desc");
    expect(parseSortDirection(undefined)).toBe("desc");
  });
});

describe("nextSortState", () => {
  it("flips the direction when the same column is clicked again", () => {
    expect(nextSortState("residual", "desc", "residual")).toEqual({
      key: "residual",
      dir: "asc",
    });
  });

  it("starts numeric columns high-first and text columns A-first", () => {
    expect(nextSortState("name", "asc", "residual")).toEqual({
      key: "residual",
      dir: "desc",
    });
    expect(nextSortState("residual", "desc", "name")).toEqual({
      key: "name",
      dir: "asc",
    });
  });
});

describe("riskLevelRank", () => {
  it("orders bands from critical down to unassessed", () => {
    expect(riskLevelRank("critical")).toBeGreaterThan(riskLevelRank("high"));
    expect(riskLevelRank("high")).toBeGreaterThan(riskLevelRank("medium"));
    expect(riskLevelRank("medium")).toBeGreaterThan(riskLevelRank("low"));
    expect(riskLevelRank("low")).toBeGreaterThan(riskLevelRank(null));
    expect(riskLevelRank("bogus")).toBe(0);
  });
});

describe("sortUniverseRows", () => {
  const rows = [
    assessed("a", { residual: 2, riskLevel: "medium" }),
    row("b"),
    assessed("c", { residual: 4.2, riskLevel: "critical" }),
    assessed("d", { residual: 3, riskLevel: "high" }),
  ];

  it("puts the highest residual first when sorting descending", () => {
    expect(
      sortUniverseRows(rows, "residual", "desc").map((item) => item.id),
    ).toEqual(["c", "d", "a", "b"]);
  });

  it("keeps unassessed rows last when sorting ascending", () => {
    expect(
      sortUniverseRows(rows, "residual", "asc").map((item) => item.id),
    ).toEqual(["a", "d", "c", "b"]);
  });

  it("sorts by risk band rather than by the numeric score", () => {
    const bandRows = [
      assessed("x", { residual: 3.4, riskLevel: "high" }),
      assessed("y", { residual: 3.6, riskLevel: "critical" }),
      row("z"),
    ];

    expect(
      sortUniverseRows(bandRows, "level", "desc").map((item) => item.id),
    ).toEqual(["y", "x", "z"]);
  });

  it("breaks ties on the entity name so the order is stable", () => {
    const tied = [
      row("iga", { name: "Zina" }),
      row("igb", { name: "Aria" }),
      row("igc", { name: "Mira" }),
    ];

    expect(sortUniverseRows(tied, "residual", "desc").map((i) => i.id)).toEqual([
      "igb",
      "igc",
      "iga",
    ]);
  });

  it("sorts owners with unnamed entities gathered at the end", () => {
    const ownerRows = [
      row("b", { ownerName: "Yusuf" }),
      row("a", { ownerName: "Anita" }),
      row("c"),
    ];

    expect(
      sortUniverseRows(ownerRows, "owner", "asc").map((item) => item.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("sorts by last assessment date and treats missing dates as oldest", () => {
    const dated = [
      assessed("old", { approvedAt: "2026-01-05T00:00:00.000Z" }),
      assessed("new", { approvedAt: "2026-06-05T00:00:00.000Z" }),
      row("none"),
    ];

    expect(
      sortUniverseRows(dated, "assessedAt", "desc").map((item) => item.id),
    ).toEqual(["new", "old", "none"]);
  });

  it("groups approved, then in-progress, then unassessed", () => {
    const states = [
      row("c"),
      assessed("a", { status: "draft" }),
      assessed("b", { status: "approved" }),
    ];

    expect(
      sortUniverseRows(states, "assessment", "desc").map((item) => item.id),
    ).toEqual(["b", "a", "c"]);
  });
});

describe("topRiskDriver", () => {
  it("picks the factor contributing most to the inherent score", () => {
    const driver = topRiskDriver([
      { code: "impact", label: "Dampak", weight: 0.25, score: 4 },
      { code: "fraud", label: "Kecenderungan Fraud", weight: 0.15, score: 5 },
      { code: "likelihood", label: "Kemungkinan", weight: 0.25, score: 3 },
    ]);

    expect(driver).toEqual({
      code: "impact",
      label: "Dampak",
      weight: 0.25,
      score: 4,
      contribution: 1,
    });
  });

  it("returns null when there is no factor score", () => {
    expect(topRiskDriver([])).toBeNull();
  });

  it("rounds the contribution to two decimals", () => {
    const driver = topRiskDriver([
      { code: "regulatory", label: "Regulasi", weight: 0.15, score: 4 },
    ]);

    expect(driver?.contribution).toBe(0.6);
  });
});

describe("riskBarWidth", () => {
  it("scales the score against the model range", () => {
    expect(riskBarWidth(2.5, 5)).toBe(50);
    expect(riskBarWidth(0, 5)).toBe(0);
  });

  it("clamps out-of-range scores and blanks missing ones", () => {
    expect(riskBarWidth(7, 5)).toBe(100);
    expect(riskBarWidth(-1, 5)).toBe(0);
    expect(riskBarWidth(null, 5)).toBe(0);
  });
});

describe("resolveViewMode", () => {
  it("honours an explicit view request", () => {
    expect(resolveViewMode({ view: "hierarchy", sortKey: "residual" })).toBe(
      "hierarchy",
    );
    expect(resolveViewMode({ view: "flat", sortKey: null })).toBe("flat");
  });

  it("defaults to flat once a column sort is active", () => {
    expect(resolveViewMode({ view: null, sortKey: "residual" })).toBe("flat");
    expect(resolveViewMode({ view: null, sortKey: null })).toBe("hierarchy");
  });
});

describe("buildUniverseCsv", () => {
  it("writes a header and one row per entity", () => {
    const csv = buildUniverseCsv([
      assessed("farmasi", {
        inherent: 3.5,
        control: 2,
        residual: 3.15,
        riskLevel: "high",
        approvedAt: "2026-02-10T10:00:00.000Z",
      }),
      row("igd"),
    ]);
    const lines = csv.trim().split("\n");

    expect(lines[0]).toBe(
      "Kode,Entity,Tipe,Process owner,Level,Inherent,Control,Banding,Residual,Pendorong utama,Status penilaian,Terakhir dinilai",
    );
    expect(lines[1].split(",")).toEqual([
      "FARMASI",
      "farmasi",
      "Proses bisnis",
      "",
      "2",
      "3.5",
      "2",
      "High",
      "3.15",
      "",
      "Disetujui",
      "2026-02-10",
    ]);
    expect(lines[2].split(",")).toEqual([
      "IGD",
      "igd",
      "Proses bisnis",
      "",
      "2",
      "",
      "",
      "",
      "",
      "",
      "Belum dinilai",
      "",
    ]);
  });

  it("writes the Indonesian type label and the top risk driver", () => {
    const csv = buildUniverseCsv([
      assessed("mitra", {
        type: "third_party",
        inherent: 4,
        control: 2,
        residual: 3.6,
        riskLevel: "critical",
        driver: {
          code: "impact",
          label: "Dampak",
          weight: 0.25,
          score: 4,
          contribution: 1,
        },
      }),
    ]);

    expect(csv.trim().split("\n")[1].split(",")).toEqual([
      "MITRA",
      "mitra",
      "Pihak ketiga",
      "",
      "2",
      "4",
      "2",
      "Critical",
      "3.6",
      "Dampak 1.00",
      "Disetujui",
      "",
    ]);
  });

  it("labels the root entity as level 1", () => {
    const csv = buildUniverseCsv([row("rs", { depth: 0 })]);

    expect(csv.trim().split("\n")[1]).toContain("RS,rs,Proses bisnis,,1,");
  });

  it("quotes values that contain separators", () => {
    const csv = buildUniverseCsv([
      row("a", { name: 'Rawat Inap, Lantai 2 "VIP"' }),
    ]);

    expect(csv).toContain('"Rawat Inap, Lantai 2 ""VIP"""');
  });

  it("labels the assessment state in Indonesian", () => {
    const csv = buildUniverseCsv([
      assessed("p", { status: "draft" }),
      row("n"),
    ]);
    const lines = csv.trim().split("\n");

    expect(lines[1]).toContain("Draf berjalan");
    expect(lines[2]).toContain("Belum dinilai");
  });

  it("keeps the file terminated with a newline", () => {
    expect(buildUniverseCsv([row("a")]).endsWith("\n")).toBe(true);
  });
});

function reader(values: Record<string, string | undefined>) {
  return (key: string) => values[key] ?? null;
}

describe("parseUniverseQuery", () => {
  it("defaults to no sort, hierarchy view, and no filters", () => {
    const query = parseUniverseQuery(reader({}));

    expect(query).toEqual({
      filters: {},
      sortKey: null,
      sortDir: "desc",
      view: "hierarchy",
    });
  });

  it("drops risk levels outside the known bands", () => {
    const query = parseUniverseQuery(reader({ riskLevel: "everything" }));

    expect(query.filters.riskLevel).toBeUndefined();
  });

  it("keeps whitelisted types and assessment states", () => {
    const query = parseUniverseQuery(
      reader({ type: "third_party", assessmentState: "pending" }),
    );

    expect(query.filters.type).toBe("third_party");
    expect(query.filters.assessmentState).toBe("pending");
  });

  it("reads level one as a real depth filter instead of an unset value", () => {
    expect(parseUniverseQuery(reader({ depth: "0" })).filters.depth).toBe(0);
  });

  it("ignores depth values that are not whole numbers", () => {
    expect(parseUniverseQuery(reader({ depth: "abc" })).filters.depth).toBeUndefined();
    expect(parseUniverseQuery(reader({ depth: "-1" })).filters.depth).toBeUndefined();
    expect(parseUniverseQuery(reader({ depth: "1.5" })).filters.depth).toBeUndefined();
  });

  it("trims the search term and drops a blank one", () => {
    expect(parseUniverseQuery(reader({ q: "  farmasi " })).filters.q).toBe("farmasi");
    expect(parseUniverseQuery(reader({ q: "   " })).filters.q).toBeUndefined();
  });

  it("switches to flat ranking when a column sort is active", () => {
    const query = parseUniverseQuery(reader({ sort: "residual", dir: "asc" }));

    expect(query.sortKey).toBe("residual");
    expect(query.sortDir).toBe("asc");
    expect(query.view).toBe("flat");
  });
});

describe("buildUniverseQuery", () => {
  it("returns an empty string when nothing is set", () => {
    expect(buildUniverseQuery({ filters: {} })).toBe("");
  });

  it("serializes depth zero because level one is a real filter", () => {
    expect(buildUniverseQuery({ filters: { depth: 0 } })).toBe("depth=0");
  });

  it("escapes a search term that contains spaces and separators", () => {
    const search = buildUniverseQuery({ filters: { q: "rawat inap & ICU" } });

    expect(
      parseUniverseQuery((key) => new URLSearchParams(search).get(key)).filters.q,
    ).toBe("rawat inap & ICU");
  });

  it("round trips through parseUniverseQuery", () => {
    const search = buildUniverseQuery({
      filters: {
        q: "farmasi",
        type: "business_process",
        riskLevel: "critical",
        ownerUserId: "usr_owner_farmasi",
        assessmentState: "approved",
        depth: 2,
      },
      sortKey: "level",
      sortDir: "asc",
      view: "flat",
    });

    expect(parseUniverseQuery((key) => new URLSearchParams(search).get(key))).toEqual({
      filters: {
        q: "farmasi",
        type: "business_process",
        riskLevel: "critical",
        ownerUserId: "usr_owner_farmasi",
        assessmentState: "approved",
        depth: 2,
      },
      sortKey: "level",
      sortDir: "asc",
      view: "flat",
    });
  });
});
