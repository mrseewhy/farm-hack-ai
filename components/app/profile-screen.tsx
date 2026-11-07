"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LockKeyhole, Languages, UserRound } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  languages,
  setPreferredLanguage,
  type Language,
} from "@/lib/preferences";
import { authClient } from "@/lib/auth-client";
import { exportMyData } from "@/lib/data/actions/export";
import { t } from "@/lib/i18n";

export function ProfileScreen({
  initialLanguage,
}: {
  initialLanguage: Language | null | undefined;
}) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(
    initialLanguage ?? "English"
  );
  const [languageNotice, setLanguageNotice] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-7 sm:px-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("back", language)}
        </button>
        <div className="mt-8 mb-8">
          <span className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRound className="size-6" />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("profileSettingsTitle", language)}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("manageHowYouUse", language)}
          </p>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Languages className="size-5 text-primary" />
                <CardTitle className="text-lg">
                  {t("languageTitle", language)}
                </CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("languageChoice", language)}
              </p>
            </CardHeader>
            <CardContent>
              <Label htmlFor="preferred-language">
                {t("preferredLanguage", language)}
              </Label>
              <select
                id="preferred-language"
                value={language}
                onChange={async (event) => {
                  const next = event.target.value as Language;
                  const result = await authClient.updateUser({
                    preferredLanguage: next,
                  });
                  if (result.error) {
                    setLanguageNotice(
                      result.error.message ?? t("languageSaveError", language)
                    );
                  } else {
                    setLanguage(next);
                    // Keep the local preference used by the signup screen and
                    // chat in sync with the account value.
                    setPreferredLanguage(next);
                    setLanguageNotice(t("languageSaved", next));
                  }
                }}
                className="mt-2 flex h-10 w-full max-w-sm rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {languages.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              {languageNotice && (
                <p role="status" className="mt-2 text-sm">
                  {languageNotice}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {t("savedToAccount", language)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <LockKeyhole className="size-5 text-primary" />
                <CardTitle className="text-lg">
                  {t("passwordSection", language)}
                </CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("passwordHint", language)}
              </p>
            </CardHeader>
            <CardContent>
              <form
                className="max-w-sm space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  const result = await authClient.changePassword({
                    currentPassword: String(data.get("currentPassword")),
                    newPassword: String(data.get("newPassword")),
                    revokeOtherSessions: true,
                  });
                  if (result.error) {
                    setPasswordNotice(
                      result.error.message ?? t("passwordChangeError", language)
                    );
                  } else {
                    setPasswordNotice(t("passwordChanged", language));
                    form.reset();
                  }
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="current-password">
                    {t("currentPassword", language)}
                  </Label>
                  <Input
                    id="current-password"
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">
                    {t("newPasswordPlaceholder", language)}
                  </Label>
                  <Input
                    id="new-password"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
                {passwordNotice && (
                  <p role="status" className="text-sm">
                    {passwordNotice}
                  </p>
                )}
                <Button type="submit">{t("changePasswordButton", language)}</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your data</CardTitle>
              <p className="text-sm text-muted-foreground">
                Download a copy of your conversations, messages, photos, and
                assessments. Retention is enforced by a scheduled cleanup, and
                the notice describes what is stored and for how long.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={exportBusy}
                  onClick={async () => {
                    setExportBusy(true);
                    setExportNotice("");
                    try {
                      const data = await exportMyData();
                      const blob = new Blob([JSON.stringify(data, null, 2)], {
                        type: "application/json",
                      });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `farmhackai-export-${new Date()
                        .toISOString()
                        .slice(0, 10)}.json`;
                      link.click();
                      URL.revokeObjectURL(url);
                      setExportNotice("Export downloaded.");
                    } catch {
                      setExportNotice("Could not create the export. Please try again.");
                    } finally {
                      setExportBusy(false);
                    }
                  }}
                >
                  {exportBusy ? "Preparing…" : "Download my data"}
                </Button>
                <a
                  href="/privacy"
                  className="text-sm font-medium text-primary underline underline-offset-4"
                >
                  Privacy and retention notice
                </a>
              </div>
              {exportNotice && (
                <p role="status" className="text-sm text-muted-foreground">
                  {exportNotice}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
