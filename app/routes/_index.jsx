import { useLoaderData } from 'react-router';
import { getAllPosts } from '~/utils/markdown.server';
import { getSeo } from '~/utils/seo';
import { currentSenderPrice } from '~/utils/senderConfig.server';
import { formatSenderPrice } from '~/utils/senderCopy';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import Hero from '~/components/landing/Hero';
import Checks from '~/components/landing/Checks';
import Pricing from '~/components/landing/Pricing';
import FAQ from '~/components/landing/FAQ';
import LatestPosts from '~/components/landing/LatestPosts';
import CTA from '~/components/landing/CTA';
import styles from '~/styles/modules/routes/home.module.css';

export const meta = () => getSeo({
  title: "Bulk email sender and email verification tools",
  description: "Trovarcis Sender sends bulk email from your own computer through your own SMTP accounts, with one payment. Plus six checks for your domain, list and message.",
  path: "/",
});

export function loader() {
  const posts = getAllPosts();
  const price = currentSenderPrice();
  return {
    posts,
    priceLabel: formatSenderPrice(price.cents),
  };
}

// Organization + WebSite schema in one @graph. No SearchAction: Google retired the sitelinks search box.
const HOME_SCHEMA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://trovarci.sh/#organization',
      name: 'Trovarcis',
      alternateName: 'Trovarcis Reach',
      url: 'https://trovarci.sh',
      logo: 'https://trovarci.sh/android-chrome-512x512.png',
      description: 'Trovarcis Sender, a Windows app for sending bulk email through your own SMTP accounts, and tools for checking your domain, list and message before you send.',
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@trovarcis.com',
        availableLanguage: 'English',
      },
    },
    {
      '@type': 'WebSite',
      '@id': 'https://trovarci.sh/#website',
      name: 'Trovarcis',
      alternateName: 'Trovarcis Reach',
      url: 'https://trovarci.sh',
      publisher: { '@id': 'https://trovarci.sh/#organization' },
      inLanguage: 'en-US',
    },
  ],
};

export default function Home() {
  const { posts, priceLabel } = useLoaderData();

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
          <Checks />
        </div>

        {/* bg */}
        <Pricing priceLabel={priceLabel} />

        {/* bg */}
        <FAQ priceLabel={priceLabel} />

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
