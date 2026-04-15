import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RetailCRM Orders Dashboard',
  description: 'Realtime dashboard for orders synced from RetailCRM into Supabase.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
