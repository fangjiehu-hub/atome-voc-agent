'use client';

import { usePathname } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/overview': 'Executive Overview',
  '/incidents': 'Incidents',
  '/alerts': 'Alerts',
  '/analytics': 'Analytics',
  '/feedback': 'Feedback Queue',
  '/taxonomy': 'Taxonomy',
  '/routing': 'Routing Matrix',
  '/settings': 'Settings',
};

export default function Topbar() {
  const pathname = usePathname();
  const title = pageTitles[pathname] || 'Dashboard';

  return (
    <div className="bg-white border-b border-gray-200 px-7 py-3.5 flex items-center gap-3.5 sticky top-0 z-10">
      <div className="text-[13px] text-gray-500">
        Monitor &nbsp;/&nbsp; <strong className="text-gray-800 font-semibold">{title}</strong>
      </div>
      <div className="flex-1" />

      {/* Filters */}
      <button className="flex items-center gap-1.5 bg-brand-50 border border-brand-300 px-2.5 py-1.5 rounded-lg text-[13px] text-brand-500 font-semibold">
        PH Philippines
      </button>
      <button className="flex items-center gap-1.5 bg-brand-50 border border-brand-300 px-2.5 py-1.5 rounded-lg text-[13px] text-brand-500 font-semibold">
        X + Reddit
      </button>
      <button className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 px-2.5 py-1.5 rounded-lg text-[13px] text-gray-700 hover:bg-gray-200">
        All categories
      </button>

      {/* Avatar */}
      <div className="w-[34px] h-[34px] rounded-full bg-[#141c30] flex items-center justify-center text-[#f0ff5f] font-bold text-xs">
        DS
      </div>
    </div>
  );
}
