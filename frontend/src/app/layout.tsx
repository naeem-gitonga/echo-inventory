import type { Metadata } from 'next';
import './globals.css';
import { AmplifyProvider } from './amplify-provider';

export const metadata: Metadata = {
  title: 'Echo Inventory',
  description: 'Community inventory tracking',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AmplifyProvider />
        {children}
      </body>
    </html>
  );
}
