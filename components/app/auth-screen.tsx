"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Leaf } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState(false);
  return <div className="min-h-dvh bg-background">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8"><Brand href="/login" /><ThemeToggle /></header>
    <main className="mx-auto grid min-h-[calc(100dvh-88px)] max-w-7xl items-center gap-12 px-5 pb-12 lg:grid-cols-2 lg:px-8">
      <section className="hidden max-w-lg lg:block"><div className="mb-7 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Leaf className="size-8" /></div><p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">For healthier harvests</p><h1 className="text-5xl font-semibold leading-tight tracking-tight">Understand your crops, one conversation at a time.</h1><p className="mt-5 text-lg leading-relaxed text-muted-foreground">Describe what you see, share a photo, and get clear guidance in your language.</p><div className="mt-10 flex items-center gap-3 text-sm text-muted-foreground"><span className="h-px w-10 bg-primary" /> Built for Nigerian farmers</div></section>
      <Card className="mx-auto w-full max-w-md border-border/80 bg-card shadow-[0_24px_80px_-48px_rgba(15,50,29,.3)]"><CardContent className="p-7 sm:p-9"><div className="mb-7"><p className="mb-2 text-sm font-medium text-primary">{signup ? "Create your farmer account" : "Welcome back"}</p><h2 className="text-3xl font-semibold tracking-tight">{signup ? "Get started" : "Sign in"}</h2><p className="mt-2 text-sm text-muted-foreground">{signup ? "Join FarmHack AI to keep track of your crop conversations." : "Continue to your crop conversations."}</p></div><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setNotice(true); }}>
        {signup && <div className="space-y-2"><Label htmlFor="name">Full name</Label><Input id="name" placeholder="Your name" autoComplete="name" required /></div>}
        <div className="space-y-2"><Label htmlFor="email">Email address</Label><Input id="email" type="email" placeholder="you@example.com" autoComplete="email" required /></div>
        <div className="space-y-2"><Label htmlFor="password">Password</Label><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter your password" autoComplete={signup ? "new-password" : "current-password"} minLength={8} required className="pr-11" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
        {notice && <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Account access is being connected. Explore the interface using the preview links below.</p>}
        <Button type="submit" className="mt-2 w-full">{signup ? "Create account" : "Sign in"}<ArrowRight className="size-4" /></Button>
      </form><p className="mt-6 text-center text-sm text-muted-foreground">{signup ? "Already have an account?" : "New to FarmHack AI?"} <Link className="font-semibold text-primary hover:underline" href={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create an account"}</Link></p><div className="mt-8 border-t pt-5 text-center text-xs text-muted-foreground">UI preview · <Link href="/chat" className="underline underline-offset-2">Farmer chat</Link> · <Link href="/admin/dashboard" className="underline underline-offset-2">Admin dashboard</Link></div></CardContent></Card>
    </main>
  </div>;
}
