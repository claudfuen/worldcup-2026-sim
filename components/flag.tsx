import { flagUrl } from "@/lib/flags";

// Country flag chip. Falls back to a neutral placeholder for unresolved (TBD) slots.
export function Flag({ code, size = 20 }: { code: string | null | undefined; size?: number }) {
  const url = flagUrl(code, size <= 20 ? 40 : 80);
  const h = Math.round(size * 0.72);
  if (!url) {
    return (
      <span
        className="bg-muted/60 ring-border inline-block shrink-0 rounded-[2px] ring-1"
        style={{ width: size, height: h }}
        aria-hidden
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={code ?? ""}
      width={size}
      height={h}
      className="ring-border/60 inline-block shrink-0 rounded-[2px] object-cover ring-1"
      style={{ width: size, height: h }}
      loading="lazy"
    />
  );
}
