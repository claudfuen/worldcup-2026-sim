import { ISO2 } from "@/lib/flags";

// Country flag chip backed by the bundled `flag-icons` SVGs (offline, reliable, crisp; supports gb-eng/gb-sct).
// Falls back to a neutral placeholder for unresolved (TBD) knockout slots.
export function Flag({ code, size = 20 }: { code: string | null | undefined; size?: number }) {
  const iso = code ? ISO2[code] : null;
  const h = Math.round(size * 0.72);
  if (!iso) {
    return (
      <span className="bg-muted/60 ring-border inline-block shrink-0 rounded-[2px] ring-1" style={{ width: size, height: h }} aria-hidden />
    );
  }
  return (
    <span
      className={`fi fi-${iso} ring-border/50 inline-block shrink-0 rounded-[2px] bg-cover bg-center ring-1`}
      style={{ width: size, height: h, backgroundSize: "cover" }}
      role="img"
      aria-label={code ?? ""}
    />
  );
}
