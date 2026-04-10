'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, UserOrg } from '@/lib/api';
import styles from './AddItemForm.module.scss';

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Grains', 'Canned', 'Frozen', 'Beverages', 'Other'];
const UNITS = ['units', 'lbs', 'oz', 'kg', 'g', 'cans', 'boxes', 'bags', 'bottles'];

export default function AddItemForm(): React.JSX.Element {
  const { page, header, back, title, main, form, label, input, row, error, submitBtn } = styles;

  const router = useRouter();
  const [org, setOrg] = useState<UserOrg | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState(UNITS[0]);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.orgs.listMine().then(orgs => {
      if (orgs.length > 0) setOrg(orgs[0]);
    }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setErrorMsg('');
    setLoading(true);
    try {
      await api.inventory.create(org.orgId, {
        name: name.trim(),
        category,
        quantity: parseInt(quantity, 10),
        unit,
        ...(brand.trim() ? { brand: brand.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      router.push('/inventory');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create item');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={page}>
      <header className={header}>
        <Link href="/inventory" className={back}>← Inventory</Link>
        <h1 className={title}>Add item</h1>
      </header>

      <main className={main}>
        <form onSubmit={handleSubmit} className={form}>
          <label className={label}>
            Name
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g. Peanut Butter"
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

          {errorMsg && <p className={error}>{errorMsg}</p>}

          <button type="submit" disabled={loading || !org} className={submitBtn}>
            {loading ? 'Saving…' : 'Add item'}
          </button>
        </form>
      </main>
    </div>
  );
}
