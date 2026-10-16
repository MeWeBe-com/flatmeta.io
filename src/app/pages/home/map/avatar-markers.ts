import * as Leaflet from 'leaflet';
import { escapeHtml, safeImageSrc } from 'src/app/core/html';

const FALLBACK_AVATAR = 'assets/icon/avatar-default.svg';

/** Circular avatar with a dark ring + drop shadow (readable on light and dark maps) and @username under it. */
export function avatarIcon(opts: { image: string; username: string; fullname: string; own: boolean; guest: boolean }) {
  const size = opts.own ? 56 : 48;
  const handle = escapeHtml(opts.username || 'citizen');
  const title = escapeHtml(`${opts.fullname || opts.username} (@${opts.username})`);
  return Leaflet.divIcon({
    className: `fm-avatar ${opts.own ? 'fm-avatar--own' : 'fm-avatar--other'}`,
    iconSize: [size + 40, size + 22],
    iconAnchor: [(size + 40) / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `
      ${opts.own ? '<div class="fm-avatar__pulse"></div>' : ''}
      <div class="fm-avatar__ring ${opts.guest ? 'is-guest' : ''}" title="${title}" style="width:${size}px;height:${size}px">
        <img src="${safeImageSrc(opts.image, FALLBACK_AVATAR)}" alt="" draggable="false"/>
      </div>
      <div class="fm-avatar__name">@${handle}${opts.own ? ' <span class="fm-avatar__you">YOU</span>' : ''}</div>
    `,
  });
}

export function speechBubbleIcon(text: string, typing = false) {
  return Leaflet.divIcon({
    className: 'fm-bubble',
    iconSize: [190, 46],
    iconAnchor: [95, 72],
    html: `<div class="fm-bubble__body ${typing ? 'is-typing' : ''}">${escapeHtml(text)}</div>`,
  });
}

/** Thumbnail badge for a land area when zoomed out (roam/planet levels). */
export function areaBadgeIcon(opts: { image: string; title: string; tiles: number; onSale: boolean; size: number }) {
  return Leaflet.divIcon({
    className: 'fm-area-badge',
    iconSize: [opts.size, opts.size],
    iconAnchor: [opts.size / 2, opts.size / 2],
    html: `
      <div class="fm-area-badge__thumb ${opts.onSale ? 'on-sale' : ''}" title="${escapeHtml(opts.title)} (${opts.tiles} squares)">
        ${opts.image ? `<img src="${safeImageSrc(opts.image, 'assets/icon/placeholder-land.svg')}" alt=""/>` : ''}
        <span class="fm-area-badge__count">${Number(opts.tiles) || 0}</span>
      </div>
    `,
  });
}

/** Small DOM helper so popups never use innerHTML with user data. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; attrs?: Record<string, string> } = {},
  children: Array<Node | null | false> = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  Object.entries(props.attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
  children.forEach((c) => c && node.appendChild(c));
  return node;
}

export interface CitizenCardActions {
  chat(): void;
  connect(): void;
  report(): void;
}

/** Popup shown when clicking someone else's avatar. */
export function citizenCard(
  person: { fullname: string; username: string; avatarUrl: string; isGuest: boolean },
  state: { friend: boolean; requested: boolean; canReport: boolean },
  actions: CitizenCardActions
): HTMLElement {
  const img = el('img', { className: 'fm-card__avatar', attrs: { alt: '' } });
  img.src = person.avatarUrl || FALLBACK_AVATAR;
  img.onerror = () => (img.src = FALLBACK_AVATAR);

  const btn = (label: string, cls: string, fn: () => void, disabled = false) => {
    const b = el('button', { className: `fm-card__btn ${cls}`, text: label, attrs: { type: 'button' } });
    b.disabled = disabled;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    return b;
  };

  const tag = state.friend ? 'Connected' : person.isGuest ? 'Guest' : 'Citizen';
  return el('div', { className: 'fm-card' }, [
    el('div', { className: 'fm-card__head' }, [
      img,
      el('div', {}, [
        el('h4', { text: person.fullname || person.username }),
        el('div', { className: 'fm-card__handle', text: `@${person.username} · ${tag}` }),
      ]),
    ]),
    el('div', { className: 'fm-card__actions' }, [
      btn('Chat', 'is-primary', actions.chat),
      btn(state.friend ? 'Connected ✓' : state.requested ? 'Requested' : '+ Connect', '', actions.connect, state.friend || state.requested),
      state.canReport ? btn('Report', 'is-danger', actions.report) : null,
    ]),
  ]);
}

/** Popup on my own avatar. */
export function ownCard(
  me: { fullname: string; username: string; isGuest: boolean },
  actions: { save(): void; avatar(): void }
): HTMLElement {
  const b = (label: string, cls: string, fn: () => void) => {
    const x = el('button', { className: `fm-card__btn ${cls}`, text: label, attrs: { type: 'button' } });
    x.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    return x;
  };
  if (me.isGuest) {
    return el('div', { className: 'fm-card' }, [
      el('h4', { text: 'Hello Guest!' }),
      el('p', {
        text: 'You can walk around, chat and draft up to 100 free squares right now. Add your email when you want to keep your land and avatar.',
      }),
      el('div', { className: 'fm-card__actions' }, [b('Sign up / Save', 'is-primary', actions.save), b('Edit avatar', '', actions.avatar)]),
    ]);
  }
  return el('div', { className: 'fm-card' }, [
    el('h4', { text: me.fullname }),
    el('div', { className: 'fm-card__handle', text: `@${me.username}` }),
    el('div', { className: 'fm-card__actions' }, [b('Edit avatar', 'is-primary', actions.avatar)]),
  ]);
}
