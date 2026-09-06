// Default theme plus one slot: a footer on every page. VitePress only shows
// themeConfig.footer on pages without a sidebar, and every guide page has one.
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import SiteFooter from "./SiteFooter.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "layout-bottom": () => h(SiteFooter),
    });
  },
};
