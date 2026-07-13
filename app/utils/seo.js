// SEO meta helper for all routes. Emits title, description, canonical, OG, and Twitter tags.
// og:image dimensions match public/og-image.png (1200x630); keep both in sync if the SVG changes.

const BASE_URL = "https://trovarci.sh";
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;
const DEFAULT_IMAGE_ALT = "Trovarcis Reach - email deliverability and number verification tools";
const DEFAULT_TITLE = "Trovarcis Reach | Email deliverability and number verification tools";

export function getSeo({ title, description, path = "", image, imageAlt, type = "website" }) {
  const url = `${BASE_URL}${path}`;
  const ogImage = image || DEFAULT_OG_IMAGE;
  const ogImageAlt = imageAlt || DEFAULT_IMAGE_ALT;
  const fullTitle = title ? `${title} | Trovarcis Reach` : DEFAULT_TITLE;

  const tags = [
    { title: fullTitle },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:title", content: fullTitle },
    { property: "og:url", content: url },
    { property: "og:type", content: type },
    { property: "og:site_name", content: "Trovarcis Reach" },
    { property: "og:locale", content: "en_US" },
    { property: "og:image", content: ogImage },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: ogImageAlt },
    { property: "og:image:type", content: "image/png" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:image", content: ogImage },
    { name: "twitter:image:alt", content: ogImageAlt },
  ];

  // Only emit description tags when a description is provided; avoid empty content attributes.
  if (description) {
    tags.push({ name: "description", content: description });
    tags.push({ property: "og:description", content: description });
    tags.push({ name: "twitter:description", content: description });
  }

  return tags;
}
