"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUp, Camera, ChevronDown, Menu, MessageSquare, Plus, Sprout, X } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const sampleHistory = [
  { id: "tomato-leaves", title: "Yellow leaves on tomato plants", group: "Today" },
  { id: "tomato-spots", title: "Dark spots after rainfall", group: "Yesterday" },
  { id: "healthy-tomato", title: "Checking a young tomato plant", group: "Previous 7 days" },
];
type Message = { role: "farmer" | "assistant"; text: string; image?: string };
const sampleConversation: Message[] = [
  { role: "farmer", text: "Some leaves on my tomato plants are turning yellow. What should I check?" },
  { role: "assistant", text: "Yellow leaves can have several causes, including watering stress, nutrient problems, or pests. Check whether older or newer leaves are affected first, look under leaves for insects, and note whether there are spots or curling. A close photo of the affected leaf and one of the whole plant would help narrow it down." },
];

export function ChatScreen({ initialId }: { initialId?: string }) {
  const [selected, setSelected] = useState(initialId);
  const [messages, setMessages] = useState<Message[]>(initialId ? sampleConversation : []);
  const [draft, setDraft] = useState("");
  const [language, setLanguage] = useState("English");
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);
  function newChat() { setSelected(undefined); setMessages([]); setDraft(""); setMobileOpen(false); window.history.replaceState(null, "", "/chat"); }
  function openChat(id: string) { setSelected(id); setMessages(sampleConversation); setDraft(""); setMobileOpen(false); window.history.replaceState(null, "", `/chat/${id}`); }
  function send() {
    if (!draft.trim() && !image) return;
    const next: Message = { role: "farmer", text: draft.trim(), image: image?.url };
    setMessages((current) => [...current, next]);
    setDraft(""); setImage(null);
    // No fabricated AI answer in this UI-only phase.
  }
  const sidebar = <div className="flex h-full flex-col"><div className="flex items-center justify-between px-4 py-5"><Brand /><Button variant="ghost" size="icon" onClick={newChat} aria-label="New chat"><Plus className="size-5" /></Button></div><div className="px-3"><Button variant="outline" className="w-full justify-start gap-2 bg-background" onClick={newChat}><Plus className="size-4" />New chat</Button></div><nav aria-label="Chat history" className="mt-7 flex-1 overflow-y-auto px-3 pb-5"><p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your conversations</p>{["Today", "Yesterday", "Previous 7 days"].map((group) => <div key={group} className="mt-5"><p className="mb-2 px-2 text-xs text-muted-foreground">{group}</p>{sampleHistory.filter((item) => item.group === group).map((item) => <button key={item.id} onClick={() => openChat(item.id)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm hover:bg-sidebar-accent ${selected === item.id ? "bg-sidebar-accent font-medium" : ""}`}><MessageSquare className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{item.title}</span></button>)}</div>)}</nav><div className="border-t px-3 py-3"><div className="flex items-center justify-between"><Link href="/login" className="rounded-lg px-2 py-2 text-sm text-muted-foreground hover:text-foreground">Preview account</Link><ThemeToggle /></div><p className="px-2 text-[11px] text-muted-foreground">Sample history · UI preview</p></div></div>;
  return <div className="flex h-dvh overflow-hidden bg-background"><aside className="hidden w-[272px] shrink-0 border-r bg-sidebar md:block">{sidebar}</aside><div className="flex min-w-0 flex-1 flex-col"><header className="flex h-16 shrink-0 items-center justify-between border-b px-4 md:px-7"><div className="flex items-center gap-2"><Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open chat history" />}><Menu className="size-5" /></SheetTrigger><SheetContent side="left" className="w-[280px] p-0"><SheetTitle className="sr-only">Chat history</SheetTitle>{sidebar}</SheetContent></Sheet><span className="font-medium">{selected ? "Tomato conversation" : "New conversation"}</span><ChevronDown className="size-4 text-muted-foreground" /></div><div className="flex items-center gap-2"><span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary sm:inline">Tomato pilot</span><span className="md:hidden"><ThemeToggle /></span></div></header><main className={`flex min-h-0 flex-1 flex-col ${messages.length ? "" : "justify-center"}`}><div className={`mx-auto flex w-full max-w-3xl flex-col px-4 sm:px-6 ${messages.length ? "min-h-0 flex-1 overflow-y-auto py-8" : ""}`}>
    {!messages.length ? <div className="mb-8 text-center"><div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sprout className="size-7" /></div><p className="mb-2 text-sm font-semibold text-primary">Your crop companion</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What is happening with your tomato plants?</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">Describe the signs you see or add a clear photo. We’ll help you understand what to check next.</p></div> : <div className="space-y-8">{messages.map((message, index) => <article key={index} className={message.role === "farmer" ? "flex justify-end" : "flex gap-3"}>{message.role === "assistant" && <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sprout className="size-4" /></span>}<div className={message.role === "farmer" ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-4 py-3 text-sm leading-6" : "max-w-[90%] pt-1 text-sm leading-7"}>{message.image && <Image src={message.image} alt="Crop photo attached to message" width={400} height={256} unoptimized className="mb-3 max-h-64 rounded-lg object-contain" />}{message.text || "Photo attached"}{message.role === "assistant" && <p className="mt-3 text-xs text-muted-foreground">Sample guidance for interface preview · not a diagnosis</p>}</div></article>)}<div ref={endRef} /></div>}
  </div><div className={`mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 ${messages.length ? "pt-3" : ""}`}><div className="rounded-2xl border bg-card p-3 shadow-[0_12px_36px_-24px_rgba(0,0,0,.45)]">{image && <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted p-2 text-xs"><Camera className="size-4" /><span className="min-w-0 flex-1 truncate">{image.file.name}</span><button aria-label="Remove photo" onClick={() => setImage(null)}><X className="size-4" /></button></div>}<Textarea aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Describe what you see on your crop..." className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" /><div className="flex items-center justify-between"><div className="flex items-center gap-1"><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) setImage({ file, url: URL.createObjectURL(file) }); }} /><Button variant="ghost" size="icon" aria-label="Attach crop photo" title="Attach crop photo" onClick={() => fileRef.current?.click()}><Camera className="size-4" /></Button><select aria-label="Conversation language" value={language} onChange={(event) => setLanguage(event.target.value)} className="rounded-lg bg-transparent px-2 py-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">{["English", "Yoruba", "Hausa", "Igbo"].map((name) => <option key={name}>{name}</option>)}</select></div><Button size="icon" aria-label="Send message" disabled={!draft.trim() && !image} onClick={send} className="rounded-xl"><ArrowUp className="size-4" /></Button></div></div><p className="mt-2 text-center text-[11px] text-muted-foreground">UI preview only. Messages and photos are not saved or analysed yet.</p></div></main></div></div>;
}
