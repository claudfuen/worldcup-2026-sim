import { SignInForm } from "./sign-in-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        We&apos;ll email you a magic link - no password. Sign in to save the matches you&apos;re tracking.
      </p>
      <SignInForm next={next && next.startsWith("/") ? next : "/matches"} />
    </main>
  );
}
