// Authors shown on posts and on /about/<slug>. Public, verifiable facts only.

const BASE_URL = 'https://trovarci.sh';

export const AUTHORS = {
  'joseph-lagbalu': {
    slug: 'joseph-lagbalu',
    name: 'Joseph Lagbalu',
    role: 'Founder of Trovarcis',
    short: 'Founder of Trovarcis. Builds email deliverability tools and the Trovarcis Sender desktop app.',
    bio: [
      'Joseph Lagbalu builds and runs Trovarcis on his own: the free email and phone tools on trovarci.sh, the Credits system behind them, and the Trovarcis Sender desktop app.',
      'He has built software since 2020 and founded The Brick Dev Studios in 2023, building payment systems, online stores and backend infrastructure for clients in Nigeria, the UK and Portugal. He holds a B.Sc. in Computer Science from Kwara State University.',
    ],
    image: '/images/authors/joseph-lagbalu-400.webp',
    imageSmall: '/images/authors/joseph-lagbalu-96.webp',
    links: [
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/joseph-lagbalu/' },
      { label: 'GitHub', href: 'https://github.com/Jos33y' },
      { label: 'The Brick Dev Studios', href: 'https://thebrickdev.com' },
    ],
  },
};

export const DEFAULT_AUTHOR = 'joseph-lagbalu';

export function getAuthor(slug) {
  return AUTHORS[slug] || AUTHORS[DEFAULT_AUTHOR];
}

export function authorUrl(author) {
  return `/about/${author.slug}`;
}

export function authorSchema(author) {
  return {
    '@type': 'Person',
    name: author.name,
    url: `${BASE_URL}${authorUrl(author)}`,
    image: `${BASE_URL}${author.image}`,
    jobTitle: 'Founder',
    description: author.short,
    worksFor: { '@type': 'Organization', name: 'Trovarcis', url: BASE_URL },
    sameAs: author.links.map((l) => l.href),
  };
}
