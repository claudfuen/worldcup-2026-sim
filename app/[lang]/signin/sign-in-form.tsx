"use client";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const { error } = await signIn.magicLink({ email: email.trim(), callbackURL: next });
    if (error) {
      setStatus("error");
      setError(error.message || "Couldn't send the link. Please try again.");
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return (
      <div className="border-border bg-card mt-6 rounded-2xl border p-5">
        <p className="flex items-start gap-2 text-sm">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mt-0.5 shrink-0" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
          </svg>
          <span>Check <span className="font-medium">{email}</span> for a sign-in link. It expires in 15 minutes.</span>
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="text-muted-foreground hover:text-foreground mt-3 text-xs underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <input
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="border-border bg-card focus:border-primary/60 w-full rounded-xl border px-4 py-3 text-sm outline-none"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="bg-primary text-primary-foreground w-full rounded-xl px-4 py-3 text-sm font-medium disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {status === "error" && <p className="text-destructive text-sm">{error}</p>}
    </form>
  );
}
