// A tiny, dependency-free ICU-subset message formatter. Supports exactly what our catalogs need:
//   - simple interpolation:  "Group {letter} standings"            -> params.letter
//   - plurals (locale-correct via native Intl.PluralRules):
//       "{count, plural, one {# group} other {# groups}}"
//     where "#" is replaced by the localized number. Russian/Arabic etc. get their full set of
//     categories (zero/one/two/few/many/other) and the right branch is chosen by Intl.PluralRules.
//
// Why not next-intl? Its routing integration relies on middleware (renamed to proxy.ts in Next 16),
// which is a moving target right now. This covers our needs with zero runtime dependency and no
// version-coupling, and the catalogs stay plain JSON that the translation pass can fill mechanically.

/** Nested dotted-key lookup into a (possibly deeply nested) messages object. */
export function lookupMessage(messages: unknown, key: string): string | undefined {
  let cur: unknown = messages;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

const pluralCache = new Map<string, Intl.PluralRules>();
function pluralRules(intlLocale: string): Intl.PluralRules {
  let r = pluralCache.get(intlLocale);
  if (!r) {
    r = new Intl.PluralRules(intlLocale);
    pluralCache.set(intlLocale, r);
  }
  return r;
}

function fmtNumber(value: number, intlLocale: string): string {
  return new Intl.NumberFormat(intlLocale).format(value);
}

type Params = Record<string, string | number | null | undefined> | undefined;

// Resolve one {count, plural, one {...} other {...}} block. `inner` is the text between the outer
// braces, i.e. "count, plural, one {# x} other {# y}". Returns the chosen, fully-substituted branch.
function resolvePlural(inner: string, params: Params, intlLocale: string): string {
  const m = /^(\w+)\s*,\s*plural\s*,\s*([\s\S]*)$/.exec(inner);
  if (!m) return "";
  const [, varName, body] = m;
  const count = Number(params?.[varName] ?? 0);

  // Parse "one {…} other {…}" (and =N {…} exact matches) into a category->text map.
  const branches = new Map<string, string>();
  const re = /(=\d+|zero|one|two|few|many|other)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    const cat = match[1];
    // Walk to the matching closing brace from the position after "{".
    let depth = 1;
    let i = re.lastIndex;
    for (; i < body.length && depth > 0; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") depth--;
    }
    branches.set(cat, body.slice(re.lastIndex, i - 1));
    re.lastIndex = i;
  }

  const exact = branches.get(`=${count}`);
  const category = pluralRules(intlLocale).select(count);
  const chosen = exact ?? branches.get(category) ?? branches.get("other") ?? "";
  // "#" inside a plural branch is the localized count.
  return chosen.replace(/#/g, fmtNumber(count, intlLocale));
}

/**
 * Format a catalog template against params, using intlLocale for number/plural rules.
 * Unknown placeholders are left as-is (defensive). Nested plurals are not supported (not needed).
 */
export function formatMessage(template: string, params: Params, intlLocale: string): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === "{") {
      // Find the matching close brace for this top-level placeholder.
      let depth = 1;
      let j = i + 1;
      for (; j < template.length && depth > 0; j++) {
        if (template[j] === "{") depth++;
        else if (template[j] === "}") depth--;
      }
      const inner = template.slice(i + 1, j - 1);
      if (/^\s*\w+\s*,\s*plural\s*,/.test(inner)) {
        out += resolvePlural(inner, params, intlLocale);
      } else {
        const key = inner.trim();
        if (!params || !(key in params)) {
          out += `{${inner}}`; // genuinely-absent param → keep the placeholder (defensive)
        } else {
          const val = params[key];
          out += val == null ? "" : typeof val === "number" ? fmtNumber(val, intlLocale) : String(val);
        }
      }
      i = j;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}
