/**
 * Sandboxed iframe runtime bridge (`sandbox="allow-scripts"`, no `allow-same-origin`).
 * Synchronizes parent theme for cross-browser (Safari) `color-scheme` consistency
 * and forwards runtime errors/warnings back to the Merak workbench.
 */
export const MERAK_ARTIFACT_JS = `(() => {
  if (typeof window === "undefined") return;

  const post = (payload) => {
    try {
      window.parent?.postMessage(payload, "*");
    } catch {
      // Ignore postMessage errors inside detached frames.
    }
  };

  const applyTheme = (theme) => {
    const normalized = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = normalized;
    document.documentElement.style.colorScheme = normalized;
  };

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (data && typeof data === "object" && data.type === "merak:theme") {
      applyTheme(data.theme);
    }
  });

  const formatArg = (arg) => {
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  };

  const origError = console.error.bind(console);
  console.error = (...args) => {
    post({ type: "merak:console", level: "error", message: args.map(formatArg).join(" ") });
    origError(...args);
  };

  const origWarn = console.warn.bind(console);
  console.warn = (...args) => {
    post({ type: "merak:console", level: "warn", message: args.map(formatArg).join(" ") });
    origWarn(...args);
  };

  window.addEventListener("error", (event) => {
    post({
      type: "merak:console",
      level: "error",
      message: event.message || "Unhandled script error",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    post({ type: "merak:console", level: "error", message: reason });
  });

  window.MerakArtifact = {
    setTheme: applyTheme,
    emitAction: (action, payload) => post({ type: "merak:action", action, payload }),
  };

  const notifyReady = () => post({ type: "merak:ready" });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", notifyReady, { once: true });
  } else {
    notifyReady();
  }
})();
`;
