import Link from 'next/link';

export interface Brand { slug: string; title: string; countryCode: string | null; thumbUrl: string | null; sector: string | null; city: string | null; source: string | null; logoUrl?: string | null }
export interface BrandsRes { brands: Brand[]; hasMore: boolean; countries: { code: string; name: string; count: number }[] }

const flag = (cc: string) => cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

/** G12: the companies with land reserved near their headquarters, by country. Server-rendered for search engines. */
export function BrandsDirectory({ data, country, q, page }: { data: BrandsRes; country?: string; q?: string; page: number }) {
  const base = country ? `/brands/${country.toLowerCase()}` : '/brands';
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-bold">{country ? `Companies in ${data.countries.find((c) => c.code === country)?.name ?? country} on FlatMeta` : 'Companies on FlatMeta'}</h1>
        <p className="muted max-w-2xl">
          Land is reserved for these companies next to their real headquarters on the world map. None of them is affiliated with FlatMeta: each plot is waiting for its company to claim it. Work at one? Open its plot and claim it with your work email or a DNS record. Logos are shown only to identify each company for claiming; trademarks belong to their owners.
        </p>
        <form action={base} className="flex gap-2 max-w-md" role="search">
          <input className="input" name="q" defaultValue={q} placeholder="Search companies" aria-label="Search companies" />
          <button className="btn-primary">Search</button>
        </form>
      </header>
      <nav aria-label="Countries" className="flex flex-wrap gap-2">
        <Link href="/brands" className={`chip ${!country ? 'chip-teal' : ''}`}>All</Link>
        {data.countries.map((c) => (
          <Link key={c.code} href={`/brands/${c.code.toLowerCase()}`} className={`chip normal-case tracking-normal ${country === c.code ? 'chip-teal' : ''}`}>
            {flag(c.code)} {c.name} · {c.count}
          </Link>
        ))}
      </nav>
      {data.brands.length === 0 ? (
        <p className="muted surface p-6">No companies here yet. New ones are added every day.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.brands.map((b) => (
            <li key={b.slug}>
              <Link href={`/p/${b.slug}`} className="surface p-3 flex gap-3 items-center hover:border-[var(--color-teal)]">
                <span className="relative shrink-0">
                  {b.thumbUrl ? <img src={b.thumbUrl} alt="" className="size-14 rounded-xl object-cover" loading="lazy" /> : <span className="block size-14 rounded-xl bg-white/5" />}
                  {b.logoUrl && <img src={b.logoUrl} alt={`${b.title} logo`} className="absolute -bottom-1 -right-1 size-7 rounded-lg bg-white p-0.5 object-contain shadow" loading="lazy" />}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold truncate">{b.title}</span>
                  <span className="block text-xs muted truncate">{[b.sector, b.city, b.countryCode && flag(b.countryCode)].filter(Boolean).join(' · ')}</span>
                  <span className="block text-[11px] text-[var(--color-gold)]">Reserved · not affiliated with FlatMeta</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav className="flex gap-3" aria-label="Pages">
        {page > 1 && <Link className="btn-ghost" href={`${base}?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}>Previous</Link>}
        {data.hasMore && <Link className="btn-ghost" href={`${base}?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}>Next</Link>}
      </nav>
    </div>
  );
}
