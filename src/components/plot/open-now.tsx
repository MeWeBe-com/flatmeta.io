'use client';
import { useEffect, useState } from 'react';
import { openNow } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { BusinessInfo } from '@/lib/types';

export function OpenNowBadge({ hours, timezone }: { hours: BusinessInfo['hours']; timezone?: string }) {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => setOpen(openNow(hours, timezone)), [hours, timezone]);
  if (open === null) return null;
  return <span className={open ? 'chip chip-teal' : 'chip chip-coral'}>{open ? t('plot.openNow') : t('plot.closed')}</span>;
}
