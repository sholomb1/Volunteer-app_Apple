/**
 * Oct 23 client ("Same style everywhere"): the React side of src/display.ts.
 *   <Name>   a person / place name inside <bdi dir="auto"> (Hebrew reads right next to English)
 *   <Phone>  "845-356-1637" as a tel: link (E.164)
 *   <Addr>   the short address ("8 Hershel Terrace, Monsey"), the full one in the tooltip
 *   <StatusPill> the one status pill (same words + colors on every screen)
 */
import type { ReactNode } from 'react';
import { STATUS, displayPhone, personFull, personShort, shortAddress, statusKeyOf, telHref, type StatusInput, type StatusKey } from './display';

const join = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export function Name({ children, first, last, short, className }: {
  children?: ReactNode; first?: string | null; last?: string | null; short?: boolean; className?: string;
}) {
  const text = children ?? (short ? personShort(first, last) : personFull(first, last));
  return <bdi dir="auto" className={className}>{text}</bdi>;
}

export function Phone({ phone, className, link = true }: { phone: string | null | undefined; className?: string; link?: boolean }) {
  if (!phone || !String(phone).trim()) return null;
  const shown = displayPhone(phone);
  if (!link) return <span className={join('whitespace-nowrap', className)}>{shown}</span>;
  return <a href={telHref(phone)} onClick={(e) => e.stopPropagation()} className={join('whitespace-nowrap', className)}>{shown}</a>;
}

export function Addr({ address, className }: { address: string | null | undefined; className?: string }) {
  if (!address || !String(address).trim()) return null;
  const s = shortAddress(address);
  return <span className={className} title={s !== String(address).trim() ? String(address).trim() : undefined}>{s}</span>;
}

/** The one status pill. Pass `k` or a pickup-ish row (`of`). `extra` adds e.g. the done time. */
export function StatusPill({ k, of, extra, className, icon = false, title }: {
  k?: StatusKey; of?: StatusInput; extra?: string; className?: string; icon?: boolean; title?: string;
}) {
  const key: StatusKey = k ?? statusKeyOf(of ?? {});
  const s = STATUS[key];
  return (
    <span data-status={key} title={title}
          className={join('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold', s.pill, className)}>
      {icon ? `${s.icon} ` : ''}{s.word}{extra ? ` ${extra}` : ''}
    </span>
  );
}
