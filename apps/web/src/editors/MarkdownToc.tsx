import {
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type BlockTextLike, extractBlockPlainText } from "./blockMetrics.js";

export interface TocHeading {
  id: string;
  level: number;
  text: string;
}

interface HeadingBlockLike extends BlockTextLike {
  id?: string;
  children?: readonly HeadingBlockLike[];
}

export function extractDocumentHeadings(blocks: readonly HeadingBlockLike[] | undefined): TocHeading[] {
  if (!blocks || blocks.length === 0) return [];
  const headings: TocHeading[] = [];

  const visit = (items: readonly HeadingBlockLike[]) => {
    for (const block of items) {
      if (block.type === "heading" && typeof block.id === "string") {
        const text = extractBlockPlainText(block).replace(/\s+/g, " ").trim();
        if (text.length > 0) {
          const level = typeof block.props?.level === "number" ? block.props.level : 1;
          headings.push({ id: block.id, level, text });
        }
      }
      if (Array.isArray(block.children) && block.children.length > 0) {
        visit(block.children);
      }
    }
  };

  visit(blocks);
  return headings;
}

export function areTocHeadingsEqual(
  prev: readonly TocHeading[],
  next: readonly TocHeading[],
): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (!a || !b || a.id !== b.id || a.level !== b.level || a.text !== b.text) {
      return false;
    }
  }
  return true;
}

function getHeadingElement(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `[data-node-type="blockContainer"][data-id="${CSS.escape(id)}"]`,
  );
}

function computeActiveHeadingId(
  container: HTMLElement,
  headings: readonly TocHeading[],
): string | null {
  const firstHeading = headings[0];
  if (!firstHeading) return null;
  const containerRect = container.getBoundingClientRect();
  const isAtBottom =
    container.scrollHeight > container.clientHeight + 2 &&
    container.scrollTop + container.clientHeight >= container.scrollHeight - 8;

  if (isAtBottom) {
    for (let i = headings.length - 1; i >= 0; i -= 1) {
      const heading = headings[i];
      if (!heading) continue;
      const el = getHeadingElement(container, heading.id);
      if (!el) continue;
      const top = el.getBoundingClientRect().top - containerRect.top;
      if (top <= container.clientHeight) {
        return heading.id;
      }
    }
  }

  let candidate = firstHeading.id;
  for (const heading of headings) {
    const el = getHeadingElement(container, heading.id);
    if (!el) continue;
    const relativeTop = el.getBoundingClientRect().top - containerRect.top;
    if (relativeTop <= 88) {
      candidate = heading.id;
    } else {
      break;
    }
  }
  return candidate;
}

export interface MarkdownTocProps {
  headings: readonly TocHeading[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  theme: "light" | "dark";
}

export function MarkdownToc({ headings, scrollContainerRef, theme }: MarkdownTocProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => headings[0]?.id ?? null);
  const [nativeTargetMatched, setNativeTargetMatched] = useState(false);

  const navRef = useRef<HTMLElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const isHoveredRef = useRef(false);

  const supportsScrollTargetGroup = useMemo(
    () =>
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("scroll-target-group: auto"),
    [],
  );

