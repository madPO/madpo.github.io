import { defineConfig } from "astro/config";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://madpo.me/",

  vite: {
    plugins: [],
  },

  markdown: {
    shikiConfig: {
      theme: "github-dark-default",
    },
  },

  integrations: [sitemap()],
});
