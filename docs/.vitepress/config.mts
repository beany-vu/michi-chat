import { defineConfig } from "vitepress";

export default defineConfig({
  title: "michi-chat",
  description: "A small multi-tenant chat assistant platform you can read in an afternoon.",
  // Project pages live under https://<owner>.github.io/michi-chat/
  base: "/michi-chat/",
  cleanUrls: true,
  // localhost URLs in the quickstart are the point, not dead links.
  ignoreDeadLinks: [/^http:\/\/localhost/],
  themeConfig: {
    nav: [
      { text: "What\u2019s new", link: "/whats-new" },
      { text: "Guide", link: "/guide/quickstart" },
      { text: "GitHub", link: "https://github.com/beany-vu/michi-chat" },
    ],
    sidebar: [
      {
        text: "Release notes",
        items: [{ text: "What\u2019s new", link: "/whats-new" }],
      },
      {
        text: "For business owners",
        items: [
          { text: "Meet your assistant", link: "/owner/meet-your-assistant" },
          { text: "Set it up, step by step", link: "/owner/setup" },
          { text: "Running it day to day", link: "/owner/day-to-day" },
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
