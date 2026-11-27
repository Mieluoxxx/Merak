export interface CodeBlockLanguage {
  id: string;
  name: string;
  aliases?: string[];
}

export const MERAK_CODE_LANGUAGES: readonly CodeBlockLanguage[] = [
  { id: "text", name: "Plain Text", aliases: ["plain", "plaintext", "txt", "none"] },
  { id: "javascript", name: "JavaScript", aliases: ["js", "mjs", "cjs"] },
  { id: "typescript", name: "TypeScript", aliases: ["ts", "mts", "cts"] },
  { id: "tsx", name: "TSX" },
  { id: "jsx", name: "JSX" },
  { id: "python", name: "Python", aliases: ["py"] },
  { id: "go", name: "Go", aliases: ["golang"] },
  { id: "rust", name: "Rust", aliases: ["rs"] },
  { id: "html", name: "HTML", aliases: ["htm"] },
  { id: "css", name: "CSS" },
  { id: "scss", name: "SCSS", aliases: ["sass"] },
  { id: "json", name: "JSON", aliases: ["jsonc"] },
  { id: "yaml", name: "YAML", aliases: ["yml"] },
  { id: "toml", name: "TOML" },
  { id: "sql", name: "SQL" },
  { id: "bash", name: "Bash", aliases: ["sh", "shell", "zsh"] },
  { id: "markdown", name: "Markdown", aliases: ["md"] },
  { id: "c", name: "C" },
  { id: "cpp", name: "C++", aliases: ["c++", "cc", "cxx"] },
  { id: "csharp", name: "C#", aliases: ["cs", "c#"] },
  { id: "java", name: "Java" },
  { id: "kotlin", name: "Kotlin", aliases: ["kt"] },
  { id: "swift", name: "Swift" },
  { id: "php", name: "PHP" },
  { id: "ruby", name: "Ruby", aliases: ["rb"] },
  { id: "dockerfile", name: "Docker", aliases: ["docker"] },
  { id: "graphql", name: "GraphQL", aliases: ["gql"] },
  { id: "xml", name: "XML", aliases: ["svg"] },
  { id: "diff", name: "Diff", aliases: ["patch"] },
  { id: "mermaid", name: "Mermaid" },
];

export const MERAK_SUPPORTED_LANGUAGES: Record<
  string,
  { name: string; aliases?: string[] }
> = Object.fromEntries(
  MERAK_CODE_LANGUAGES.map((lang) => [
    lang.id,
    lang.aliases ? { name: lang.name, aliases: lang.aliases } : { name: lang.name },
  ]),
);

const LANGUAGE_BY_TOKEN = new Map<string, CodeBlockLanguage>();

for (const lang of MERAK_CODE_LANGUAGES) {
  LANGUAGE_BY_TOKEN.set(lang.id.toLowerCase(), lang);
  if (lang.aliases) {
    for (const alias of lang.aliases) {
      LANGUAGE_BY_TOKEN.set(alias.toLowerCase(), lang);
    }
  }
}

export function normalizeCodeLanguage(raw: string | undefined | null): string {
  const trimmed = raw?.trim().toLowerCase() ?? "";
  if (!trimmed) return "text";
  return LANGUAGE_BY_TOKEN.get(trimmed)?.id ?? trimmed;
}

export function getCodeLanguageLabel(language: string | undefined | null): string {
  const trimmed = language?.trim() ?? "";
  if (!trimmed) return "Plain Text";
  const matched = LANGUAGE_BY_TOKEN.get(trimmed.toLowerCase());
  if (matched) return matched.name;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function filterCodeLanguages(query: string): CodeBlockLanguage[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...MERAK_CODE_LANGUAGES];

  const prefixMatches: CodeBlockLanguage[] = [];
  const substringMatches: CodeBlockLanguage[] = [];

  for (const lang of MERAK_CODE_LANGUAGES) {
    const tokens = [lang.name, lang.id, ...(lang.aliases ?? [])].map((t) =>
      t.toLowerCase(),
    );
    if (tokens.some((t) => t.startsWith(normalized))) {
      prefixMatches.push(lang);
    } else if (tokens.some((t) => t.includes(normalized))) {
      substringMatches.push(lang);
    }
  }

  return [...prefixMatches, ...substringMatches];
}

export function extractCodeBlockText(content: unknown, fallbackText = ""): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return fallbackText;
  }

  let result = "";
  let foundTextNode = false;
  for (const item of content) {
    if (
      typeof item === "object" &&
      item !== null &&
      "text" in item &&
      typeof item.text === "string"
    ) {
      result += item.text;
      foundTextNode = true;
    }
  }

  return foundTextNode ? result : fallbackText;
}
