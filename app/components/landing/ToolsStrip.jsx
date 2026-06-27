import { Link } from 'react-router';
import useReveal from '~/utils/useReveal';
import {
  GaugeIcon,
  GlobeIcon,
  VerifyIcon,
  TerminalIcon,
  DnsIcon,
  PhoneIcon,
} from '~/components/icons';
import styles from '~/styles/modules/landing/ToolsStrip.module.css';

const TOOLS = [
  { label: "Email Scorer",    desc: "AI spam-trigger scoring",       href: "/score",         icon: GaugeIcon },
  { label: "Domain Checker",  desc: "DNS + blacklist audit",         href: "/domain",        icon: GlobeIcon },
  { label: "Email Verifier",  desc: "Single or bulk address checks", href: "/verify",        icon: VerifyIcon },
  { label: "SMTP Tester",     desc: "Auth, TLS, MX diagnostics",     href: "/smtp-test",     icon: TerminalIcon },
  { label: "DNS Generator",   desc: "SPF, DKIM, DMARC records",      href: "/records",       icon: DnsIcon },
  { label: "Number Verifier", desc: "Real carrier + line type",      href: "/verify-number", icon: PhoneIcon },
];

export default function ToolsStrip() {
  const revealRef = useReveal();

  return (
    <section className={styles.strip}>
      <div className={styles.stripNoise} aria-hidden="true" />

      <div ref={revealRef} className={`container ${styles.inner} reveal`}>
        <div className={styles.labelRow}>
          <span className="signal-dot signal-dot--sm" aria-hidden="true" />
          <p className={styles.label}>Six checks. One workflow.</p>
        </div>

        <div className={styles.tools}>
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.href} to={tool.href} className={styles.tool}>
                <span className={styles.toolIcon}>
                  <Icon size={22} />
                </span>
                <span className={styles.toolLabel}>{tool.label}</span>
                <span className={styles.toolDesc}>{tool.desc}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
