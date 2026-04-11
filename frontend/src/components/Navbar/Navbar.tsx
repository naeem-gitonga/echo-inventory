'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import styles from './Navbar.module.scss';

export default function Navbar() {
  const { isAuthenticated, isLoading, signOut } = useAuth();
  const pathname = usePathname();

  const showGuestActions = !isLoading && !isAuthenticated && pathname === '/';

  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.brand}>
        <Image src="/echo-inventory.webp" alt="Echo Inventory" width={28} height={28} />
        Echo Inventory
      </Link>
      {!isLoading && (
        <div className={styles.actions}>
          {isAuthenticated ? (
            <button className={styles.signOutBtn} onClick={signOut}>Sign out</button>
          ) : showGuestActions && (
            <>
              <Link href="/login" className={styles.navLink}>Sign in</Link>
              <Link href="/signup" className={styles.navBtn}>Get started</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
