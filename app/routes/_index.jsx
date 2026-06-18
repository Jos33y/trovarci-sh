import { useLoaderData } from 'react-router';
import { getAllPosts } from '~/utils/markdown.server';
import { getSeo } from '~/utils/seo';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import Hero from '~/components/landing/Hero';
import ToolsStrip from '~/components/landing/ToolsStrip';
import HowItWorks from '~/components/landing/HowItWorks';
import Features from '~/components/landing/Features';
import Comparison from '~/components/landing/Comparison';
import Pricing from '~/components/landing/Pricing';
import FAQ from '~/components/landing/FAQ';
import LatestPosts from '~/components/landing/LatestPosts';
import CTA from '~/components/landing/CTA';
import styles from '~/styles/modules/routes/home.module.css';

export const meta = () => getSeo({
  title: null,
  description: "Bulk email and SMS software. One-time purchase, offline-first, cross-platform. Multi-SMTP failover, AI deliverability scoring, and 6 free tools. No monthly fees.",
  path: "/",
});

export function loader() {
  const posts = getAllPosts();
  return { posts };
}

export default function Home() {
  const { posts } = useLoaderData();

  return (
    <>
      <Header />
      <main>
        {/* bg — with radial gold depth */}
        <Hero />

        {/* surface — elevated strip */}
        <div className={styles.surfaceSection}>
          <ToolsStrip />
        </div>

        {/* bg */}
        <HowItWorks />

        {/* surface */}
        <div className={styles.surfaceSection}>
          <Features />
        </div>

        {/* bg */}
        <Comparison />

        {/* surface */}
        <div className={styles.surfaceSection}>
          <Pricing />
        </div>

        {/* bg */}
        <FAQ />

        {/* surface */}
        <div className={styles.surfaceSection}>
          <LatestPosts posts={posts} />
        </div>

        {/* bg — with radial gold depth (mirrors hero) */}
        <CTA />
      </main>
      <Footer />
    </>
  );
}