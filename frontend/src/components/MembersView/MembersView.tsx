'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Member, UserOrg } from '@/lib/api';
import Spinner from '@/components/Spinner/Spinner';
import styles from './MembersView.module.scss';

export default function MembersView(): React.JSX.Element {
  const {
    page, header, back, title, main, error,
    section, sectionTitle, addForm, input, addBtn, hint,
    list, memberRow, memberInfo, memberEmail, memberRole, removeBtn, empty,
  } = styles;

  const [org, setOrg] = useState<UserOrg | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastInvite, setLastInvite] = useState<{ email: string; tempPassword: string } | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

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
    setLastInvite(null);
    setAdding(true);
    try {
      const newMember = await api.members.add(org.orgId, email.trim());
      setMembers(prev => [...prev, newMember]);
      if (newMember.tempPassword) {
        setLastInvite({ email: newMember.email, tempPassword: newMember.tempPassword });
      }
      setEmail('');
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAdding(false);
    }
  }

  async function confirmRemove() {
    if (!org || !pendingRemoveId) return;
    setPendingRemoveId(null);
    try {
      await api.members.remove(org.orgId, pendingRemoveId);
      setMembers(prev => prev.filter(m => m.userId !== pendingRemoveId));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove member');
    }
  }

  if (loading) return <Spinner />;

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
            {lastInvite && (
              <div className={styles.credBox}>
                <p className={styles.credTitle}>Invite sent to {lastInvite.email}</p>
                <p className={styles.credNote}>If the email doesn't arrive, share these credentials directly:</p>
                <div className={styles.credRow}>
                  <span className={styles.credLabel}>Email</span>
                  <code className={styles.credValue}>{lastInvite.email}</code>
                </div>
                <div className={styles.credRow}>
                  <span className={styles.credLabel}>Temp password</span>
                  <code className={styles.credValue}>{lastInvite.tempPassword}</code>
                </div>
                <p className={styles.credNote}>They'll be asked to set a new password on first login.</p>
              </div>
            )}
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
                    <button onClick={() => setPendingRemoveId(m.userId)} className={removeBtn}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {pendingRemoveId && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Remove member?</h2>
            <p className={styles.modalText}>
              {members.find(m => m.userId === pendingRemoveId)?.email} will lose access and be removed from the org.
            </p>
            <div className={styles.modalActions}>
              <button onClick={() => setPendingRemoveId(null)} className={styles.modalCancel}>Cancel</button>
              <button onClick={confirmRemove} className={styles.modalConfirm}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
