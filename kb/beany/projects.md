# Projects

All of these are side projects, built on evenings and weekends. The day-job side of the
story lives on LinkedIn.

## michi-vz (also written @michi-vz)

A framework-agnostic D3 chart library with 22 chart types. One plain TypeScript chart
engine, wrapped for React, Vue, Svelte, Angular, native web components and vanilla JS, so
the same charts survive a stack change. It renders to SVG, Canvas or experimental WebGPU
behind one API. Every chart ships a hidden screen reader table by default, emits an
LLM-ready context object, and there is an in-page devtools panel to inspect and profile
any chart. MIT licensed, published as 8 packages under the @michi-vz npm scope
(https://www.npmjs.com/org/michi-vz) from the michi-vz-mono monorepo. Docs and live
demos: https://michi-vz.netlify.app/ and code at
https://github.com/beany-vu/michi-vz-mono. Named after Michi, Hoang's cat.

## michi-chat

A small, self-hostable, multi-tenant AI chat assistant platform for small businesses.
Each tenant is one business with its own persona, tools, branding, knowledge base and
embed key. Answers are grounded in the tenant's own data through tools and RAG, and the
bot is built and eval-tested to never invent facts, prices or availability. Stack:
Next.js, the OpenAI SDK, a LiteLLM proxy, Postgres with pgvector through Drizzle, all
running with Docker. Code: https://github.com/beany-vu/michi-chat, docs:
https://beany-vu.github.io/michi-chat/, container image on GHCR:
https://github.com/beany-vu/michi-chat/pkgs/container/michi-chat. The first tenant is
Mugshot Artisan Cafe in Pasig, Philippines. This very chat widget runs on michi-chat.

## e-Saxophone Learning

A browser practice tool for electronic saxophone. It listens to every note you play, over
USB MIDI or plain microphone with pitch detection, and scores your accuracy against
warm-ups, scales and songs. Live fingering chart, staff notation, a dated 20-week course
and a progress heatmap showing the notes you avoid. Built and tested against the Yamaha
YDS-120. Next.js front end, Go backend with PostgreSQL, deployed with Docker behind a
Cloudflare Tunnel. Available in five languages. Live at
https://e-saxophone.body-and-binary.net/ and code at
https://github.com/beany-vu/e-saxophone-learning.

## Mugshot

The web home of Mugshot Artisan Coffee in Pasig, Philippines (https://mugshotmnl.com/),
and quietly a bit more: behind the menu sits a platform for local artists, giving them a
place to promote their work and organize events at the shop. React, TypeScript,
PostgreSQL, MinIO, Docker. The shop is also the first tenant of michi-chat.

## JB Tabuzo

A portfolio and catalog site for a ceramic sculptor (https://jbtabuzo.com/): artwork
collections, individual pieces with availability, exhibitions and a contact flow, all
editable through a headless CMS. Next.js front end, .NET API, Squidex CMS, deployed with
Docker and Cloudflare Tunnel.
