'use client';

import { CheckCircle2, Search, Share2 } from 'lucide-react';
import { plotMetaDescription, plotTitle, plotUrl } from '@/lib/seo';
import type { Plot } from '@/lib/types';

export const SEO_READY_WORDS = 50;
export const wordCount = (md: string) =>
  (md.replace(/\]\([^)]*\)/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/[#>*_`~[\]()!|-]+/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu) ?? []).length;

/**
 * S3: what search engines and share cards will show for this plot, live as the owner types: the Google result
 * (title, address, description) and the share card, plus length guidance and an "SEO-ready" badge at 50+ words.
 * Empty mini-pages stay out of search engines (noindex) until they have a description.
 */
export function SeoPreview({ plot }: { plot: Plot }) {
  const words = wordCount(plot.descriptionMd ?? '');
  const ready = words >= SEO_READY_WORDS;
  const title = plotTitle(plot);
  const description = plotMetaDescription(plot);
  const url = plotUrl(plot.slug);
  return (
    <section className="surface p-4 space-y-3" aria-label="Search and share preview" data-testid="seo-preview">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {ready ? (
          <span className="chip chip-teal" data-testid="seo-ready"><CheckCircle2 size={12} /> SEO-ready</span>
        ) : (
          <span className="chip">{words} / {SEO_READY_WORDS} words</span>
        )}
        <span className="muted text-xs">
          {words === 0
            ? 'Without a description this page stays out of search engines (noindex). Say what the place is, where, and why visit.'
            : ready
              ? 'Long enough to rank: keep it specific to this place.'
              : `Add about ${SEO_READY_WORDS - words} more words (what it is, where, why visit) to be SEO-ready.`}
        </span>
      </div>
      <div>
        <div className="text-xs muted flex items-center gap-1.5 mb-1"><Search size={12} /> Google result</div>
        <div className="rounded-xl bg-white text-[#202124] p-3 font-[arial,sans-serif]">
          <div className="text-xs text-[#4d5156] truncate">{url.replace(/^https?:\/\//, '')}</div>
          <div className="text-lg text-[#1a0dab] leading-snug truncate">{title} · FlatMeta</div>
          <p className="text-sm text-[#4d5156] line-clamp-2">{description}</p>
        </div>
        <div className="text-xs muted mt-1">{description.length} characters (140–160 is best)</div>
      </div>
      <div>
        <div className="text-xs muted flex items-center gap-1.5 mb-1"><Share2 size={12} /> Share card</div>
        <div className="rounded-xl overflow-hidden border border-[var(--line)] max-w-sm">
          {plot.coverImageUrl ? (
            <img src={plot.thumbUrl ?? plot.coverImageUrl} alt="" className="w-full aspect-[1.91/1] object-cover" />
          ) : (
            <div className="w-full aspect-[1.91/1] bg-gradient-to-br from-[var(--color-teal)]/30 to-[var(--color-violet)]/30" />
          )}
          <div className="p-3">
            <div className="text-xs muted uppercase">flatmeta.io</div>
            <div className="font-semibold truncate">{title}</div>
            <p className="text-xs muted line-clamp-2">{description}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
