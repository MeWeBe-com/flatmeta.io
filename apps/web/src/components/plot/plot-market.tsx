'use client';

import { ComingSoon } from '../coming-soon';
import { PAID_CHECKOUT } from '@/lib/config';
import { useCallback, useEffect, useState } from 'react';
import { Store, Tag, X } from 'lucide-react';
import { ApiError, api, del, patch, post } from '@/lib/api';
import { usd } from '@/lib/format';
import type { Plot } from '@/lib/types';
import { useAfterSignIn, useGame, useSession } from '../providers';
import { Modal, Spinner } from '../ui';

interface Check { canList: boolean; reason: string | null; minPriceCents: number; maxPriceCents: number | null; feeBps: number }

/** Buy button for visitors, and the sell/price/cancel controls for the owner. */
export function PlotMarket({ plot, canEdit: canEditInitial }: { plot: Plot; canEdit: boolean }) {
  const [canEdit, setCanEdit] = useState(canEditInitial);
  const { me, openSignIn } = useSession();
  const { toast } = useGame();
  const [listing, setListing] = useState(plot.listing ?? null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [price, setPrice] = useState('');

  // Fresh listing state for the signed-in viewer.
  useEffect(() => {
    fetch(`/api/v1/plots/${plot.id}`).then((r) => (r.ok ? r.json() : null)).then((d: { plot: Plot } | null) => { if (d) { setListing(d.plot.listing ?? null); setCanEdit(!!d.plot.canEdit); } }).catch(() => undefined);
  }, [plot.id, me.user?.id]);

  const openSell = useCallback(async () => {
    setOpen(true);
    setPrice(listing ? (listing.priceCents / 100).toString() : '');
    try {
      setCheck(await api<Check>(`/plots/${plot.id}/listing-check`));
    } catch {
      setCheck(null);
    }
  }, [plot.id, listing]);

  const cents = Math.round(Number(price) * 100);
  const valid = Number.isFinite(cents) && check && cents >= check.minPriceCents && (check.maxPriceCents === null || cents <= check.maxPriceCents);
  const fee = check ? Math.floor((cents * check.feeBps) / 10_000) : 0;

  const fail = (e: unknown) => toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'That did not work' });
  const [afterSignIn, signedInGo] = useAfterSignIn();
  const buy = async () => {
    if (!listing) return;
    if (!me.user) return openSignIn('Sign in to buy this plot.', afterSignIn);
    setBusy(true);
    try {
      const r = await post<{ url: string }>(`/listings/${listing.id}/buy`);
      window.location.assign(r.url);
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  };
  useEffect(() => {
    if (signedInGo) void buy(); // the purchase the visitor started before signing in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInGo]);
  const save = async () => {
    setBusy(true);
    try {
      const r = listing ? await patch<{ listing: { id: string; priceCents: number; currency: string; version: number } }>(`/listings/${listing.id}`, { priceCents: cents }) : await post<{ listing: { id: string; priceCents: number; currency: string; version: number } }>(`/plots/${plot.id}/list`, { priceCents: cents });
      setListing(r.listing);
      setOpen(false);
      toast({ kind: 'success', title: 'Listed for ' + usd(cents) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!listing) return;
    setBusy(true);
    try {
      await del(`/listings/${listing.id}`);
      setListing(null);
      setOpen(false);
      toast({ kind: 'info', title: 'Taken off the market' });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit && !listing) return null;
  if (!canEdit && listing) {
    return (
      <section className="surface p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm muted"><Store size={15} /> For sale</div>
        <div className="text-3xl font-display font-bold">{usd(listing.priceCents)}</div>
        {PAID_CHECKOUT ? <button className="btn-primary w-full" disabled={busy} onClick={() => void buy()}>{busy && <Spinner />} Buy this plot</button> : <ComingSoon compact text="Buying plots from other explorers is coming soon." />}
        <p className="text-xs muted">You get the licence to use this spot on the map and everything on it. Not an investment. If the seller changes the price or sells it first, you are refunded automatically.</p>
      </section>
    );
  }
  if (plot.kind === 'showcase') return null;
  return (
    <>
      <section className="surface p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm muted"><Store size={15} /> Marketplace</div>
        {listing ? (
          <>
            <div className="text-2xl font-display font-bold">Listed for {usd(listing.priceCents)}</div>
            <div className="flex gap-2">
              <button className="btn-ghost btn-sm flex-1" onClick={() => void openSell()}><Tag size={14} /> Change price</button>
              <button className="btn-ghost btn-sm" disabled={busy} onClick={() => void cancel()}><X size={14} /> Take down</button>
            </div>
          </>
        ) : plot.kind === 'homestead' ? (
          <p className="text-sm muted">Your free Homestead can’t be resold. It is yours to use and design.</p>
        ) : PAID_CHECKOUT ? (
          <button className="btn-ghost w-full" onClick={() => void openSell()}><Tag size={15} /> Sell this plot</button>
        ) : (
          <ComingSoon compact text="Selling plots is coming soon." />
        )}
      </section>
      <Modal open={open} onClose={() => setOpen(false)} title={listing ? 'Change price' : 'Sell this plot'}>
        <div className="space-y-4">
          {check && !check.canList && !listing ? (
            <p className="text-sm text-[var(--color-coral)]">{check.reason}</p>
          ) : (
            <>
              <label className="block">
                <span className="label">Price (USD)</span>
                <input className="input" inputMode="decimal" autoFocus value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="25.00" />
              </label>
              {check && (
                <ul className="text-sm space-y-1 muted">
                  <li>Minimum {usd(check.minPriceCents)}{check.maxPriceCents ? ` · maximum ${usd(check.maxPriceCents)} while the plot is new` : ''}</li>
                  {valid && <li className="text-[var(--text)]">Platform fee {(check.feeBps / 100).toFixed(0)}%: {usd(fee)} · <b>you receive {usd(cents - fee)}</b></li>}
                </ul>
              )}
              <p className="text-xs muted">The buyer gets the licence for this spot and its content, and you lose it. Payouts go to your connected account from Billing.</p>
              <button className="btn-primary w-full" disabled={!valid || busy} onClick={() => void save()}>{busy && <Spinner />} {listing ? 'Update price' : 'List for sale'}</button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
