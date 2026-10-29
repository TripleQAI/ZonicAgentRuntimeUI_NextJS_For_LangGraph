import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { withBasePath } from '@/lib/config/runtime';
import { t } from '@/lib/i18n/t';
import '@/styles/globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: t('app.name'),
  icons: { icon: withBasePath('/favicon.png') },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the request renders every page per request, so each gets its own CSP nonce (src/middleware.ts).
  await headers();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- Inter for the whole app (TripleQ AI brand) */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
