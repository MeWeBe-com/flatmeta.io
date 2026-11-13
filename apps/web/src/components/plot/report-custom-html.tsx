'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { post } from '@/lib/api';
import { useGame } from '../providers';
import { Modal } from '../ui';

/** Report only the owner's custom HTML (G8). Three reports from different people pause it until a moderator looks. */
export function ReportCustomHtml({ plotId }: { plotId: string }) {
  const { toast } = useGame();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const send = async () => {
    await post(`/plots/${plotId}/report`, { reason, about: 'custom_html' }).catch(() => undefined);
    setOpen(false);
    setReason('');
    toast({ kind: 'success', title: 'Thanks, our moderators will take a look.' });
  };
  return (
    <>
      <button type="button" className="text-xs muted inline-flex items-center gap-1 hover:text-[var(--text)] shrink-0" onClick={() => setOpen(true)}>
        <Flag size={11} /> Report this content
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Report this custom content">
        <p className="text-sm muted mb-3">What does it do wrong? For example a scam, a fake login, something that slows your device down, or offensive content.</p>
        <textarea className="input" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
        <button className="btn-danger w-full mt-3" disabled={reason.trim().length < 3} onClick={() => void send()}>Send report</button>
      </Modal>
    </>
  );
}
