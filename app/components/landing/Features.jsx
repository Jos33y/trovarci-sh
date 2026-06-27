import useReveal from '~/utils/useReveal';
import {
  GaugeIcon,
  VerifyIcon,
  PhoneIcon,
  GlobeIcon,
  DnsIcon,
  TerminalIcon,
} from '~/components/icons';
import styles from '~/styles/modules/landing/Features.module.css';

const FEATURES = [
  {
    icon: GaugeIcon,
    title: "Arcis pre-send scoring",
    desc: "AI grades your draft for spam triggers, formatting issues, and missing CAN-SPAM elements. Every flag comes with a specific fix, not just a number.",
  },
  {
    icon: VerifyIcon,
    title: "Bulk list verification",
    desc: "Up to 50,000 emails per job. SMTP probes, MX checks, disposable filters, catch-all detection. CSV in, CSV out, no UI fiddling.",
  },
  {
    icon: PhoneIcon,
    title: "Phone validation",
    desc: "Real carrier, line type, country, and format. Validates against live telco data. Up to 10,000 numbers per job.",
  },
  {
    icon: GlobeIcon,
    title: "Domain health audit",
    desc: "SPF, DKIM, DMARC, MX, and a sweep of major blacklists. The full audit in one click.",
  },
  {
    icon: DnsIcon,
    title: "DNS record generator",
    desc: "Paste your sending domain, get SPF, DKIM, and DMARC records ready to copy into your DNS provider.",
  },
  {
    icon: TerminalIcon,
    title: "SMTP connection tester",
    desc: "Probe any SMTP server. Auth handshake, TLS posture, MX path. Diagnose before you debug.",
  },
];

export default function Features() {
  const headingRef = useReveal();
  const gridRef = useReveal(0.08);

  return (
    <section className={styles.section} id="features">
      <div className={styles.bgRadial} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div ref={headingRef} className={`${styles.header} reveal`}>
          <div className={styles.kickerRow}>
            <span className="signal-dot signal-dot--sm" aria-hidden="true" />
            <span className={styles.kicker}>The toolkit</span>
          </div>
          <h2 className={styles.heading}>What's inside</h2>
        </div>

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
