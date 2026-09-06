import { defineConfig } from "vitepress";

// Absolute origin for canonical / Open Graph / sitemap URLs (GitHub Pages project site).
const SITE_URL = "https://beany-vu.github.io/michi-chat";

export default defineConfig({
  title: "michi-chat",
  description: "A small multi-tenant chat assistant platform you can read in an afternoon.",
  // Project pages live under https://<owner>.github.io/michi-chat/
  base: "/michi-chat/",
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/michi-chat/michi-shield-96.png" }],
    ["script", { async: "", src: "https://www.googletagmanager.com/gtag/js?id=G-7B9F6M4R26" }],
    [
      "script",
      {},
      "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-7B9F6M4R26');",
    ],
  ],

  cleanUrls: true,
  // localhost URLs in the quickstart are the point, not dead links.
  ignoreDeadLinks: [/^http:\/\/localhost/],
  // No lastUpdated: the docs build runs in the app container, which has no git.
  sitemap: { hostname: SITE_URL + "/" },
  // Per-page SEO, the same recipe as the michi-vz docs: a unique description, a
  // canonical URL, Open Graph + Twitter tags on every page, and JSON-LD on the home
  // page so search engines and AI crawlers read this as one open-source project.
  // A page overrides the description with its own `description:` frontmatter.
  transformPageData(pageData) {
    const path = pageData.relativePath.replace(/\.md$/, "").replace(/(^|\/)index$/, "$1");
    const url = (SITE_URL + "/" + path).replace(/\/+$/, "") || SITE_URL;
    const isHome = pageData.relativePath === "index.md";
    const title = pageData.frontmatter.title || pageData.title || "michi-chat";
    const desc =
      pageData.frontmatter.description ||
      (!isHome && pageData.title
        ? `${pageData.title}: michi-chat, a small multi-tenant chat assistant platform for small businesses, with tool calling, a knowledge base and an owner-friendly admin.`
        : "A small multi-tenant chat assistant platform for small businesses: tool-calling, RAG-ready, any model by config, hardened for the public internet.");
    pageData.description = desc;
    const image = SITE_URL + "/og-card.png";
    (pageData.frontmatter.head ??= []).push(
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:type", content: isHome ? "website" : "article" }],
      ["meta", { property: "og:site_name", content: "michi-chat" }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: desc }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { property: "og:image", content: image }],
      ["meta", { property: "og:image:width", content: "1200" }],
      ["meta", { property: "og:image:height", content: "630" }],
      ["meta", { property: "og:image:alt", content: "michi-chat: a chat assistant platform for small businesses, with the Michi cat crest" }],
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: desc }],
      ["meta", { name: "twitter:image", content: image }],
    );
    if (isHome) {
      pageData.frontmatter.head.push([
        "script",
        { type: "application/ld+json" },
        JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebSite", name: "michi-chat", url: SITE_URL + "/", description: desc },
            {
              "@type": "SoftwareSourceCode",
              name: "michi-chat",
              description: desc,
              codeRepository: "https://github.com/beany-vu/michi-chat",
              programmingLanguage: "TypeScript",
              runtimePlatform: "Node.js",
              license: "https://opensource.org/licenses/MIT",
              url: SITE_URL + "/",
              author: { "@type": "Person", name: "Hoang Vu", url: "https://hoang.body-and-binary.net/" },
              isPartOf: [
                { "@type": "SoftwareSourceCode", name: "michi-vz", url: "https://michi-vz.netlify.app/" },
              ],
            },
          ],
        }),
      ]);
    }
  },
  themeConfig: {
    // The michi shield, shared with the sister projects (michi-vz uses the same one).
    logo: "/michi-shield-96.png",
    nav: [
      { text: "What\u2019s new", link: "/whats-new" },
      { text: "Articles", link: "/articles" },
      { text: "Guide", link: "/guide/quickstart" },
      { text: "GitHub", link: "https://github.com/beany-vu/michi-chat" },
    ],
    sidebar: [
      {
        text: "Release notes",
        items: [
          { text: "What\u2019s new", link: "/whats-new" },
          { text: "Articles", link: "/articles" },
        ],
      },
      {
        text: "For business owners",
        items: [
          { text: "Meet your assistant", link: "/owner/meet-your-assistant" },
          { text: "Set it up, step by step", link: "/owner/setup" },
          { text: "Running it day to day", link: "/owner/day-to-day" },
          { text: "Turn a PDF into knowledge", link: "/owner/import-a-pdf" },
        ],
      },
      {
        text: "Getting started",
        items: [
          { text: "Quickstart", link: "/guide/quickstart" },
          { text: "Model backends", link: "/guide/models" },
        ],
      },
      {
        text: "Running it",
        items: [
          { text: "The admin UI", link: "/guide/admin" },
          { text: "Knowledge base", link: "/guide/knowledge-base" },
          { text: "Embedding on a website", link: "/guide/embedding" },
          { text: "Security model", link: "/guide/security" },
        ],
      },
      {
        text: "Going further",
        items: [
          { text: "Extending with tool packs", link: "/guide/extending" },
          { text: "Environment reference", link: "/guide/reference" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/beany-vu/michi-chat" }],
    search: { provider: "local" },
  },
});
