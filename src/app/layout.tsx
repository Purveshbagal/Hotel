import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Hotel Management System', template: '%s · Hotel Management' },
  description: 'Complete hotel management: reservations, front desk, billing, housekeeping, restaurant and reports.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster richColors closeButton position="bottom-right" />
      </body>
    </html>
  );
}
