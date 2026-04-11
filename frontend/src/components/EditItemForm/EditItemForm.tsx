'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, UserOrg, InventoryItem } from '@/lib/api';
import Spinner from '@/components/Spinner/Spinner';
import styles from './EditItemForm.module.scss';

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Grains', 'Canned', 'Frozen', 'Beverages', 'Other'];
const UNITS = ['units', 'lbs', 'oz', 'kg', 'g', 'cans', 'boxes', 'bags', 'bottles'];

export default function EditItemForm(): React.JSX.Element {
  const { page, header, back, title, main, form, label, input, row, error, submitBtn } = styles;

  const router = useRouter();
  const { itemId } = useParams<{ itemId: string }>();

  const [org, setOrg] = useState<UserOrg | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState(UNITS[0]);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const orgs = await api.orgs.listMine();
        if (orgs.length === 0) return;
        const myOrg = orgs[0];
        setOrg(myOrg);
        const items = await api.inventory.list(myOrg.orgId);
        const item = items.find((i: InventoryItem) => i.itemId === itemId);
        if (!item) { setErrorMsg('Item not found'); return; }
        setName(item.name);
        setBrand(item.brand ?? '');
        setCategory(item.category);
        setQuantity(String(item.quantity));
        setUnit(item.unit);
        setNotes(item.notes ?? '');
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load item');
      } finally {
        setFetching(false);
      }
    }
    load();
  }, [itemId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setErrorMsg('');
    setLoading(true);
    try {
      await api.inventory.update(org.orgId, itemId, {
        name: name.trim(),
        category,
        quantity: parseInt(quantity, 10),
        unit,
        brand: brand.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      router.push('/inventory');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update item');
    } finally {
      setLoading(false);
    }
  }

  if (fetching) return <Spinner />;

  return (
    <div className={page}>
      <header className={header}>
        <Link href="/inventory" className={back}>← Inventory</Link>
        <h1 className={title}>Edit item</h1>
      </header>

      <main className={main}>
        {errorMsg && <p className={error}>{errorMsg}</p>}
        <form onSubmit={handleSubmit} className={form}>
          <label className={label}>
            Name
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className={input}
            />
          </label>

          <label className={label}>
            Brand (optional)
            <input
              type="text"
              value={brand}
              onChange={e => setBrand(e.target.value)}
              placeholder="e.g. Jif"
              className={input}
            />
          </label>

          <label className={label}>
            Category
            <select value={category} onChange={e => setCategory(e.target.value)} className={input}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>

          <div className={row}>
            <label className={label}>
              Quantity
              <input
                type="number"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                required
                min={0}
                className={input}
              />
            </label>
            <label className={label}>
              Unit
              <select value={unit} onChange={e => setUnit(e.target.value)} className={input}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </label>
          </div>

          <label className={label}>
            Notes (optional)
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className={input}
            />
          </label>

          <button type="submit" disabled={loading || !org} className={submitBtn}>
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </main>
    </div>
  );
}
