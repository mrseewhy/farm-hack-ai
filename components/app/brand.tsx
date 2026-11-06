import Link from "next/link";

const Logo = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="32" height="32" rx="8" fill="#236b45" />
    <g fill="#ffffff">
      <path d="M16 2a6 6 0 0 0-6 6v2a6 6 0 0 0 12 0V8a6 6 0 0 0-6-6Z" />
      <path d="M10 12a4 4 0 0 0-4 4v2a4 4 0 0 0 8 0v-2a4 4 0 0 0-4-4Z" />
      <path d="M16 24a2 2 0 0 0-2 2v1a2 2 0 0 0 4 0v-1a2 2 0 0 0-2-2Z" />
      <circle cx="16" cy="14" r="1" />
    </g>
  </svg>
);

export function Brand({ href = "/chat" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2.5 font-semibold tracking-tight text-foreground"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Logo />
      </span>
      <span>
        FarmHack <span className="text-primary">AI</span>
      </span>
    </Link>
  );
}
