// Authors shown on posts and on /about/<slug>. Posts are written by the Trovarcis team.

const BASE_URL = 'https://trovarci.sh';

export const AUTHORS = {
  'trovarcis-team': {
    slug: 'trovarcis-team',
    name: 'Trovarcis Team',
    role: 'Email tools and Trovarcis Sender',
    short: 'The team behind the Trovarcis email tools and the Trovarcis Sender desktop app.',
    bio: [
      'Trovarcis builds tools for people who send email: the free checks on trovarci.sh for domains, addresses, SMTP settings and DNS records, the Credits that pay for bulk checks, and Trovarcis Sender, a desktop app that sends campaigns through your own SMTP accounts.',
      'Every guide here is written from what we see building and running those tools, and checked against the providers’ own pages.',
    ],
    image: '/android-chrome-192x192.png',
    imageSmall: '/favicon-192x192.png',
    links: [
      { label: 'Contact', href: 'https://trovarci.sh/contact' },
    ],
  },
};

export const DEFAULT_AUTHOR = 'trovarcis-team';

// Earlier posts named a person; their pages now redirect to the team page.
export const RETIRED_AUTHORS = { 'joseph-lagbalu': 'trovarcis-team' };

export function getAuthor(slug) {
  return AUTHORS[RETIRED_AUTHORS[slug] || slug] || AUTHORS[DEFAULT_AUTHOR];
}

export function authorUrl(author) {
  return `/about/${author.slug}`;
}

export function authorSchema(author) {
  return {
    '@type': 'Organization',
    name: author.name,
    url: `${BASE_URL}${authorUrl(author)}`,
    logo: `${BASE_URL}${author.image}`,
    description: author.short,
  };
}
