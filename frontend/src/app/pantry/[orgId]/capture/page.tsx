'use client';

import { useParams } from 'next/navigation';
import PublicCapture from '@/components/PublicCapture/PublicCapture';

export default function PublicCapturePage() {
  const { orgId } = useParams<{ orgId: string }>();
  return <PublicCapture orgId={orgId} />;
}
