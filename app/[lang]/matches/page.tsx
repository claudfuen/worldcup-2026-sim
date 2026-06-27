import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";

// The per-user "My Matches" feature is retired - the app is fully open, no sign-in. Old links land home.
export default async function MatchesPage() {
  const locale = await getLocale();
  redirect(localeHref(locale, "/"));
}
