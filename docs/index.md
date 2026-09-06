---
layout: home

hero:
  name: michi-chat
  text: A chat assistant platform for small businesses
  tagline: Multi-tenant, tool-calling, RAG-ready. Small enough to read in an afternoon, hardened enough to face the public internet.
  image:
    src: /michi-shield.png
    alt: The michi shield
  actions:
    - theme: brand
      text: Quickstart
      link: /guide/quickstart
    - theme: alt
      text: For business owners
      link: /owner/meet-your-assistant
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

<div class="michi-note">
  <img src="/michi.jpg" alt="Michi, an orange cat, asleep on the floor" loading="lazy">
  <div>
    <p class="michi-note-kicker">Good to know</p>
    <p>There is indeed a cat in Geneva named Michi. Every project in this workshop is named after Michi, and this is Michi's contribution: sleeping through the code review, then taking the credit.</p>
  </div>
</div>
