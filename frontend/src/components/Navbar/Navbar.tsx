'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import styles from './Navbar.module.scss';

export default function Navbar() {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();

  const showActions = !isLoading && !isAuthenticated && pathname === '/';

  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.brand}>
        <Image src="/echo-inventory.webp" alt="Echo Inventory" width={28} height={28} />
        Echo Inventory
      </Link>
      {showActions && (
        <div className={styles.actions}>
          <Link href="/login" className={styles.navLink}>Sign in</Link>
          <Link href="/signup" className={styles.navBtn}>Get started</Link>
        </div>
      )}
    </nav>
  );
}
