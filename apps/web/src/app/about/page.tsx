import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/site-chrome';
import { API_DOCS_URL, MCP_URL } from '@/lib/config';

export const metadata: Metadata = { title: 'About FlatMeta', description: 'How FlatMeta works: claim plots of the real world, design them with AI, play, and get found.' };

const STEPS = [
  ['Explore', 'Spin the globe. Every glowing tile is a plot: explorers, creators, local businesses and showcase brands. Zoom in to see their art.'],
  ['Claim', 'Press Claim land and draw a rectangle of cells (each ≈120–190 m). Your first plot, up to 2×2 outside city centres, is free. More land is a one-time purchase.'],
  ['Design', 'The AI Designer writes your page and paints original artwork from a one-line brief. Or upload your own.'],
  ['Play', 'Earn XP for exploring, liking, waving at neighbours and signing guestbooks. Complete quests, unlock badges and frames, climb your city’s leaderboard.'],
  ['Get found', 'Every plot is a fast, shareable page with rich previews, structured data for search engines, and an API and MCP server for AI agents.'],
];

export default function AboutPage() {
  return (
    <PageShell>
      <div id="main" className="max-w-3xl space-y-10">
        <h1 className="text-4xl md:text-5xl font-bold">How FlatMeta works</h1>
        <ol className="space-y-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="surface p-5 flex gap-4">
              <span className="font-display text-3xl font-bold text-gradient w-8">{i + 1}</span>
              <div><h2 className="font-semibold text-lg">{title}</h2><p className="muted mt-1">{body}</p></div>
            </li>
          ))}
        </ol>
        <section className="surface p-6 space-y-2 text-sm">
          <h2 className="text-lg font-bold">Fair play</h2>
          <p className="muted">No crypto, no speculation. Plots are a licence to display your content on FlatMeta, not property or an investment. XP and ranks can’t be bought. Content is moderated by AI and humans, and anyone can report a plot.</p>
          <p className="muted">Showcase plots are original samples that show how well-known organisations could use FlatMeta. They use the organisation’s name only, never logos, and they are clearly labelled as unclaimed and not affiliated. Organisations can claim or remove them at any time.</p>
        </section>
        <section className="surface p-6 space-y-2 text-sm">
          <h2 className="text-lg font-bold">For developers and AI agents</h2>
          <p className="muted">Read the <a className="underline" href={API_DOCS_URL}>REST API docs</a>, or connect an AI agent to our MCP server at <code className="text-[var(--color-teal)]">{MCP_URL}</code>. Create keys in <Link className="underline" href="/dashboard/developers">Developers</Link>.</p>
        </section>
      </div>
    </PageShell>
  );
}
