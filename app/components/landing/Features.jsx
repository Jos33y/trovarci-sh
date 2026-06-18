import useReveal from '~/utils/useReveal';
import {
  LayersIcon,
  GaugeIcon,
  VerifyIcon,
  GlobeIcon,
  DevicesIcon,
  LockIcon,
} from '~/components/icons';
import styles from '~/styles/modules/landing/Features.module.css';

const FEATURES = [
  {
    icon: LayersIcon,
    title: "Multi-SMTP failover",
    desc: "Add unlimited SMTP servers or API providers. Failover, round-robin, or weighted distribution. One goes down, the next takes over.",
  },
  {
    icon: GaugeIcon,
    title: "Arcis email score",
    desc: "Score your email before you send it. Spam triggers, formatting issues, deliverability risks. All flagged with specific fixes.",
  },
  {
    icon: VerifyIcon,
    title: "Contact auto-clean",
    desc: "Import a CSV. Duplicates removed, typos corrected, disposable emails flagged, invalid addresses caught. One pass.",
  },
  {
    icon: GlobeIcon,
    title: "Domain health check",
    desc: "SPF, DKIM, DMARC, MX records, and blacklist status. Know your sending reputation before you hit send.",
  },
  {
    icon: DevicesIcon,
    title: "Every platform",
    desc: "Windows, macOS, Linux, iOS, and Android. Same app, same data. Up to 3 devices per license.",
  },
  {
    icon: LockIcon,
    title: "Offline-first. Yours.",
    desc: "Contacts, emails, SMTP credentials. All stored on your device. Nothing uploaded. Nothing tracked. Nothing leaves your machine.",
  },
];

export default function Features() {
  const headingRef = useReveal();
  const gridRef = useReveal(0.08);

  return (
    <section className={styles.section} id="features">
      <div className={`container ${styles.inner}`}>
        <h2 ref={headingRef} className={`${styles.heading} reveal`}>What's inside</h2>

        <div ref={gridRef} className={`${styles.grid} stagger`}>
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className={`${styles.card} reveal`}>
                <div className={styles.iconWrap}>
                  <Icon size={24} />
                </div>
                <h3 className={styles.title}>{feature.title}</h3>
                <p className={styles.desc}>{feature.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
