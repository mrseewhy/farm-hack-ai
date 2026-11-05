"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Image from "next/image";
import { ArrowUp, Camera, Menu, Plus, Settings, Sprout, X } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { languages, type Language } from "@/lib/preferences";

type Message = { text: string; image?: string; status: "not-sent" };

export function ChatScreen({ initialLanguage }: { initialLanguage: Language | null | undefined }) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(initialLanguage ?? "English");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);
  function newChat() { setMessages([]); setDraft(""); setMobileOpen(false); }
  function send() {
    if (!draft.trim() && !image) return;
    setMessages((current) => [...current, { text: draft.trim(), image: image?.url, status: "not-sent" }]);
    setDraft(""); setImage(null);
  }
  const sidebar = <div className="flex h-full flex-col">
    <div className="flex items-center justify-between px-4 py-5"><Brand /><Button variant="ghost" size="icon" onClick={newChat} aria-label="New chat"><Plus className="size-5" /></Button></div>
    <div className="px-3"><Button variant="outline" className="w-full justify-start gap-2 bg-background" onClick={newChat}><Plus className="size-4" />New chat</Button></div>
    <nav aria-label="Chat history" className="mt-7 flex-1 overflow-y-auto px-5 pb-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your conversations</p><p className="mt-5 text-sm leading-6 text-muted-foreground">Your conversations will appear here.</p></nav>
    <div className="border-t px-3 py-3"><Link href="/profile" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-sidebar-accent"><Settings className="size-4" />Profile & settings</Link><div className="mt-1 flex items-center justify-between"><button type="button" onClick={async () => { await authClient.signOut(); router.push("/login"); router.refresh(); }} className="rounded-lg px-2 py-2 text-sm text-muted-foreground hover:text-foreground">Sign out</button><ThemeToggle /></div></div>
  </div>;
  return <div className="flex h-dvh overflow-hidden bg-background">
    <aside className="hidden w-[272px] shrink-0 border-r bg-sidebar md:block">{sidebar}</aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 md:px-7"><div className="flex items-center gap-2"><Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open chat history" />}><Menu className="size-5" /></SheetTrigger><SheetContent side="left" className="w-[280px] p-0"><SheetTitle className="sr-only">Chat history</SheetTitle>{sidebar}</SheetContent></Sheet><span className="font-medium">New conversation</span></div><div className="md:hidden"><ThemeToggle /></div></header>
      <main className={`flex min-h-0 flex-1 flex-col ${messages.length ? "" : "justify-center"}`}>
        <div className={`mx-auto flex w-full max-w-3xl flex-col px-4 sm:px-6 ${messages.length ? "min-h-0 flex-1 overflow-y-auto py-8" : ""}`}>
          {!messages.length ? <div className="mb-8 text-center"><div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sprout className="size-7" /></div><p className="mb-2 text-sm font-semibold text-primary">Your crop companion</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What is happening with your crops?</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">Describe the signs you see or add a clear photo. We’ll help you understand what to check next.</p></div> : <div className="space-y-6">{messages.map((message, index) => <article key={index} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-4 py-3 text-sm leading-6">{message.image && <Image src={message.image} alt="Crop photo attached to message" width={400} height={256} unoptimized className="mb-3 max-h-64 rounded-lg object-contain" />}{message.text || "Photo attached"}<p className="mt-2 text-xs text-destructive">Not sent · crop analysis is temporarily unavailable</p></div></article>)}<div ref={endRef} /></div>}
        </div>
        <div className={`mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 ${messages.length ? "pt-3" : ""}`}><div className="rounded-2xl border bg-card p-3 shadow-[0_12px_36px_-24px_rgba(0,0,0,.45)]">{image && <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted p-2 text-xs"><Camera className="size-4" /><span className="min-w-0 flex-1 truncate">{image.file.name}</span><button aria-label="Remove photo" onClick={() => setImage(null)}><X className="size-4" /></button></div>}<Textarea aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Describe what you see on your crop..." className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" /><div className="flex items-center justify-between"><div className="flex items-center gap-1"><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) setImage({ file, url: URL.createObjectURL(file) }); }} /><Button variant="ghost" size="icon" aria-label="Attach crop photo" title="Attach crop photo" onClick={() => fileRef.current?.click()}><Camera className="size-4" /></Button><select aria-label="Conversation language" value={language} onChange={async (event) => { const next = event.target.value as Language; const result = await authClient.updateUser({ preferredLanguage: next }); if (!result.error) setLanguage(next); }} className="rounded-lg bg-transparent px-2 py-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">{languages.map((name) => <option key={name}>{name}</option>)}</select></div><Button size="icon" aria-label="Send message" disabled={!draft.trim() && !image} onClick={send} className="rounded-xl"><ArrowUp className="size-4" /></Button></div></div></div>
      </main>
    </div>
  </div>;
}
