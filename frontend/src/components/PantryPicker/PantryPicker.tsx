'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Org } from '@/lib/api';
import styles from './PantryPicker.module.scss';

export default function PantryPicker(): React.JSX.Element {
  const { page, header, title, subtitle, main, error, empty, list, orgCard, orgName, arrow, loginHint, center } = styles;

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.orgs.listPublic()
      .then(setOrgs)
      .catch(err => setErrorMsg(err instanceof Error ? err.message : 'Failed to load pantries'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={center}>Loading…</div>;

  return (
    <div className={page}>
      <header className={header}>
        <h1 className={title}>Echo Inventory</h1>
        <p className={subtitle}>Browse a pantry to see what&apos;s available</p>
      </header>

      <main className={main}>
        {errorMsg && <p className={error}>{errorMsg}</p>}

        {orgs.length === 0 && !errorMsg && (
          <p className={empty}>No pantries registered yet.</p>
        )}

        <ul className={list}>
          {orgs.map(org => (
            <li key={org.orgId}>
              <Link href={`/pantry/${org.orgId}`} className={orgCard}>
                <span className={orgName}>{org.orgName}</span>
                <span className={arrow}>→</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className={loginHint}>
          Are you a pantry manager? <Link href="/login">Sign in</Link>
        </p>
      </main>
    </div>
  );
}
