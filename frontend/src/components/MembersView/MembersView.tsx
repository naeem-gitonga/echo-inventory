'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Member, UserOrg } from '@/lib/api';
import styles from './MembersView.module.scss';

export default function MembersView(): React.JSX.Element {
  const {
    page, header, back, title, main, error,
    section, sectionTitle, addForm, input, addBtn, hint,
    list, memberRow, memberInfo, memberEmail, memberRole, removeBtn, empty, center,
  } = styles;

  const [org, setOrg] = useState<UserOrg | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const orgs = await api.orgs.listMine();
        if (orgs.length === 0) throw new Error('No organization found');
        const myOrg = orgs[0];
        setOrg(myOrg);
        setMembers(await api.members.list(myOrg.orgId));
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load members');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setAddError('');
    setAdding(true);
    try {
      const newMember = await api.members.add(org.orgId, email.trim());
      setMembers(prev => [...prev, newMember]);
      setEmail('');
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!org) return;
    if (!confirm('Remove this member?')) return;
    try {
      await api.members.remove(org.orgId, userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove member');
    }
  }

  if (loading) return <div className={center}>Loading…</div>;

  const isOwner = org?.role === 'owner';

  return (
    <div className={page}>
      <header className={header}>
        <Link href="/dashboard" className={back}>← Dashboard</Link>
        <h1 className={title}>Members</h1>
      </header>

      <main className={main}>
        {errorMsg && <p className={error}>{errorMsg}</p>}

        {isOwner && (
          <section className={section}>
            <h2 className={sectionTitle}>Invite member</h2>
            <form onSubmit={handleAddMember} className={addForm}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="member@example.com"
                className={input}
              />
              <button type="submit" disabled={adding} className={addBtn}>
                {adding ? 'Inviting…' : 'Invite'}
              </button>
            </form>
            {addError && <p className={error}>{addError}</p>}
            <p className={hint}>The invitee will receive an email with a temporary password.</p>
          </section>
        )}

        <section className={section}>
          <h2 className={sectionTitle}>Team ({members.length})</h2>
          {members.length === 0 ? (
            <p className={empty}>No members yet.</p>
          ) : (
            <ul className={list}>
              {members.map(m => (
                <li key={m.userId} className={memberRow}>
                  <div className={memberInfo}>
                    <span className={memberEmail}>{m.email}</span>
                    <span className={memberRole}>{m.role}</span>
                  </div>
                  {isOwner && m.role !== 'owner' && (
                    <button onClick={() => handleRemove(m.userId)} className={removeBtn}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
