import { Link } from 'react-router';
import {
  GlobeIcon,
  DnsIcon,
  VerifyIcon,
  PhoneIcon,
  GaugeIcon,
  TerminalIcon,
  SendIcon,
  ArrowRightIcon,
} from '~/components/icons';
import styles from '~/styles/modules/landing/Checks.module.css';

// The six tools, grouped by what they check and in the order a campaign needs them.
// Prices are per address, draft or number and mirror CREDIT_COSTS; change both together.
const STAGES = [
  {
    title: 'Your domain',
    note: 'Set it up once. Check again after any DNS change.',
    tools: [
      { name: 'Domain Checker', job: 'See if your domain is set up to send and whether it is on a blocklist.', price: 'Free', href: '/domain', icon: GlobeIcon },
      { name: 'DNS Generator', job: 'Get the SPF, DKIM and DMARC records to add at your DNS host.', price: 'Free', href: '/records', icon: DnsIcon },
    ],
  },
  {
    title: 'Your list',
    note: 'Bounces hurt your sending reputation, so remove them first.',
    tools: [
      { name: 'Email Verifier', job: 'Find the addresses that would bounce, one at a time or a whole list.', price: '1 credit', href: '/verify', icon: VerifyIcon },
      { name: 'Number Verifier', job: 'Check a phone number is real and see its carrier and line type.', price: '2 credits', href: '/verify-number', icon: PhoneIcon },
    ],
  },
  {
    title: 'Your message and server',
    note: 'Find problems with a test, not with a campaign.',
    tools: [
      { name: 'Email Scorer', job: 'Score a draft for the things that push mail into spam.', price: '1 credit', href: '/score', icon: GaugeIcon },
      { name: 'SMTP Tester', job: 'Test that your SMTP login, port and encryption work.', price: 'Free', href: '/smtp-test', icon: TerminalIcon },
    ],
  },
];

export default function Checks() {
  return (
    <section id="tools" className={styles.section} aria-labelledby="tools-title">
      <div className="container">
        <header className={styles.header}>
          <p className={styles.kicker}>Before you send</p>
          <h2 id="tools-title" className={styles.heading}>Check everything before you send.</h2>
          <p className={styles.lead}>
            Six checks, in the order they matter. Three are free and need no
            account. The others use Credits, and new accounts get 10 free.
          </p>
        </header>

        <ol className={styles.stages}>
          {STAGES.map((stage, i) => (
            <li key={stage.title} className={styles.stage}>
              <div className={styles.stageHead}>
                <span className={styles.node} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <h3 className={styles.stageTitle}>{stage.title}</h3>
                <p className={styles.stageNote}>{stage.note}</p>
              </div>

              <ul className={styles.tools}>
                {stage.tools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <li key={tool.href}>
                      <Link to={tool.href} className={styles.tool}>
                        <span className={styles.toolIcon} aria-hidden="true"><Icon size={18} /></span>
                        <span className={styles.toolBody}>
                          <span className={styles.toolTop}>
                            <span className={styles.toolName}>{tool.name}</span>
                            <span className={`${styles.price} ${tool.price === 'Free' ? styles.priceFree : ''}`}>{tool.price}</span>
                          </span>
                          <span className={styles.toolJob}>{tool.job}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}

          <li className={`${styles.stage} ${styles.stageSend}`}>
            <div className={styles.stageHead}>
              <span className={`${styles.node} ${styles.nodeSend}`} aria-hidden="true"><SendIcon size={14} /></span>
              <h3 className={styles.stageTitle}>Send</h3>
              <p className={styles.stageNote}>
                Sender sends it from your computer, through your own SMTP
                accounts.
              </p>
            </div>
            <Link to="/sender" className={styles.sendLink}>
              Get Sender
              <span aria-hidden="true"><ArrowRightIcon size={16} /></span>
            </Link>
          </li>
        </ol>
      </div>
    </section>
  );
}
