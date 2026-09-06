<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer-inner">
      <p class="site-footer-line">
        <span aria-hidden="true">&#10084;&#65039;</span> Open source and built with care
      </p>
      <p class="site-footer-ask">
        If it made you smile, a star on GitHub keeps the cat fed. Pull requests are welcome too; the cat reviews every one personally.
      </p>
      <p class="site-footer-links">
        <a href="https://github.com/beany-vu/michi-chat" target="_blank" rel="noopener">Star on GitHub</a>
        <span class="dot">&middot;</span>
        <a href="https://github.com/beany-vu/michi-chat/issues" target="_blank" rel="noopener">Contribute</a>
        <span class="dot">&middot;</span>
        <a href="/michi-chat/llms.txt">llms.txt</a>
      </p>
      <p class="site-footer-links">
        More from the same workshop:
        <a href="https://michi-vz.netlify.app/" target="_blank" rel="noopener">@michi-vz</a>, a chart library for any framework
        <span class="dot">&middot;</span>
        <a href="https://e-saxophone.body-and-binary.net/" target="_blank" rel="noopener">e-Saxophone Learning</a>, practice with your electronic sax
        <span class="dot">&middot;</span>
        <a href="https://hoang.body-and-binary.net/" target="_blank" rel="noopener">the maker's site</a>
      </p>
      <p class="site-footer-copy">MIT licensed &middot; &copy; {{ year }} <a href="https://hoang.body-and-binary.net/" target="_blank" rel="noopener">Hoang Vu</a></p>
    </div>
  </footer>
</template>
