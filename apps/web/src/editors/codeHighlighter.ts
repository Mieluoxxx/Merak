import type { HighlighterGeneric, LanguageInput } from "shiki/types";
import { normalizeCodeLanguage } from "./codeBlockLanguages.js";

const SHIKI_LANG_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  javascript: () => import("shiki/langs/javascript.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
  graphql: () => import("shiki/langs/graphql.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  mermaid: () => import("shiki/langs/mermaid.mjs"),
};

type MerakHighlighter = HighlighterGeneric<any, any>;

let highlighterPromise: Promise<MerakHighlighter> | null = null;

export function createMerakCodeHighlighter(): Promise<MerakHighlighter> {
  if (highlighterPromise) {
    return highlighterPromise;
  }

  highlighterPromise = (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, oneLight, oneDarkPro] =
      await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
        import("shiki/themes/one-light.mjs"),
        import("shiki/themes/one-dark-pro.mjs"),
      ]);

    const core = await createHighlighterCore({
      themes: [oneLight.default, oneDarkPro.default],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });

    const coreLoadLanguage = core.loadLanguage.bind(core);
    const inFlight = new Map<string, Promise<void>>();

    const loadLanguage = async (...langs: LanguageInput[]) => {
      for (const entry of langs) {
        if (typeof entry !== "string") {
          await coreLoadLanguage(entry);
          continue;
        }
        const canonical = normalizeCodeLanguage(entry);
        if (canonical === "text") {
          throw new Error(`Plain text does not require syntax highlighting: ${entry}`);
        }
        if (core.getLoadedLanguages().includes(canonical)) {
          continue;
        }
        const loader = SHIKI_LANG_LOADERS[canonical];
        if (!loader) {
          throw new Error(`Unsupported code block language: ${entry}`);
        }
        let pending = inFlight.get(canonical);
        if (!pending) {
          pending = loader()
            .then((mod) => coreLoadLanguage(mod.default as LanguageInput))
            .finally(() => {
              inFlight.delete(canonical);
            });
          inFlight.set(canonical, pending);
        }
        await pending;
      }
    };

    const proxy = Object.create(core) as MerakHighlighter;
    proxy.loadLanguage = loadLanguage;
    return proxy;
  })().catch((err) => {
    highlighterPromise = null;
    throw err;
  });

  return highlighterPromise;
}
