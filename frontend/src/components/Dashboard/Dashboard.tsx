'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, UserOrg, InventoryItem } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import styles from './Dashboard.module.scss';

export default function Dashboard(): React.JSX.Element {
  const {
    page, header, headerLeft, orgName, role, signOutBtn,
    main, statsRow, statCard, statValue, statLabel,
    actionsRow, actionBtn, section, sectionTitle,
    itemList, itemRow, itemName, itemQty, center, error,
  } = styles;

  const router = useRouter();
  const { signOut } = useAuth();
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

  async function handleSignOut() {
    await signOut();
    router.push('/');
  }

  if (loading) return <div className={center}>Loading…</div>;
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
        <button onClick={handleSignOut} className={signOutBtn}>Sign out</button>
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
          {org?.role === 'owner' && (
            <Link href="/members" className={actionBtn}>Manage members</Link>
          )}
        </div>

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
