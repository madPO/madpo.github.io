import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://madpo.github.io",
  vite: {
    plugins: [],
  },
  markdown: {
    shikiConfig: {
      theme: "github-dark-default",
    },
  },
});
