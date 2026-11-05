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
import { languages, setPreferredLanguage, usePreferredLanguage, type Language } from "@/lib/preferences";

export default function ProfilePage() {
  const router = useRouter();
  const language = usePreferredLanguage();
  const [passwordNotice, setPasswordNotice] = useState(false);
  return <div className="min-h-dvh bg-background"><header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8"><Brand /><ThemeToggle /></header><main className="mx-auto max-w-3xl px-5 pb-16 pt-7 sm:px-8"><button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back</button><div className="mt-8 mb-8"><span className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-6" /></span><h1 className="text-3xl font-semibold tracking-tight">Profile & settings</h1><p className="mt-2 text-sm text-muted-foreground">Manage how you use FarmHack AI.</p></div><div className="space-y-5"><Card><CardHeader><div className="flex items-center gap-2"><Languages className="size-5 text-primary" /><CardTitle className="text-lg">Language</CardTitle></div><p className="text-sm text-muted-foreground">Choose the language you prefer for crop conversations.</p></CardHeader><CardContent><Label htmlFor="preferred-language">Preferred language</Label><select id="preferred-language" value={language} onChange={(event) => setPreferredLanguage(event.target.value as Language)} className="mt-2 flex h-10 w-full max-w-sm rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">{languages.map((name) => <option key={name}>{name}</option>)}</select><p className="mt-2 text-xs text-muted-foreground">Your choice is saved on this device.</p></CardContent></Card><Card><CardHeader><div className="flex items-center gap-2"><LockKeyhole className="size-5 text-primary" /><CardTitle className="text-lg">Change password</CardTitle></div><p className="text-sm text-muted-foreground">Use a strong password that you do not use elsewhere.</p></CardHeader><CardContent><form className="max-w-sm space-y-4" onSubmit={(event) => { event.preventDefault(); setPasswordNotice(true); }}><div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" autoComplete="current-password" required /></div><div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} required /></div>{passwordNotice && <p role="status" className="text-sm text-destructive">Password changes are temporarily unavailable. Your password has not been changed.</p>}<Button type="submit">Update password</Button></form></CardContent></Card></div></main></div>;
}
