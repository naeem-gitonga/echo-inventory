'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, UserOrg, InventoryItem } from '@/lib/api';
import Spinner from '@/components/Spinner/Spinner';
import styles from './Dashboard.module.scss';

export default function Dashboard(): React.JSX.Element {
  const {
    page, header, headerLeft, orgName, role,
    main, statsRow, statCard, statValue, statLabel,
    actionsRow, actionBtn, section, sectionTitle, teamBtn,
    itemList, itemRow, itemName, itemQty, center, error,
  } = styles;
  const [org, setOrg] = useState<UserOrg | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const orgs = await api.orgs.listMine();
        if (orgs.length === 0) {
          setErrorMsg('No organization found. Please contact support.');
          return;
        }
        const myOrg = orgs[0];
        setOrg(myOrg);
        setItems(await api.inventory.list(myOrg.orgId));
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <Spinner />;
  if (errorMsg) return <div className={center}><p className={error}>{errorMsg}</p></div>;

  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const recentItems = [...items]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  return (
    <div className={page}>
      <header className={header}>
        <div className={headerLeft}>
          <h1 className={orgName}>{org?.orgName}</h1>
          <p className={role}>{org?.role === 'owner' ? 'Owner' : 'Member'}</p>
        </div>
      </header>

      <main className={main}>
        <div className={statsRow}>
          <div className={statCard}>
            <p className={statValue}>{items.length}</p>
            <p className={statLabel}>Item types</p>
          </div>
          <div className={statCard}>
            <p className={statValue}>{totalUnits}</p>
            <p className={statLabel}>Total units</p>
          </div>
        </div>

        <div className={actionsRow}>
          <Link href="/inventory" className={actionBtn}>View inventory</Link>
          <Link href="/inventory/add" className={actionBtn}>Add item</Link>
          <Link href="/inventory/capture" className={actionBtn}>AI capture</Link>
        </div>

        {org?.role === 'owner' && (
          <section className={section}>
            <h2 className={sectionTitle}>Team</h2>
            <Link href="/members" className={teamBtn}>Manage team members →</Link>
          </section>
        )}

        {recentItems.length > 0 && (
          <section className={section}>
            <h2 className={sectionTitle}>Recently updated</h2>
            <ul className={itemList}>
              {recentItems.map(item => (
                <li key={item.itemId} className={itemRow}>
                  <span className={itemName}>{item.name}</span>
                  <span className={itemQty}>{item.quantity} {item.unit}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
