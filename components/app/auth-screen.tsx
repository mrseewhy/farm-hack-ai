"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ArrowRight, Eye, EyeOff, Leaf } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  languages,
  setPreferredLanguage,
  usePreferredLanguage,
  type Language,
} from "@/lib/preferences";
import { t } from "@/lib/i18n";

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const preferredLanguage = usePreferredLanguage();
  const language = preferredLanguage;

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand href="/login" />
        <ThemeToggle />
      </header>
      <main className="mx-auto grid min-h-[calc(100dvh-88px)] max-w-7xl items-center gap-12 px-5 pb-12 lg:grid-cols-2 lg:px-8">
        <section className="hidden max-w-lg lg:block">
          <div className="mb-7 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Leaf className="size-8" />
          </div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            {t("heroEyebrow", language)}
          </p>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">
            {t("heroTitle", language)}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            {t("heroSubtitle", language)}
          </p>
          <div className="mt-10 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-px w-10 bg-primary" />
            {t("heroFooter", language)}
          </div>
        </section>
        <Card className="mx-auto w-full max-w-md border-border/80 bg-card shadow-[0_24px_80px_-48px_rgba(15,50,29,.3)]">
          <CardContent className="p-7 sm:p-9">
            <div className="mb-7">
              <p className="mb-2 text-sm font-medium text-primary">
                {signup
                  ? t("createFarmerAccount", language)
                  : t("welcomeBack", language)}
              </p>
              <h2 className="text-3xl font-semibold tracking-tight">
                {signup ? t("getStarted", language) : t("signIn", language)}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {signup ? t("signupSubtitle", language) : t("loginSubtitle", language)}
              </p>
            </div>
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setNotice("");
                setBusy(true);
                const data = new FormData(event.currentTarget);
                const email = String(data.get("email") ?? "");
                const password = String(data.get("password") ?? "");
                try {
                  const result = signup
                    ? await authClient.signUp.email({
                        name: String(data.get("name") ?? ""),
                        email,
                        password,
                        preferredLanguage,
                      })
                    : await authClient.signIn.email({ email, password });
                  if (result.error) {
                    setNotice(
                      result.error.message ?? t("errorAuthGeneric", language)
                    );
                    return;
                  }
                  router.push("/");
                  router.refresh();
                } catch {
                  setNotice(t("errorConnection", language));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {signup && (
                <div className="space-y-2">
                  <Label htmlFor="name">{t("fullName", language)}</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder={t("namePlaceholder", language)}
                    autoComplete="name"
                    required
                  />
                </div>
              )}
              {signup && (
                <div className="space-y-2">
                  <Label htmlFor="language">
                    {t("preferredLanguage", language)}
                  </Label>
                  <select
                    id="language"
                    name="language"
                    value={preferredLanguage}
                    onChange={(event) =>
                      setPreferredLanguage(event.target.value as Language)
                    }
                    className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {languages.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t("emailAddress", language)}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t("emailPlaceholder", language)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("password", language)}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("passwordPlaceholder", language)}
                    autoComplete={signup ? "new-password" : "current-password"}
                    minLength={8}
                    required
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label={
                      showPassword
                        ? t("hidePassword", language)
                        : t("showPassword", language)
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
              {notice && (
                <p
                  role="alert"
                  className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {notice}
                </p>
              )}
              <Button type="submit" disabled={busy} className="mt-2 w-full">
                {busy
                  ? t("pleaseWait", language)
                  : signup
                    ? t("createAccountButton", language)
                    : t("signInButton", language)}
                <ArrowRight className="size-4" />
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {signup
                ? t("alreadyHaveAccount", language)
                : t("newToFarmhack", language)}{" "}
              <Link
                className="font-semibold text-primary hover:underline"
                href={signup ? "/login" : "/signup"}
              >
                {signup ? t("signInLink", language) : t("createAccountLink", language)}
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
