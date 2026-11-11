import react from "@vitejs/plugin-react";
import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";

/**
 * Injects `<link rel="preload" as="font">` for the two above-the-fold fonts: the IM Fell English roman (headings)
 * and the Libre Franklin variable roman (interface text), latin subset only. The woff2 files get hashed names, so
 * the tags are built from the bundle. Nothing is injected until a stylesheet imports the fontsource files
 * (styles/fonts.css), and nothing is injected in dev.
 */
const PRELOAD_FONTS =
  /^assets\/(?:im-fell-english-latin-400-normal|libre-franklin-latin-wght-normal)-[\w-]+\.woff2$/;

function fontPreload(): Plugin {
  return {
    name: "timewraith:font-preload",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        if (!ctx.bundle) return undefined;
        const tags: HtmlTagDescriptor[] = Object.keys(ctx.bundle)
          .filter((file) => PRELOAD_FONTS.test(file))
          .sort()
          .map((file) => ({
            tag: "link",
            attrs: { rel: "preload", as: "font", type: "font/woff2", crossorigin: "", href: `/${file}` },
            injectTo: "head",
          }));
        return tags;
      },
    },
  };
}

// `assets/` (masters, cutouts ...) sits next to `src/` and is not part of the Vite graph:
// only `public/` is copied verbatim and only imports from `src/` are bundled.
export default defineConfig({
  plugins: [react(), fontPreload()],
  server: {
    watch: { ignored: ["**/assets/**"] },
  },
  build: {
    target: "es2022",
  },
});
