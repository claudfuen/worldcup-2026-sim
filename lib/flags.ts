// Team code -> ISO 3166-1 alpha-2 (flagcdn codes; gb-eng/gb-sct for home nations).
export const ISO2: Record<string, string> = {
  MEX: "mx", KOR: "kr", CZE: "cz", RSA: "za", CAN: "ca", SUI: "ch", BIH: "ba", QAT: "qa",
  MAR: "ma", SCO: "gb-sct", BRA: "br", HAI: "ht", USA: "us", AUS: "au", TUR: "tr", PAR: "py",
  GER: "de", CIV: "ci", ECU: "ec", CUW: "cw", SWE: "se", JPN: "jp", NED: "nl", TUN: "tn",
  NZL: "nz", IRN: "ir", BEL: "be", EGY: "eg", URU: "uy", KSA: "sa", ESP: "es", CPV: "cv",
  NOR: "no", FRA: "fr", SEN: "sn", IRQ: "iq", ARG: "ar", AUT: "at", JOR: "jo", ALG: "dz",
  COL: "co", COD: "cd", POR: "pt", UZB: "uz", ENG: "gb-eng", GHA: "gh", PAN: "pa", CRO: "hr",
};

export function flagUrl(code: string | null | undefined, w: 20 | 40 | 80 | 160 = 40): string | null {
  if (!code) return null;
  const iso = ISO2[code];
  return iso ? `https://flagcdn.com/w${w}/${iso}.png` : null;
}
