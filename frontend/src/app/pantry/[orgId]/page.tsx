'use client';

import { useParams } from 'next/navigation';
import PublicPantryView from '@/components/PublicPantryView/PublicPantryView';

export default function PublicPantryPage() {
  const { orgId } = useParams<{ orgId: string }>();
  return <PublicPantryView orgId={orgId} />;
}
