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
  { label: "Email Scorer", desc: "AI spam analysis", href: "/score", icon: GaugeIcon },
  { label: "Domain Checker", desc: "Blacklist & DNS", href: "/domain", icon: GlobeIcon },
  { label: "Email Verifier", desc: "Validate addresses", href: "/verify", icon: VerifyIcon },
  { label: "SMTP Tester", desc: "Connection check", href: "/smtp-test", icon: TerminalIcon },
  { label: "DNS Generator", desc: "SPF, DKIM, DMARC", href: "/records", icon: DnsIcon },
  { label: "Number Verifier", desc: "Phone validation", href: "/verify-number", icon: PhoneIcon },
];

export default function ToolsStrip() {
  const revealRef = useReveal();

  return (
    <section className={styles.strip}>
      <div ref={revealRef} className={`container ${styles.inner} reveal`}>
        <p className={styles.label}>Free tools. No account needed.</p>
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