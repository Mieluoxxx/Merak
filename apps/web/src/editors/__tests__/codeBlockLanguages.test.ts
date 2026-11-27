import { describe, expect, it } from "vitest";
import {
  extractCodeBlockText,
  filterCodeLanguages,
  getCodeLanguageLabel,
  normalizeCodeLanguage,
} from "../codeBlockLanguages.js";

describe("codeBlockLanguages", () => {
  it("normalizes common language aliases and defaults empty input to text", () => {
    expect(normalizeCodeLanguage("js")).toBe("javascript");
    expect(normalizeCodeLanguage("TS")).toBe("typescript");
    expect(normalizeCodeLanguage(" py ")).toBe("python");
    expect(normalizeCodeLanguage("sh")).toBe("bash");
    expect(normalizeCodeLanguage("plain")).toBe("text");
    expect(normalizeCodeLanguage("")).toBe("text");
    expect(normalizeCodeLanguage(undefined)).toBe("text");
    expect(normalizeCodeLanguage("prisma")).toBe("prisma");
  });

  it("formats display labels for known, aliased, empty, and custom languages", () => {
    expect(getCodeLanguageLabel("javascript")).toBe("JavaScript");
    expect(getCodeLanguageLabel("js")).toBe("JavaScript");
    expect(getCodeLanguageLabel("text")).toBe("Plain Text");
    expect(getCodeLanguageLabel("")).toBe("Plain Text");
    expect(getCodeLanguageLabel(null)).toBe("Plain Text");
    expect(getCodeLanguageLabel("prisma")).toBe("Prisma");
  });

  it("filters languages case-insensitively and prioritizes prefix matches", () => {
    const all = filterCodeLanguages("");
    expect(all.length).toBeGreaterThan(20);
    expect(all[0]?.id).toBe("text");

    const jsMatches = filterCodeLanguages("js");
    expect(jsMatches.map((lang) => lang.id)).toContain("javascript");
    expect(jsMatches.map((lang) => lang.id)).toContain("jsx");
    expect(jsMatches.map((lang) => lang.id)).toContain("json");
    // Prefix matches on id/alias/name should come before substring matches (e.g. "jsx" / "javascript" before "nodejs" if any).
    expect(jsMatches[0]?.id).toBe("javascript");

    const pyMatches = filterCodeLanguages("py");
    expect(pyMatches.map((lang) => lang.id)).toEqual(["python"]);
  });

  it("extracts plain text from BlockNote codeBlock content with fallback", () => {
    expect(
      extractCodeBlockText([
        { type: "text", text: "const a = 1;\n", styles: {} },
        { type: "text", text: "console.log(a);", styles: {} },
      ]),
    ).toBe("const a = 1;\nconsole.log(a);");

    expect(extractCodeBlockText([], "fallback code")).toBe("fallback code");
    expect(extractCodeBlockText(null, "fallback")).toBe("fallback");
    expect(extractCodeBlockText("direct text")).toBe("direct text");
  });
});
