'use client';

import { useEffect } from 'react';
import { configureAmplify } from '@/lib/auth';

// Configures Amplify once on the client side.
// Rendered in the root layout so it runs before any auth calls.
export function AmplifyProvider() {
  useEffect(() => {
    configureAmplify();
  }, []);

  return null;
}
