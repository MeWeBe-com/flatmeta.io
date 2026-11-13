import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { INSIGHT_RULES, articleProblems, insightList } from '@/lib/insights';
import { serverApi } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Insights check', robots: { index: false } };

/**
 * S5: every insights article checked against the rules in docs/positioning.md (title, description, lang, og:image,
 * links to FlatMeta pages, on topic). Admins only: the list is read on the server from INSIGHTS_DIR.
 */
export default async function AdminInsightsPage() {
  const me = await serverApi<{ user: { role: string } | null }>('/me');
  if (me?.user?.role !== 'admin') notFound();
  const list = (await insightList()).map((a) => ({ ...a, problems: articleProblems(a) }));
  const bad = list.filter((a) => a.problems.length);
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Insights check</h1>
        <p className="text-sm muted">
          {list.length} articles · <span className={bad.length ? 'text-[var(--color-coral)]' : 'text-[var(--color-teal)]'} data-testid="insights-bad-count">{bad.length} break the rules</span>. Rules: title ≤ {INSIGHT_RULES.titleMax} characters, description {INSIGHT_RULES.descriptionMin}–{INSIGHT_RULES.descriptionMax}, lang &quot;{INSIGHT_RULES.lang}&quot;, an og:image, at least {INSIGHT_RULES.minInternalLinks} links to FlatMeta pages, on topic (docs/positioning.md). Fix them in the insights automation, not here.
        </p>
      </header>
      {list.length === 0 && <p className="surface p-6 muted">No articles (INSIGHTS_DIR is not set on this server, or the folder is empty).</p>}
      <ul className="space-y-2">
        {[...bad, ...list.filter((a) => !a.problems.length)].map((a) => (
          <li key={a.path} className="surface p-4 space-y-1" data-testid="insight-row">
            <div className="flex flex-wrap items-baseline gap-2">
              <a className="font-semibold underline break-all" href={a.path} target="_blank" rel="noopener">{a.title ?? a.path}</a>
              <span className="text-xs muted">{a.date}</span>
              <span className={`chip ${a.problems.length ? 'chip-coral' : 'chip-teal'}`}>{a.problems.length ? `${a.problems.length} problem${a.problems.length > 1 ? 's' : ''}` : 'OK'}</span>
            </div>
            {a.problems.length > 0 && (
              <ul className="text-sm list-disc pl-5 text-[var(--color-coral)]">
                {a.problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
