import useReveal from '~/utils/useReveal';
import {
  DownloadIcon,
  TerminalIcon,
  UsersIcon,
  SendIcon,
} from '~/components/icons';
import styles from '~/styles/modules/landing/HowItWorks.module.css';

const STEPS = [
  {
    number: "01",
    icon: DownloadIcon,
    title: "Download the app",
    desc: "Free for Windows, macOS, Linux, iOS, and Android.",
  },
  {
    number: "02",
    icon: TerminalIcon,
    title: "Add your SMTPs",
    desc: "Connect any SMTP server or API provider. Add as many as you need.",
  },
  {
    number: "03",
    icon: UsersIcon,
    title: "Import contacts",
    desc: "Drag and drop a CSV. Duplicates and invalid emails removed automatically.",
  },
  {
    number: "04",
    icon: SendIcon,
    title: "Hit send",
    desc: "Failover, round-robin, or weighted. Reach handles the rest.",
  },
];

export default function HowItWorks() {
  const headingRef = useReveal();
  const stepsRef = useReveal(0.1);

  return (
    <section className={styles.section}>
      <div className={`container ${styles.inner}`}>
        <h2 ref={headingRef} className={`${styles.heading} reveal`}>How it works</h2>

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
