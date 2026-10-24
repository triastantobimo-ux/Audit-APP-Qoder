const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateOnlyFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return dateTimeFormatter.format(new Date(value));
}

export function formatDateOnly(value: Date | string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return dateOnlyFormatter.format(new Date(value));
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return numberFormatter.format(value);
}

const hoursFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
});

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return hoursFormatter.format(value);
}

export function formatPercent(
  numerator: number,
  denominator: number,
): string {
  if (denominator === 0) {
    return "0%";
  }

  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function relativeTime(value: Date | string): string {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari lalu`;

  return formatDate(date);
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;

  const units = ["KB", "MB", "GB"] as const;
  let size = value / 1024;
  let unit: string = units[0];

  for (const next of units.slice(1)) {
    if (size < 1024) break;
    size /= 1024;
    unit = next;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}
