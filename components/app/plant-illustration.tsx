/**
 * Decorative plant illustration for the empty chat state.
 *
 * Inline SVG rather than a bitmap: it stays sharp on low-end phones, follows the
 * theme through `currentColor`, and adds no image request to the critical path.
 */
export function PlantIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 176 128"
      role="img"
      aria-label="A young plant growing in a pot"
      className={className}
    >
      <circle cx="132" cy="28" r="14" className="fill-amber-400/30" />
      <circle cx="132" cy="28" r="9" className="fill-amber-400/60" />
      <path
        d="M88 96V54"
        className="stroke-emerald-700/70"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M88 70c-16 0-26-9-28-24 16-1 26 7 28 24Z"
        className="fill-emerald-600/70"
      />
      <path
        d="M88 60c14-2 22-11 22-25-14 0-21 9-22 25Z"
        className="fill-emerald-500/70"
      />
      <path
        d="M88 50c-9-2-14-8-15-17 9 0 14 6 15 17Z"
        className="fill-emerald-700/60"
      />
      <path
        d="M44 92h88l-9 28H53l-9-28Z"
        className="fill-orange-300/70 dark:fill-orange-400/40"
      />
      <path
        d="M40 88h96v10H40z"
        className="fill-orange-400/80 dark:fill-orange-300/40"
      />
      <path
        d="M24 118h128"
        className="stroke-foreground/10"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
