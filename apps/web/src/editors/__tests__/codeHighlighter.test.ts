import { describe, expect, it } from "vitest";
import { createMerakCodeHighlighter } from "../codeHighlighter.js";

describe("codeHighlighter", () => {
  it("loads light and dark themes and lazily highlights TypeScript and aliased JS", async () => {
    const highlighter = await createMerakCodeHighlighter();
    expect(highlighter.getLoadedThemes()).toContain("one-light");
    expect(highlighter.getLoadedThemes()).toContain("one-dark-pro");

    await highlighter.loadLanguage("typescript");
    await highlighter.loadLanguage("js");
    await highlighter.loadLanguage("bash");
    await highlighter.loadLanguage("dockerfile");

    expect(highlighter.getLoadedLanguages()).toContain("typescript");
    expect(highlighter.getLoadedLanguages()).toContain("javascript");
    expect(highlighter.getLoadedLanguages()).toContain("bash");
    expect(highlighter.getLoadedLanguages()).toContain("dockerfile");

    const result = highlighter.codeToTokens("const x: number = 1;", {
      lang: "typescript",
      themes: { light: "one-light", dark: "one-dark-pro" },
      defaultColor: false,
    });

    const tokens = result.tokens.flat();
    const constToken = tokens.find((token) => token.content === "const");
    expect(constToken?.htmlStyle).toBeTruthy();
    expect(constToken?.htmlStyle?.["--shiki-light"]).toBeTruthy();
    expect(constToken?.htmlStyle?.["--shiki-dark"]).toBeTruthy();
  });

  it("highlights Python builtins and strings with distinct dark theme colors", async () => {
    const highlighter = await createMerakCodeHighlighter();
    await highlighter.loadLanguage("python");

    const result = highlighter.codeToTokens('print("hello world")', {
      lang: "python",
      themes: { light: "one-light", dark: "one-dark-pro" },
      defaultColor: false,
    });

    const tokens = result.tokens.flat();
    const printToken = tokens.find((token) => token.content === "print");
    const stringToken = tokens.find((token) => token.content.includes("hello world"));

    expect(printToken?.htmlStyle?.["--shiki-dark"]).toBeTruthy();
    expect(stringToken?.htmlStyle?.["--shiki-dark"]).toBeTruthy();
    expect(printToken?.htmlStyle?.["--shiki-dark"]).not.toBe(
      stringToken?.htmlStyle?.["--shiki-dark"],
    );
  });

  it("rejects unknown or plain-text languages cleanly", async () => {
    const highlighter = await createMerakCodeHighlighter();
    await expect(highlighter.loadLanguage("text")).rejects.toThrow();
    await expect(highlighter.loadLanguage("nonexistent_lang_xyz")).rejects.toThrow();
  });
});
