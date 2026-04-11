'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp, confirmSignUp } from '@/lib/auth-api';
import { useAuth } from '@/contexts/AuthContext';
import styles from './SignupForm.module.scss';

type Step = 'register' | 'confirm';

export default function SignupForm(): React.JSX.Element {
  const { container, card, title, subtitle, form, label, inputWrap, input, toggleBtn, button, error, footer, linkBtn } = styles;

  const router = useRouter();
  const { signIn } = useAuth();
  const [step, setStep]           = useState<Step>('register');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [orgName, setOrgName]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode]         = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      await signUp(email, password, orgName);
      setStep('confirm');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      await confirmSignUp(email, code, password, orgName);
      await signIn(email, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={container}>
      <div className={card}>
        <h1 className={title}>Echo Inventory</h1>

        {step === 'register' ? (
          <>
            <p className={subtitle}>Create your account and organization</p>
            <form onSubmit={handleRegister} className={form}>
              <label className={label}>
                Email
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoComplete="email" className={input} />
              </label>
              <label className={label}>
                Password
                <div className={inputWrap}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required minLength={8} autoComplete="new-password"
                    className={input}
                  />
                  <button type="button" className={toggleBtn} onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </label>
              <label className={label}>
                Organization name
                <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
                  required placeholder="e.g. Downtown Community Pantry" className={input} />
              </label>
              {errorMsg && <p className={error}>{errorMsg}</p>}
              <button type="submit" disabled={loading} className={button}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
            <p className={footer}>
              Already have an account? <Link href="/login">Log in</Link>
            </p>
          </>
        ) : (
          <>
            <p className={subtitle}>
              Check your email at <strong>{email}</strong> for a verification code.
            </p>
            <form onSubmit={handleConfirm} className={form}>
              <label className={label}>
                Verification code
                <input type="text" value={code} onChange={e => setCode(e.target.value)}
                  required inputMode="numeric" autoComplete="one-time-code" className={input} />
              </label>
              {errorMsg && <p className={error}>{errorMsg}</p>}
              <button type="submit" disabled={loading} className={button}>
                {loading ? 'Verifying…' : 'Verify email'}
              </button>
            </form>
            <p className={footer}>
              Wrong email?{' '}
              <button onClick={() => setStep('register')} className={linkBtn}>Go back</button>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
