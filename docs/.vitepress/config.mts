import { defineConfig } from "vitepress";

export default defineConfig({
  title: "michi-chat",
  description: "A small multi-tenant chat assistant platform you can read in an afternoon.",
  // Project pages live under https://<owner>.github.io/michi-chat/
  base: "/michi-chat/",
  head: [
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
  themeConfig: {
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
