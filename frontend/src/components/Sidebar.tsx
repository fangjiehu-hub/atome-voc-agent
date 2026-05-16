'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    section: 'Monitor',
    items: [
      { href: '/overview', label: 'Overview', badge: null },
      { href: '/incidents', label: 'Incidents', badge: null },
      { href: '/alerts', label: 'Alerts', badge: null },
    ],
  },
  {
    section: 'Manage',
    items: [
      { href: '/feedback', label: 'Feedback queue', badge: null },
      { href: '/taxonomy', label: 'Taxonomy', badge: null },
      { href: '/routing', label: 'Routing matrix', badge: null },
      { href: '/methodology', label: 'Methodology', badge: null },
      { href: '/settings', label: 'Settings', badge: null },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-[#141c30] px-3.5 py-5 sticky top-0 h-screen overflow-y-auto">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 pb-4 border-b border-white/10 mb-3.5">
        <div className="w-8 h-8 rounded-lg bg-[#f0ff5f] flex items-center justify-center text-[#141c30] font-extrabold text-[15px]">
          A
        </div>
        <div>
          <div className="font-bold text-[15px] text-white leading-tight">Atome VoC</div>
          <div className="text-[11px] text-white/50">PH &middot; Early Warning</div>
        </div>
      </div>

      {navItems.map((section) => (
        <div key={section.section}>
          <div className="text-[11px] uppercase tracking-wider text-white/35 px-2 pt-3.5 pb-1.5">
            {section.section}
          </div>
          {section.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] mb-0.5 transition-colors ${
                  active
                    ? 'bg-[#f0ff5f]/15 text-[#f0ff5f] font-semibold'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
