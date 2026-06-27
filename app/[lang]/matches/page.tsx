import { redirect } from "next/navigation";

// The per-user "My Matches" feature is retired - the app is fully open, no sign-in. Old links land home.
export default function MatchesPage() {
  redirect("/");
}
