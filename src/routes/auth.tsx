import { createFileRoute, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Dumbbell } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,

  head: () => ({
    meta: [
      { title: "Sign in — Gymigo" },
      { name: "description", content: "Sign in or create your Gymigo account to start tracking your workouts." },
      { property: "og:title", content: "Sign in — Gymigo" },
      { property: "og:description", content: "Log in or create your Gymigo account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const router = useRouter();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [checking, setChecking] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const go = async () => {
      if (cancelled) return;
      setRedirecting(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      await router.invalidate();
      if (cancelled) return;
      nav({ to: search.redirect ?? "/dashboard", replace: true });
    };

    const completeCallback = async () => {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        setRedirecting(true);
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
      }

      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        if (!cancelled) {
          setChecking(false);
          setRedirecting(false);
        }
        return;
      }
      await go();
    };

    completeCallback().catch((error: unknown) => {
      if (cancelled) return;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setChecking(false);
      setRedirecting(false);
      toast.error(error instanceof Error ? error.message : "Google sign-in failed");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void go();
    });
    // Native APK: coming back from the browser without a session (cancelled/failed Google login)
    // must clear the "Signing you in" state. Delay lets a deep-link setSession land first.
    const resume = (window as any).Capacitor?.Plugins?.App?.addListener("appStateChange", (s: { isActive: boolean }) => {
      if (!s.isActive) return;
      setTimeout(() => {
        supabase.auth.getSession().then(({ data }) => {
          if (!cancelled && !data.session) setRedirecting(false);
        });
      }, 1500);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      void resume?.then((h: { remove: () => void }) => h.remove());
    };
  }, [nav, router, search.redirect]);


  async function handleResend() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success("Confirmation email sent. Check your inbox (and spam).");
    } catch (err: any) {
      toast.error(err.message ?? "Could not resend the email");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setNeedsConfirm(false);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created!");
          nav({ to: "/onboarding", replace: true });
        } else {
          toast.success("Check your email to confirm your account, then sign in.");
          setNeedsConfirm(true);
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setRedirecting(true);
        nav({ to: search.redirect ?? "/dashboard", replace: true });
      }

    } catch (err: any) {
      const code = err?.code ?? "";
      const raw = String(err?.message ?? "");
      if (code === "email_not_confirmed" || /not confirmed/i.test(raw)) {
        setNeedsConfirm(true);
        toast.error("Your email isn't confirmed yet. Resend the confirmation link below.");
      } else if (code === "invalid_credentials") {
        setNeedsConfirm(true);
        toast.error(
          "We couldn't sign you in. If you signed up with Google, use “Continue with Google”. If you signed up with email, confirm your email first — you can resend the link below.",
        );
      } else {
        toast.error(raw || "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  }


  async function handleGoogle() {
    setRedirecting(true);
    // Native APK: the /~oauth/initiate route only exists on Lovable hosting, so send the
    // system browser there and come back through the deep link handled in __root.tsx.
    // shortcut: the broker only allows the lovable:// scheme, so the APK claims it; use an
    // own-scheme redirect once Lovable allowlists one for this project.
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      const params = new URLSearchParams({
        provider: "google",
        redirect_uri: "lovable://oauth-callback",
        state: crypto.randomUUID(),
      });
      window.location.href = `https://gymigo.fit/~oauth/initiate?${params}`;
      return;
    }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth?redirect=%2Fdashboard`,
    });
    if (result.error) {
      setRedirecting(false);
      toast.error(result.error.message ?? "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    setRedirecting(true);
    nav({ to: search.redirect ?? "/dashboard", replace: true });
  }

  if (checking || redirecting) {
    return (
      <div className="min-h-screen bg-gradient-hero grid place-items-center px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-primary grid place-items-center shadow-glow">
            <Dumbbell className="w-6 h-6 text-primary-foreground" />
          </div>
          <div
            role="status"
            aria-label="Loading"
            className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
          />
          <p className="text-sm text-muted-foreground">
            {redirecting ? "Signing you in…" : "Loading…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero grid place-items-center px-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2">
            <div className="w-11 h-11 rounded-xl bg-gradient-primary grid place-items-center shadow-glow">
              <Dumbbell className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display font-extrabold text-3xl tracking-tight">Gymigo</span>
          </div>
          <h1 className="mt-6 text-2xl font-bold">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {mode === "signup" ? "Start tracking in under a minute." : "Sign in to keep the streak alive."}
          </p>
        </div>

        <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card space-y-4">
          <button
            onClick={handleGoogle}
            className="w-full h-11 rounded-md border border-border bg-secondary/60 hover:bg-secondary font-medium flex items-center justify-center gap-2"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <input
                required
                type="text"
                aria-label="Your name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 px-3 rounded-md bg-background border border-input focus:border-primary focus:outline-none"
              />
            )}
            <input
              required
              type="email"
              aria-label="Email address"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-3 rounded-md bg-background border border-input focus:border-primary focus:outline-none"
            />
            <input
              required
              type="password"
              aria-label="Password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              className="w-full h-11 px-3 rounded-md bg-background border border-input focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-md bg-gradient-primary text-primary-foreground font-semibold shadow-glow disabled:opacity-60"
            >
              {loading ? "…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          {needsConfirm && mode === "signin" && (
            <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground space-y-2">
              <p>
                Not able to sign in? If you created this account with Google, use “Continue with
                Google” above. If you used email, your address may still need confirming.
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading || !email}
                className="text-primary font-semibold disabled:opacity-50"
              >
                Resend confirmation email
              </button>
            </div>
          )}



          <p className="text-center text-sm text-muted-foreground">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button className="text-primary font-semibold" onClick={() => setMode("signin")}>
                  Sign in
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button className="text-primary font-semibold" onClick={() => setMode("signup")}>
                  Create account
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285f4" d="M23.7 12.3c0-.9-.1-1.7-.2-2.5H12v4.9h6.6c-.3 1.5-1.2 2.7-2.5 3.6v3h4c2.4-2.2 3.6-5.4 3.6-9z" />
      <path fill="#34a853" d="M12 24c3.2 0 6-1.1 8-2.9l-4-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.3v3.1C3.3 21.4 7.3 24 12 24z" />
      <path fill="#fbbc04" d="M5.4 14.4c-.2-.7-.3-1.4-.3-2.4s.1-1.7.3-2.4V6.5H1.3C.5 8.1 0 10 0 12s.5 3.9 1.3 5.5l4.1-3.1z" />
      <path fill="#ea4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.7l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.6 1.3 6.5l4.1 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}
