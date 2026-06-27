import useReveal from '~/utils/useReveal';
import {
  UsersIcon,
  LayersIcon,
  BoltIcon,
  CardIcon,
} from '~/components/icons';
import styles from '~/styles/modules/landing/HowItWorks.module.css';

const STEPS = [
  {
    number: "01",
    icon: UsersIcon,
    title: "Sign up",
    desc: "10 free credits land in your account. No card. No trial timer.",
  },
  {
    number: "02",
    icon: LayersIcon,
    title: "Pick a tool",
    desc: "Six checks for email, list, domain, SMTP, and DNS. Three are free.",
  },
  {
    number: "03",
    icon: BoltIcon,
    title: "Run the check",
    desc: "Results in seconds. Single inputs or CSV. Download the output.",
  },
  {
    number: "04",
    icon: CardIcon,
    title: "Top up when ready",
    desc: "$0.01 per credit. Pay once, use when you need it. No subscription.",
  },
];

export default function HowItWorks() {
  const headingRef = useReveal();
  const stepsRef = useReveal(0.1);

  return (
    <section className={styles.section}>
      <div className={styles.bgStripe} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div ref={headingRef} className={`${styles.header} reveal`}>
          <div className={styles.kickerRow}>
            <span className="signal-dot signal-dot--sm" aria-hidden="true" />
            <span className={styles.kicker}>Four steps</span>
          </div>
          <h2 className={styles.heading}>How it works</h2>
        </div>

        <div ref={stepsRef} className={`${styles.steps} stagger`}>
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className={`${styles.step} reveal`}>
                <span className={styles.number}>{step.number}</span>
                <div className={styles.iconWrap}>
                  <Icon size={22} />
                </div>
                <h3 className={styles.title}>{step.title}</h3>
                <p className={styles.desc}>{step.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
