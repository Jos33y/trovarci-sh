import { useLoaderData } from 'react-router';
import { getAllPosts } from '~/utils/markdown.server';
import { getSeo } from '~/utils/seo';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import Hero from '~/components/landing/Hero';
import ToolsStrip from '~/components/landing/ToolsStrip';
import Features from '~/components/landing/Features';
import HowItWorks from '~/components/landing/HowItWorks';
import Comparison from '~/components/landing/Comparison';
import Pricing from '~/components/landing/Pricing';
import DesktopPromo from '~/components/landing/DesktopPromo';
import FAQ from '~/components/landing/FAQ';
import LatestPosts from '~/components/landing/LatestPosts';
import CTA from '~/components/landing/CTA';
import styles from '~/styles/modules/routes/home.module.css';

export const meta = () => getSeo({
  title: "The Email Deliverability Toolkit",
  description: "Six pre-flight checks for every email you send. Verify lists, score copy, audit DNS, test SMTP. Pay as you go. 10 free credits on signup, no subscription.",
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
        {/* bg */}
        <Hero />

        {/* surface */}
        <div className={styles.surfaceSection}>
          <ToolsStrip />
        </div>

        {/* bg */}
        <Features />

        {/* surface */}
        <div className={styles.surfaceSection}>
          <HowItWorks />
        </div>

        {/* bg */}
        <Comparison />

        {/* surface */}
        <div className={styles.surfaceSection}>
          <Pricing />
          <DesktopPromo />
        </div>

        {/* bg */}
        <FAQ />

        {/* surface */}
        <div className={styles.surfaceSection}>
          <LatestPosts posts={posts} />
        </div>

        {/* bg */}
        <CTA />
      </main>
      <Footer />
    </>
  );
}
