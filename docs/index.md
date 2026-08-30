---
layout: home

hero:
  name: michi-chat
  text: A chat assistant platform for small businesses
  tagline: Multi-tenant, tool-calling, RAG-ready. Small enough to read in an afternoon, hardened enough to face the public internet.
  actions:
    - theme: brand
      text: Quickstart
      link: /guide/quickstart
    - theme: alt
      text: View on GitHub
      link: https://github.com/beany-vu/michi-chat

features:
  - title: One instance, many businesses
    details: Each tenant gets its own persona, branding, tools, knowledge base, embed key and daily spend cap. Adding tenant #2 is a form, not a deployment.
  - title: Any model, by config
    details: The app only knows three aliases (michi, judge, embed). LiteLLM decides what serves them, so moving from local Ollama to a hosted provider is a yaml edit.
  - title: Built for strangers
    details: The public endpoint assumes untrusted traffic. Origin allowlists, server-minted sessions, rate limits and a hard daily cap protect the bill against anyone with curl.
  - title: Grounded answers
    details: A pgvector knowledge base with heading-aware chunking and a measured recall@k eval. The bot says "I don't know" instead of inventing facts or prices.
---
