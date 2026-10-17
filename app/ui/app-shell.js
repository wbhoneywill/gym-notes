'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from '@clerk/nextjs';
import SyncManager from '@/app/components/SyncManager';

const items = [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/templates', label: 'Plans', icon: 'plans' },
  { href: '/train', label: 'Train', icon: 'train', primary: true },
  { href: '/history', label: 'History', icon: 'history' },
  { href: '/exercises', label: 'Exercises', icon: 'exercises' },
];

// App pages that use the shell/header but are not in the bottom nav
// (reached from the dashboard), kept out of the 5-item mobile bar.
const extraAppPaths = ['/progress', '/settings', '/help'];

function NavIcon({ name }) {
  const paths = {
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7" /></>,
    plans: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    train: <><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" /></>,
    history: <><path d="M4 5v5h5" /><path d="M5.5 18a8 8 0 1 0-1.3-8" /><path d="M12 7v5l3 2" /></>,
    exercises: <><path d="M8 4h8M9 4v4l-4 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-4-9V4" /><path d="M7 15h10" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isApp =
    items.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`)) ||
    extraAppPaths.some((href) => pathname === href || pathname.startsWith(`${href}/`));
  const isLiveSession = /^\/train\/[^/]+$/.test(pathname);

  if (!isApp) return children;

  return (
    <div className={`app-shell${isLiveSession ? ' app-shell-focus' : ''}`}>
      <header className="app-header">
        <Link className="app-wordmark" href="/dashboard" aria-label="GymNotes home">
          GYM<span>NOTES</span>
        </Link>
        <div className="app-header-actions">
          <SyncManager />
          <Link className="app-help-link" href="/help" aria-label="Help and frequently asked questions">?</Link>
          <Link className="app-settings-link" href="/settings" aria-label="Settings">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="22" height="22">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
          <SignOutButton redirectUrl="/">
            <button className="app-logout-button" type="button" aria-label="Log out" title="Log out">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="22" height="22">
                <path d="M10 5H5v14h5" />
                <path d="M14 8l4 4-4 4M18 12H9" />
              </svg>
            </button>
          </SignOutButton>
        </div>
      </header>
      <div className="app-content">{children}</div>
      {!isLiveSession && (
        <nav className="bottom-nav" aria-label="App navigation">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${active ? 'active ' : ''}${item.primary ? 'primary' : ''}`.trim()}
                aria-current={active ? 'page' : undefined}
              >
                <span className="nav-icon"><NavIcon name={item.icon} /></span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
