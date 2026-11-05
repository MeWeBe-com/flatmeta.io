import { Clock } from 'lucide-react';
import { COMING_SOON } from '@/lib/config';

/** Shown instead of a pay button while PAID_CHECKOUT_ENABLED is off. Server-safe: no client-only helpers. */
export function ComingSoon({ text = COMING_SOON, className, compact = false }: { text?: string; className?: string; compact?: boolean }) {
  return (
    <p role="note" className={['inline-flex items-start gap-2 rounded-xl px-3 py-2 bg-[rgb(255_201_77/.1)] text-[var(--color-gold)]', compact ? 'text-xs' : 'text-sm', className].filter(Boolean).join(' ')}>
      <Clock size={compact ? 13 : 15} className="mt-0.5 shrink-0" aria-hidden /> <span>{text}</span>
    </p>
  );
}
