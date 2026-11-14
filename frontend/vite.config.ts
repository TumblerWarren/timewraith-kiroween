import react from "@vitejs/plugin-react";
import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";

/**
 * Injects `<link rel="preload" as="font">` for the above-the-fold IM Fell English roman (body and UI text),
 * latin subset only. The woff2 files get hashed names, so the tags are built from the bundle.
 */
const PRELOAD_FONTS =
  /^assets\/im-fell-english-latin-400-normal-[\w-]+\.woff2$/;

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
/** The TimeWraith backend (`uv --directory backend run uvicorn timewraith.api:app --port 8787`). */
const BACKEND = process.env.TW_BACKEND_URL ?? "http://127.0.0.1:8787";
const proxy = { "/api": { target: BACKEND, changeOrigin: false } };

export default defineConfig({
  plugins: [react(), fontPreload()],
  server: {
    watch: { ignored: ["**/assets/**"] },
    proxy,
  },
  preview: { proxy },
  build: {
    target: "es2022",
  },
});
