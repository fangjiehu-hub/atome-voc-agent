import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export const metadata: Metadata = {
  title: 'Atome VoC · Early Warning',
  description: 'Voice of Customer Early Warning Agent for Atome PH',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-800 text-sm">
        <div className="grid grid-cols-[240px_1fr] min-h-screen">
          <Sidebar />
          <div>
            <Topbar />
            <main className="p-6 pb-12">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
