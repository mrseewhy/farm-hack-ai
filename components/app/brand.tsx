import Link from "next/link";
import { Sprout } from "lucide-react";

export function Brand({ href = "/chat" }: { href?: string }) {
  return <Link href={href} className="inline-flex items-center gap-2.5 font-semibold tracking-tight text-foreground"><span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sprout className="size-5" /></span><span>FarmHack <span className="text-primary">AI</span></span></Link>;
}
