'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, InventoryItem, Org } from '@/lib/api';
import styles from './PublicPantryView.module.scss';

interface Props { orgId: string; }

export default function PublicPantryView({ orgId }: Props): React.JSX.Element {
  const {
    page, header, backLink, title, subtitle, main, error, empty,
    grid, itemCard, itemName, itemMeta, badge, captureBar, captureBtn, center,
  } = styles;

  const [org, setOrg]       = useState<Org | null>(null);
  const [items, setItems]   = useState<InventoryItem[]>([]);
  const [errorMsg, setErr]  = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.orgs.getPublic(orgId),
      api.inventory.listPublic(orgId),
    ])
      .then(([o, i]) => { setOrg(o); setItems(i); })
      .catch(err => setErr(err instanceof Error ? err.message : 'Failed to load pantry'))
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) return <div className={center}>Loading…</div>;

  return (
    <div className={page}>
      <header className={header}>
        <Link href="/pantry" className={backLink}>← All pantries</Link>
        <h1 className={title}>{org?.orgName ?? 'Pantry'}</h1>
        <p className={subtitle}>
          {items.length > 0
            ? `${items.length} item${items.length !== 1 ? 's' : ''} available`
            : 'No items listed yet'}
        </p>
      </header>

      <main className={main}>
        {errorMsg && <p className={error}>{errorMsg}</p>}

        {!errorMsg && items.length === 0 && (
          <p className={empty}>This pantry hasn&apos;t listed any items yet.</p>
        )}

        {items.length > 0 && (
          <ul className={grid}>
            {items.map(item => (
              <li key={item.itemId} className={itemCard}>
                <span className={itemName}>{item.name}</span>
                <div className={itemMeta}>
                  <span className={badge}>{item.category}</span>
                  <span>{item.quantity} {item.unit}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <div className={captureBar}>
        <Link href={`/pantry/${orgId}/capture`} className={captureBtn}>
          Log what you&apos;re taking
        </Link>
      </div>
    </div>
  );
}