  const minLevel = useMemo(
    () => (headings.length > 0 ? Math.min(...headings.map((h) => h.level)) : 1),
    [headings],
  );

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const syncActiveHeading = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || headings.length === 0) {
      setActiveId(null);
      setNativeTargetMatched(false);
      return;
    }

    if (supportsScrollTargetGroup) {
      const nativeMatch = navRef.current?.querySelector<HTMLAnchorElement>("a:target-current");
      const nativeId = nativeMatch?.dataset.headingId;
      if (nativeId && headings.some((h) => h.id === nativeId)) {
        setActiveId(nativeId);
        setNativeTargetMatched(true);
        return;
      }
    }

    setNativeTargetMatched(false);
    setActiveId(computeActiveHeadingId(container, headings));
  }, [headings, scrollContainerRef, supportsScrollTargetGroup]);

  useEffect(() => {
    const first = headings[0];
    if (!first) {
      setActiveId(null);
      setNativeTargetMatched(false);
      setIsOpen(false);
      return;
    }

    setActiveId((prev) => (prev && headings.some((h) => h.id === prev) ? prev : first.id));
  }, [headings]);

  // Attach stable fragment IDs onto BlockNote heading containers and bind scrollspy observers.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || headings.length === 0) return;

    let retryRafId: number | null = null;
    let scrollRafId: number | null = null;
    let intersectionObserver: IntersectionObserver | null = null;

    const updateCompact = () => {
      const nextCompact = container.clientWidth > 0 && container.clientWidth < 800;
      setIsCompact((prev) => (prev === nextCompact ? prev : nextCompact));
    };

    const syncHeadingDomTargets = (): boolean => {
      const activeTargetIds = new Set(headings.map((h) => `merak-toc-${h.id}`));
      const staleNodes = container.querySelectorAll<HTMLElement>('[id^="merak-toc-"]');
      for (const node of staleNodes) {
        if (!activeTargetIds.has(node.id)) {
          node.removeAttribute("id");
          node.removeAttribute("tabindex");
        }
      }

      const elements: HTMLElement[] = [];
      let allResolved = true;
      for (const heading of headings) {
        const el = getHeadingElement(container, heading.id);
        if (!el) {
          allResolved = false;
          continue;
        }
        const targetId = `merak-toc-${heading.id}`;
        if (el.id !== targetId) {
          el.id = targetId;
        }
        if (el.getAttribute("tabindex") !== "-1") {
          el.setAttribute("tabindex", "-1");
        }
        elements.push(el);
      }

      if (intersectionObserver) {
        intersectionObserver.disconnect();
        for (const el of elements) {
          intersectionObserver.observe(el);
        }
      }

      syncActiveHeading();
      return allResolved;
    };

    intersectionObserver = new IntersectionObserver(
      () => {
        syncActiveHeading();
      },
      {
        root: container,
        rootMargin: "-10% 0px -70% 0px",
        threshold: [0, 1],
      },
    );

    const handleScroll = () => {
      if (scrollRafId !== null) return;
      scrollRafId = window.requestAnimationFrame(() => {
        scrollRafId = null;
        syncActiveHeading();
      });
    };

    const handleScrollEnd = () => {
      syncActiveHeading();
    };

    const resizeObserver = new ResizeObserver(() => {
      updateCompact();
      syncActiveHeading();
    });

    updateCompact();
    const resolvedAll = syncHeadingDomTargets();
    if (!resolvedAll) {
      retryRafId = window.requestAnimationFrame(() => {
        retryRafId = null;
        syncHeadingDomTargets();
      });
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("scrollend", handleScrollEnd, { passive: true });
    resizeObserver.observe(container);

    return () => {
      if (retryRafId !== null) window.cancelAnimationFrame(retryRafId);
      if (scrollRafId !== null) window.cancelAnimationFrame(scrollRafId);
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("scrollend", handleScrollEnd);
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
    };
  }, [headings, scrollContainerRef, syncActiveHeading]);

  const handleMouseEnter = useCallback(() => {
    isHoveredRef.current = true;
    clearCloseTimer();
    setIsOpen(true);
  }, [clearCloseTimer]);

  const handleMouseLeave = useCallback(() => {
    isHoveredRef.current = false;
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setIsOpen(false);
    }, 120);
  }, [clearCloseTimer]);

  const handleFocus = useCallback(() => {
    clearCloseTimer();
    setIsOpen(true);
  }, [clearCloseTimer]);

  const handleBlur = useCallback((event: ReactFocusEvent<HTMLElement>) => {
    const nextFocus = event.relatedTarget as Node | null;
    if (nextFocus && event.currentTarget.contains(nextFocus)) return;
    if (!isHoveredRef.current) {
      setIsOpen(false);
    }
  }, []);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    isHoveredRef.current = false;
    setIsOpen(false);
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement && event.currentTarget.contains(activeEl)) {
      activeEl.blur();
    }
  }, []);

  const handleHeadingClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>, id: string) => {
      event.preventDefault();
      const container = scrollContainerRef.current;
      if (!container) return;
      const target = getHeadingElement(container, id);
      if (!target) return;

      const targetTop = Math.max(
        0,
        container.scrollTop +
          (target.getBoundingClientRect().top - container.getBoundingClientRect().top) -
          24,
      );
      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      container.scrollTo({
        top: targetTop,
        behavior: reduceMotion ? "auto" : "smooth",
      });

      setActiveId(id);
      target.focus({ preventScroll: true });
    },
    [scrollContainerRef],
  );

  if (headings.length === 0 || isCompact) {
    return null;
  }

  return (
    <aside
      className="merak-toc-root"
      data-merak-toc="true"
      data-merak-theme={theme}
      data-open={isOpen ? "true" : "false"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <div className="merak-toc-rail" aria-hidden="true">
        {headings.map((heading) => {
          const depth = Math.max(0, Math.min(2, heading.level - minLevel));
          const isActive = heading.id === activeId;
          return (
            <span
              key={heading.id}
              className="merak-toc-tick"
              data-depth={depth}
              data-active={isActive ? "true" : undefined}
            />
          );
        })}
      </div>

      <div className="merak-toc-card" data-open={isOpen ? "true" : "false"}>
        <nav ref={navRef} className="merak-toc-nav" aria-label="Table of contents">
          <ul className="merak-toc-list">
            {headings.map((heading) => {
              const indentLevel = Math.max(0, Math.min(3, heading.level - minLevel));
              const isActive = heading.id === activeId;
              const applyFallbackClass = isActive && !nativeTargetMatched;
              return (
                <li key={heading.id} className="merak-toc-item">
                  <a
                    href={`#merak-toc-${heading.id}`}
                    data-heading-id={heading.id}
                    className={
                      applyFallbackClass ? "merak-toc-link target-current" : "merak-toc-link"
                    }
                    aria-current={isActive ? "true" : "false"}
                    style={{ paddingInlineStart: `${6 + indentLevel * 12}px` }}
                    onClick={(event) => handleHeadingClick(event, heading.id)}
                  >
                    {heading.text}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
