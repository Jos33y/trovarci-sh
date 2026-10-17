import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import styles from '~/styles/modules/routes/legal.module.css';

export const meta = () => getSeo({
  title: 'Acceptable Use Policy',
  description: 'What you may and may not do with Trovarcis Reach, Trovarcis Mail and Trovarcis domains, and how we enforce it.',
  path: '/acceptable-use',
});

const SECTIONS = [
  { id: 'scope', label: 'Scope' },
  { id: 'everyone', label: 'Rules for every service' },
  { id: 'mail', label: 'Trovarcis Mail' },
  { id: 'sending-limits', label: 'Sending limits' },
  { id: 'reach', label: 'Trovarcis Reach' },
  { id: 'domains', label: 'Domains' },
  { id: 'tools', label: 'Web tools' },
  { id: 'enforcement', label: 'Enforcement' },
  { id: 'reporting', label: 'Reporting abuse' },
];

export default function AcceptableUse() {
  const headerRef = useReveal();

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.inner}`}>
          <header ref={headerRef} className={`${styles.header} reveal`}>
            <h1 className={styles.title}>Acceptable Use Policy</h1>
            <p className={styles.updated}>Last updated: October 17, 2026</p>
          </header>

          <hr className={styles.divider} />

          <nav className={styles.toc}>
            <p className={styles.tocLabel}>On this page</p>
            <ul className={styles.tocList}>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={styles.tocLink}>{s.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.content}>
            <p>
              Email only works when people can trust it. This policy exists to
              protect the people who receive mail sent through our services,
              the reputation of every customer who shares our infrastructure,
              and the services themselves. It forms part of our{' '}
              <a href="/terms">Terms of Service</a>.
            </p>

            <h2 id="scope">Scope</h2>
            <p>
              This policy applies to every product operated by Trovarcis,
              operated by Remvolabs: Trovarcis Reach (desktop app and web
              tools), Trovarcis Mail (business email hosting) and domain
              registration. It applies to you and to anyone you give access to
              your account, mailboxes or domains.
            </p>

            <h2 id="everyone">Rules for every service</h2>
            <p>You must not use any Trovarcis service to:</p>
            <ul>
              <li><strong>Send spam.</strong> This includes unsolicited bulk email and messages to purchased, rented, scraped or harvested lists.</li>
              <li><strong>Phish or defraud.</strong> No credential harvesting, fake invoices, advance-fee fraud or any attempt to deceive recipients for gain.</li>
              <li><strong>Impersonate others.</strong> Do not pose as another person, company, bank, government body or brand, in the sender name, the address, the domain or the content.</li>
              <li><strong>Distribute malware.</strong> No malicious attachments, links to malware or exploit code.</li>
              <li><strong>Send illegal content.</strong> Including content that exploits children, incites violence or hatred, or infringes intellectual property.</li>
              <li><strong>Harass or threaten.</strong> No abusive, threatening or defamatory messages.</li>
              <li><strong>Hide who you are.</strong> No forged headers, false sender information or misleading subject lines.</li>
              <li><strong>Attack systems.</strong> No probing, scanning, flooding or attempting to access accounts, servers or data that are not yours.</li>
              <li><strong>Get around our controls.</strong> Do not bypass sending limits, rate limits, verification steps or suspensions, including by opening extra accounts.</li>
            </ul>
            <p>
              You must also follow the anti-spam and data protection laws that
              apply to you and your recipients, including CAN-SPAM (US), GDPR
              (EU), PECR (UK), CASL (Canada) and the Nigeria Data Protection
              Act.
            </p>

            <h2 id="mail">Trovarcis Mail</h2>
            <p>
              Trovarcis Mail is for <strong>person-to-person business email</strong>:
              the everyday mail between you, your staff, your customers and your
              suppliers. It is not a bulk or marketing sending service.
            </p>
            <ul>
              <li><strong>No bulk or marketing campaigns</strong> from Trovarcis Mail mailboxes, even to opted-in lists. Use a dedicated email marketing provider for newsletters and campaigns.</li>
              <li><strong>No connecting mailboxes to bulk-sending software</strong>, including Trovarcis Reach, to send campaigns through our servers.</li>
              <li><strong>No reselling SMTP access.</strong> You may not sell or give away the sending credentials of your mailboxes as a sending service.</li>
              <li><strong>Only send from domains you control</strong> and have verified with us.</li>
              <li><strong>Keep your mailboxes secure.</strong> Use strong passwords and two-factor login where available. A compromised mailbox that sends spam is treated as abuse until it is secured.</li>
              <li><strong>Handle bounces.</strong> Stop writing to addresses that bounce or that ask you to stop.</li>
            </ul>

            <h2 id="sending-limits">Sending limits</h2>
            <p>
              Every Trovarcis Mail mailbox has a daily sending limit. Limits
              protect deliverability for all customers and are enforced on our
              servers for every way of sending: webmail, phone apps, desktop
              clients and SMTP.
            </p>
            <ul>
              <li>The limit counts <strong>deliveries</strong>: each message counts once for every recipient. One email to 50 people counts as 50.</li>
              <li>New mailboxes start with a limit of <strong>100 deliveries per day</strong>, with an hourly rate limit.</li>
              <li>Limits increase automatically for mailboxes with a clean sending history.</li>
              <li>If you need a higher limit for legitimate business use, contact support. Increases are reviewed case by case.</li>
              <li>Sudden spikes in volume may pause sending automatically until we review them.</li>
            </ul>

            <h2 id="reach">Trovarcis Reach</h2>
            <p>
              Trovarcis Reach sends through SMTP servers and email or SMS
              providers that you own or are authorised to use. When you use
              Reach you must:
            </p>
            <ul>
              <li>Only send to recipients who have opted in or with whom you have an existing business relationship.</li>
              <li>Include a working unsubscribe mechanism and your business address in every marketing email.</li>
              <li>Honour unsubscribe requests within 10 business days at most.</li>
              <li>Only use SMTP servers, API accounts and SMS providers that you own or are authorised to use, and follow their terms and limits.</li>
              <li>Remove bounced and unsubscribed contacts promptly.</li>
              <li>Apply the same consent rules to SMS campaigns.</li>
            </ul>

            <h2 id="domains">Domains</h2>
            <ul>
              <li>Do not register domains that imitate banks, payment providers, government bodies, well-known brands or other people (for example by swapping letters or adding words like &quot;secure&quot; or &quot;login&quot;).</li>
              <li>Do not register domains to infringe trademarks or for phishing, malware or fraud.</li>
              <li>Provide accurate registrant contact details and keep them up to date, as registry rules require.</li>
              <li>We may refuse to register a domain name that appears designed to deceive.</li>
            </ul>

            <h2 id="tools">Web tools</h2>
            <ul>
              <li>Do not use the verification tools to clean scraped or purchased lists.</li>
              <li>Do not use scripts or multiple accounts to get around free limits or rate limits.</li>
              <li>Do not use the tools to gather information for spam or attacks.</li>
            </ul>

            <h2 id="enforcement">Enforcement</h2>
            <p>
              We monitor bounce rates, spam complaints, blocklist listings,
              abuse reports and sending patterns. When we find a likely
              violation we act in proportion to the risk:
            </p>
            <ol>
              <li><strong>Sending paused.</strong> Outgoing mail from the affected mailbox or account stops. Incoming mail is still received and your stored mail is untouched.</li>
              <li><strong>Account suspended.</strong> For clear fraud, phishing, malware or repeated violations, access to the account is suspended.</li>
              <li><strong>Domain hold.</strong> A domain registered through us that is used for phishing, malware or fraud may be placed on hold through the registrar.</li>
              <li><strong>Termination.</strong> Serious or repeated violations end the account. Licenses may be revoked.</li>
            </ol>
            <p>
              We tell you what happened and why, except where doing so would
              help an attacker or where the law prevents it. You can reply to
              ask for a review. Mail is not deleted without notice unless the
              law requires it. Accounts suspended or terminated for abuse are
              not entitled to refunds. We cooperate with law enforcement when
              legally required.
            </p>

            <h2 id="reporting">Reporting abuse</h2>
            <div className={styles.contactBox}>
              <p>To report spam, phishing or other abuse involving our services, include the full message headers where you can.</p>
              <p><strong>Abuse:</strong> <a href="mailto:abuse@trovarcis.com">abuse@trovarcis.com</a></p>
              <p><strong>Operator:</strong> Trovarcis, operated by Remvolabs</p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
