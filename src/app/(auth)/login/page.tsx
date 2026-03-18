"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithGoogle } from "@/lib/auth-client";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  async function handleGoogleSignIn() {
    setError(null);
    setLoading(true);

    try {
      const { idToken } = await signInWithGoogle();

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (data.error?.code === "INVALID_TOKEN") {
          setError("Invalid authentication. Please try again.");
        } else {
          setError("Sign in failed. Please try again.");
        }
        return;
      }

      router.push(redirect);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      if (!message.includes("popup-closed-by-user")) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(26,25,23,0.08)] p-8">
        <div className="text-center mb-8">
          <h1 className="font-[family-name:var(--font-serif)] text-3xl text-[#1A1917] tracking-[-0.01em]">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-[#5C5950]">
            Sign in to continue your studies
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border-l-[3px] border-[#D4654A] bg-[#FAEAE5] px-4 py-3">
            <p className="text-sm text-[#D4654A]">{error}</p>
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 rounded-lg bg-[#1A1917] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#2D2D2A] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {loading ? "Signing in..." : "Continue with Google"}
        </button>

        <p className="mt-6 text-center text-xs text-[#949085]">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="text-[#2D7A6E] hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
