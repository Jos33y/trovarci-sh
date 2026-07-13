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
  title: "Email deliverability and number verification tools",
  description: "Six tools for email deliverability and number verification. Verify lists, score copy, audit DNS, test SMTP. Pay as you go. 10 free credits on signup, no subscription.",
  path: "/",
});

export function loader() {
  const posts = getAllPosts();
  return { posts };
}

// Organization + WebSite schema in one @graph. WebSite.potentialAction enables Google sitelinks
// searchbox pointing at /blog?q= which the blog index route already parses.
const HOME_SCHEMA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://trovarci.sh/#organization',
      name: 'Trovarcis Reach',
      url: 'https://trovarci.sh',
      logo: 'https://trovarci.sh/android-chrome-512x512.png',
      description: 'Email deliverability and number verification tools for anyone who sends email or verifies contacts.',
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@trovarci.sh',
        availableLanguage: 'English',
      },
    },
    {
      '@type': 'WebSite',
      '@id': 'https://trovarci.sh/#website',
      name: 'Trovarcis Reach',
      url: 'https://trovarci.sh',
      publisher: { '@id': 'https://trovarci.sh/#organization' },
      inLanguage: 'en-US',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://trovarci.sh/blog?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ],
};

export default function Home() {
  const { posts } = useLoaderData();

  return (
    <>
      <Header />
      <main>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_SCHEMA) }}
        />

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
