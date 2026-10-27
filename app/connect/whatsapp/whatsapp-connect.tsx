"use client";
import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { BrandLogo } from "@/components/brand-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Link2 } from "lucide-react";

export function WhatsAppConnect({
  token,
  initialError,
}: {
  token: string;
  initialError: string;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(initialError);
  const [phone, setPhone] = useState("");
  const [success, setSuccess] = useState(false);
  const [notified, setNotified] = useState(false);
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        setUser(user);
        setReady(true);
        setPhone("");
      }),
    [],
  );
  useEffect(() => {
    if (!user || !token) return;
    let cancelled = false;
    async function inspect() {
      try {
        const credential = await user!.getIdToken();
        const res = await fetch("/api/connect/whatsapp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${credential}`,
          },
          body: JSON.stringify({ token, action: "inspect" }),
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled) {
          if (res.ok) setPhone(data.phone);
          else setError(data.error ?? "Unable to check this link.");
        }
      } catch {
        if (!cancelled)
          setError(
            "Could not check your link. Check your connection and refresh.",
          );
      }
    }
    void inspect();
    return () => {
      cancelled = true;
    };
  }, [user, token]);
  async function confirm() {
    if (!user) return;
    setPending(true);
    setError("");
    try {
      const credential = await user.getIdToken(true);
      const res = await fetch("/api/connect/whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify({ token, action: "confirm" }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not connect WhatsApp.");
        return;
      }
      setSuccess(true);
      setNotified(data.notificationSent === true);
      // Remove the consumed capability from the address bar and browser history entry.
      window.history.replaceState(null, "", "/connect/whatsapp");
    } catch {
      setError(
        "Could not confirm the connection. Refresh to check your link before trying again.",
      );
    } finally {
      setPending(false);
    }
  }
  async function login(form: HTMLFormElement) {
    setPending(true);
    setError("");
    const data = new FormData(form);
    try {
      if (creating)
        await createUserWithEmailAndPassword(
          auth,
          String(data.get("email")),
          String(data.get("password")),
        );
      else
        await signInWithEmailAndPassword(
          auth,
          String(data.get("email")),
          String(data.get("password")),
        );
    } catch {
      setError(
        "Could not sign in. Check your details or try another sign-in method.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md gap-6 p-6 sm:p-8">
        <BrandLogo variant="wordmark" />
        <div className="flex items-start gap-3">
          {success ? (
            <CheckCircle2 className="mt-1 size-5 text-primary" />
          ) : (
            <Link2 className="mt-1 size-5 text-primary" />
          )}
          <div>
            <h1 className="text-xl font-semibold">
              {success ? "WhatsApp connected" : "Connect WhatsApp"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {success
                ? notified
                  ? "Your Tany account is connected. Return to WhatsApp to choose your next step."
                  : "Your account is connected. The WhatsApp confirmation could not be delivered; send Hi in WhatsApp to continue."
                : "Securely connect your WhatsApp number to your Tany account."}
            </p>
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            {error}
          </p>
        )}
        {!success &&
          token &&
          (!ready ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking sign-in…
            </p>
          ) : user ? (
            <div className="space-y-4">
              <p className="text-sm">
                {phone
                  ? `Connect ${phone} to your Tany account?`
                  : "Checking your WhatsApp link…"}
              </p>
              <p className="text-sm text-muted-foreground">
                Signed in{user.email ? ` as ${user.email}` : ""}. This connects
                your number across Tany businesses. It will not replace an
                account already linked to this number.
              </p>
              <Button
                className="h-11 w-full"
                disabled={pending || !phone || !!error}
                onClick={confirm}
              >
                {pending ? "Connecting…" : "Connect WhatsApp"}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                className="w-full"
                onClick={async () => {
                  await signOut(auth);
                  setError("");
                }}
              >
                Use another account
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <Button
                variant="outline"
                className="h-11 w-full"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  setError("");
                  try {
                    await signInWithPopup(auth, new GoogleAuthProvider());
                  } catch {
                    setError(
                      "Google sign-in could not finish. Try email or open this page in your browser.",
                    );
                  } finally {
                    setPending(false);
                  }
                }}
              >
                Continue with Google
              </Button>
              <div className="text-center text-xs text-muted-foreground">
                or use email
              </div>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void login(e.currentTarget);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    className="h-11"
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    className="h-11"
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={
                      creating ? "new-password" : "current-password"
                    }
                    minLength={6}
                    required
                  />
                </div>
                <Button className="h-11 w-full" disabled={pending}>
                  {pending
                    ? "Please wait…"
                    : creating
                      ? "Create Tany account"
                      : "Log in"}
                </Button>
              </form>
              <Button
                variant="ghost"
                className="w-full"
                disabled={pending}
                onClick={() => {
                  setCreating(!creating);
                  setError("");
                }}
              >
                {creating
                  ? "Already have an account? Log in"
                  : "New to Tany? Create an account"}
              </Button>
            </div>
          ))}
        <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
          Links expire after 15 minutes and work once. Only connect a number you
          control. Never share this link.
        </p>
      </Card>
    </main>
  );
}
