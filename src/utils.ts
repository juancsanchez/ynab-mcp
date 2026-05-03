export const toMilliunits = (decimal: number): number =>
  Math.round(decimal * 1000);

export const fromMilliunits = (milliunits: number): number =>
  milliunits / 1000;

export const normalizeDate = (dateStr: string): string => {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toISOString().substring(0, 10);
};

export const dateDiffDays = (a: string, b: string): number => {
  const msA = new Date(a + "T00:00:00Z").getTime();
  const msB = new Date(b + "T00:00:00Z").getTime();
  return Math.abs((msA - msB) / (1000 * 60 * 60 * 24));
};

export const subtractDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().substring(0, 10);
};

export const formatYnabError = (e: unknown): string => {
  if (e && typeof e === "object" && "error" in e) {
    const err = (e as { error: { id: string; name: string; detail: string } }).error;
    return `YNAB API Error ${err.id}: ${err.name} - ${err.detail}`;
  }
  return e instanceof Error ? e.message : String(e);
};

export const currentMonthISO = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
};

export const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export const err = (message: string) => ({
  content: [{ type: "text" as const, text: `Error: ${message}` }],
  isError: true,
});
