'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, InventoryItem, UserOrg } from '@/lib/api';
import styles from './InventoryList.module.scss';

export default function InventoryList(): React.JSX.Element {
  const {
    page, header, headerLeft, back, title, headerActions,
    primaryBtn, secondaryBtn, main, error, empty,
    list, row, itemInfo, itemName, itemMeta, itemRight,
    qty, editBtn, deleteBtn, center,
    overlay, modal, modalTitle, modalText, modalActions, modalCancel, modalConfirm,
  } = styles;

  const [org, setOrg]           = useState<UserOrg | null>(null);
  const [items, setItems]       = useState<InventoryItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading]   = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const orgs = await api.orgs.listMine();
        if (orgs.length === 0) throw new Error('No organization found');
        setOrg(orgs[0]);
        setItems(await api.inventory.list(orgs[0].orgId));
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load inventory');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function confirmDelete() {
    if (!org || !pendingId) return;
    setPendingId(null);
    try {
      await api.inventory.delete(org.orgId, pendingId);
      setItems(prev => prev.filter(i => i.itemId !== pendingId));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  if (loading) return <div className={center}>Loading…</div>;

  return (
    <div className={page}>
      <header className={header}>
        <div className={headerLeft}>
          <Link href="/dashboard" className={back}>← Dashboard</Link>
          <h1 className={title}>Inventory</h1>
        </div>
        <div className={headerActions}>
          <Link href="/inventory/add" className={primaryBtn}>Add item</Link>
          <Link href="/inventory/capture" className={secondaryBtn}>AI capture</Link>
        </div>
      </header>

      <main className={main}>
        {errorMsg && <p className={error}>{errorMsg}</p>}

        {items.length === 0 ? (
          <p className={empty}>No items yet. <Link href="/inventory/add">Add your first item.</Link></p>
        ) : (
          <ul className={list}>
            {items.map(item => (
              <li key={item.itemId} className={row}>
                <div className={itemInfo}>
                  <span className={itemName}>{item.name}</span>
                  <span className={itemMeta}>{item.category}</span>
                </div>

                <div className={itemRight}>
                  <span className={qty}>{item.quantity} {item.unit}</span>
                  <Link href={`/inventory/${item.itemId}/edit`} className={editBtn}>Edit</Link>
                  <button onClick={() => setPendingId(item.itemId)} className={deleteBtn}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {pendingId && (
        <div className={overlay}>
          <div className={modal}>
            <h2 className={modalTitle}>Delete item?</h2>
            <p className={modalText}>
              {items.find(i => i.itemId === pendingId)?.name} will be permanently removed.
            </p>
            <div className={modalActions}>
              <button onClick={() => setPendingId(null)} className={modalCancel}>Cancel</button>
              <button onClick={confirmDelete} className={modalConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
