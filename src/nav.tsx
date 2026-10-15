/**
 * Bottom tab bar matching the mockup: 5 tabs, white background, top hairline,
 * active tint is forest.
 */
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Home, Calendar, MessageSquare, User, ListChecks } from 'lucide-react';
import { cx, confirmLeaveIfUnsaved } from './design';
import { dm, volunteer, getToken } from './api';

// Oct 9 client: Profile is now on the bottom bar (it was only in the menu).
// "You" became "Activity" so the two person-ish tabs aren't confused.
// BottomNav is only rendered for drivers (App.tsx volunteer branch).
const TABS = [
  { to: '/',         label: 'Home',     icon: Home,    end: true },
  { to: '/pickups',  label: 'Pickups',  icon: Calendar },
  { to: '/chat',     label: 'Chat',     icon: MessageSquare },
  { to: '/you',      label: 'Activity', icon: ListChecks },
  { to: '/profile',  label: 'Profile',  icon: User },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Total unread across DMs + pickup chats — drives the dot on the Chat tab.
  // Gated on auth so it never fires (and 401-redirects) from the login screen.
  const authed = !!getToken();
  const dmUnread = useQuery({ queryKey: ['dm-unread'], queryFn: dm.unread, refetchInterval: 20_000, enabled: authed });
  const pickupUnread = useQuery({ queryKey: ['pickup-chat-summary'], queryFn: volunteer.chatSummary, refetchInterval: 20_000, enabled: authed });
  const chatUnread = (dmUnread.data?.data?.total ?? 0) + (pickupUnread.data?.data?.total ?? 0);
  if (pathname.startsWith('/pickup/') || pathname === '/login' || pathname.startsWith('/post')) return null;
  // Sits as the last child of the fixed-height PhoneFrame column — pinned to
  // the bottom by normal flex flow, can't be pushed off-screen by tall content.
  return (
    <nav className="shrink-0 bg-paper border-t border-line md:rounded-b-[28px]">
      <ul className="flex justify-around items-center h-[62px]">
        {TABS.map((t) => (
          <li key={t.to} className="flex-1">
            {/* Oct 9 client: ask before leaving a screen with unsaved edits (Profile). */}
            <NavLink to={t.to} end={t.end}
                     onClick={async (e) => {
                       if (pathname === t.to) return;
                       e.preventDefault();
                       if (await confirmLeaveIfUnsaved()) navigate(t.to);
                     }}>
              {({ isActive }) => (
                <div className={cx('flex flex-col items-center gap-1 haptic',
                                   isActive ? 'text-forest' : 'text-[#AEB6AA]')}>
                  <div className="relative">
                    <t.icon size={22} strokeWidth={2} />
                    {t.to === '/chat' && chatUnread > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 grid place-items-center rounded-full bg-clay text-paper text-[10px] font-extrabold border border-cream">
                        {chatUnread > 99 ? '99+' : chatUnread}
                      </span>
                    )}
                  </div>
                  <span className="text-[12px] font-extrabold">{t.label}</span>
                </div>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
