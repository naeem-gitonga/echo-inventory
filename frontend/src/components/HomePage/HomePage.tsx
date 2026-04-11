import Link from 'next/link';
import styles from './HomePage.module.scss';

export default function HomePage(): React.JSX.Element {
  const {
    page,
    hero, heroEyebrow, heroTitle, heroSubtitle, heroActions, heroPrimary, heroSecondary,
    features, featuresTitle, featureGrid, featureCard, featureIcon, featureName, featureDesc,
    publicSection, publicTitle, publicSubtitle, publicBtn,
    footer, footerText,
  } = styles;

  return (
    <div className={page}>
      <section className={hero}>
        <p className={heroEyebrow}>Community inventory, simplified</p>
        <h1 className={heroTitle}>Know what&apos;s in your pantry — always</h1>
        <p className={heroSubtitle}>
          Echo Inventory helps community pantries track their stock in real time.
          Volunteers snap a photo of items being taken and AI handles the rest — no manual logging required.
        </p>
        <div className={heroActions}>
          <Link href="/signup" className={heroPrimary}>Create your pantry</Link>
          <Link href="/pantry" className={heroSecondary}>Browse pantries</Link>
        </div>
      </section>

      <section className={features}>
        <h2 className={featuresTitle}>Everything your pantry needs</h2>
        <div className={featureGrid}>
          <div className={featureCard}>
            <span className={featureIcon}>📸</span>
            <h3 className={featureName}>AI photo capture</h3>
            <p className={featureDesc}>
              Anyone can take a photo of what they&apos;re taking. Nova Lite identifies the items and updates stock automatically.
            </p>
          </div>
          <div className={featureCard}>
            <span className={featureIcon}>📦</span>
            <h3 className={featureName}>Live inventory</h3>
            <p className={featureDesc}>
              See your current stock at a glance. Add items manually or let the AI discover them from photos.
            </p>
          </div>
          <div className={featureCard}>
            <span className={featureIcon}>👥</span>
            <h3 className={featureName}>Team management</h3>
            <p className={featureDesc}>
              Invite volunteers by email. Owners manage access — members help keep inventory up to date.
            </p>
          </div>
          <div className={featureCard}>
            <span className={featureIcon}>🔓</span>
            <h3 className={featureName}>No login for visitors</h3>
            <p className={featureDesc}>
              Community members pick their pantry and snap a photo. No account, no friction.
            </p>
          </div>
        </div>
      </section>

      <section className={publicSection}>
        <h2 className={publicTitle}>Visiting a pantry today?</h2>
        <p className={publicSubtitle}>Find your pantry and log what you&apos;re taking in seconds.</p>
        <Link href="/pantry" className={publicBtn}>Find a pantry</Link>
      </section>

      <footer className={footer}>
        <p className={footerText}>Echo Inventory — built for communities</p>
        <p className={footerText}>by Group 8 with <Link href="https://naeemgitonga.com/fromWebsite=echo-inventory">GTNG, Inc.</Link></p>
      </footer>
    </div>
  );
}
