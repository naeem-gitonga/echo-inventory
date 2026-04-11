'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import styles from './LoginForm.module.scss';

export default function LoginForm(): React.JSX.Element {
  const { container, card, title, subtitle, form, label, input, button, error, footer } = styles;

  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, completeNewPassword } = useAuth();
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [session, setSession]       = useState('');
  const [step, setStep]             = useState<'login' | 'set-password'>('login');
  const [errorMsg, setErrorMsg]     = useState('');
  const [loading, setLoading]       = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const result = await signIn(email, password);
      if (result?.challenge === 'NEW_PASSWORD_REQUIRED') {
        setSession(result.session);
        setStep('set-password');
        return;
      }
      router.push(searchParams.get('next') ?? '/dashboard');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      await completeNewPassword(email, newPassword, session);
      router.push(searchParams.get('next') ?? '/dashboard');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'set-password') {
    return (
      <main className={container}>
        <div className={card}>
          <h1 className={title}>Echo Inventory</h1>
          <p className={subtitle}>Choose a new password to activate your account</p>
          <form onSubmit={handleSetPassword} className={form}>
            <label className={label}>
              New password
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                required autoComplete="new-password" className={input} />
            </label>
            {errorMsg && <p className={error}>{errorMsg}</p>}
            <button type="submit" disabled={loading} className={button}>
              {loading ? 'Saving…' : 'Set password & sign in'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className={container}>
      <div className={card}>
        <h1 className={title}>Echo Inventory</h1>
        <p className={subtitle}>Sign in to your account</p>
        <form onSubmit={handleLogin} className={form}>
          <label className={label}>
            Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email" className={input} />
          </label>
          <label className={label}>
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password" className={input} />
          </label>
          {errorMsg && <p className={error}>{errorMsg}</p>}
          <button type="submit" disabled={loading} className={button}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className={footer}>
          Don&apos;t have an account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
