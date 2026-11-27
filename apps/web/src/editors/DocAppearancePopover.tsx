import { Popover, PopoverContent, PopoverTrigger } from "@merak/ui";
import { colors, font, radius } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { ArrowLeftRight, Copy, MoreHorizontal, Type } from "lucide-react";
import { useState } from "react";

export type DocFontStyle = "sans" | "serif" | "mono";

export interface DocAppearanceSettings {
  fontStyle: DocFontStyle;
  smallText: boolean;
  fullWidth: boolean;
}

export const DOC_APPEARANCE_STORAGE_KEY = "merak:doc-appearance";

export const DEFAULT_DOC_APPEARANCE: DocAppearanceSettings = {
  fontStyle: "sans",
  smallText: false,
  fullWidth: false,
};

export function loadDocAppearance(): DocAppearanceSettings {
  try {
    const raw = window.localStorage.getItem(DOC_APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_DOC_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<DocAppearanceSettings>;
    const fontStyle: DocFontStyle =
      parsed.fontStyle === "serif" || parsed.fontStyle === "mono" ? parsed.fontStyle : "sans";
    return {
      fontStyle,
      smallText: Boolean(parsed.smallText),
      fullWidth: Boolean(parsed.fullWidth),
    };
  } catch {
    return DEFAULT_DOC_APPEARANCE;
  }
}

export function saveDocAppearance(settings: DocAppearanceSettings): void {
  try {
    window.localStorage.setItem(DOC_APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors in restricted browsing modes.
  }
}

const FONT_STYLE_OPTIONS: readonly {
  id: DocFontStyle;
  label: string;
}[] = [
  { id: "sans", label: "Default" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

export interface DocAppearancePopoverProps {
  settings: DocAppearanceSettings;
  onChange: (next: DocAppearanceSettings) => void;
  onCopyPageMarkdown: () => void | Promise<void>;
  getPageStats: () => { words: number; chars: number };
}

const styles = stylex.create({
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.textMuted,
    cursor: "pointer",
  },
  panel: {
    width: "248px",
    maxWidth: "248px",
    gap: 0,
    rowGap: 0,
    paddingTop: "8px",
    paddingBottom: "6px",
    paddingLeft: "4px",
    paddingRight: "4px",
    backgroundColor: colors.bgElevated,
    borderWidth: 0,
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
  },
  sectionLabel: {
    paddingTop: "2px",
    paddingBottom: "4px",
    paddingLeft: "8px",
    paddingRight: "8px",
    fontSize: "11px",
    fontWeight: 500,
    lineHeight: 1.2,
    color: colors.textMuted,
    userSelect: "none",
  },
  fontGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "6px",
    paddingTop: "2px",
    paddingBottom: "6px",
    paddingLeft: "8px",
    paddingRight: "8px",
  },
  fontCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    paddingTop: "8px",
    paddingBottom: "8px",
    paddingLeft: "4px",
    paddingRight: "4px",
    borderRadius: radius.sm,
    borderWidth: "1.5px",
    borderStyle: "solid",
    borderColor: {
      default: colors.border,
      ":hover": colors.textMuted,
    },
    backgroundColor: {
      default: colors.bgSubtle,
      ":hover": colors.bgHover,
    },
    color: colors.text,
    cursor: "pointer",
    transitionProperty: "border-color, background-color, color",
    transitionDuration: "120ms",
  },
  fontCardActive: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  fontSampleSans: {
    fontFamily: font.sans,
    fontSize: "20px",
    fontWeight: 600,
    lineHeight: 1.1,
  },
  fontSampleSerif: {
    fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
    fontSize: "20px",
    fontWeight: 600,
    lineHeight: 1.1,
  },
  fontSampleMono: {
    fontFamily: font.mono,
    fontSize: "20px",
    fontWeight: 600,
    lineHeight: 1.1,
  },
  fontCardCaption: {
    fontFamily: font.sans,
    fontSize: "11px",
    color: colors.textMuted,
  },
  fontCardCaptionActive: {
    color: colors.accent,
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    width: "100%",
    height: "28px",
    minHeight: "28px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "8px",
    paddingRight: "8px",
    borderWidth: 0,
    borderRadius: "6px",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.text,
    fontFamily: font.sans,
    fontSize: "13px",
    cursor: "pointer",
  },
  rowLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  rowIcon: {
    display: "inline-flex",
    alignItems: "center",
    color: colors.textMuted,
  },
  switchTrack: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    width: "30px",
    height: "17px",
    borderRadius: radius.full,
    backgroundColor: colors.bgActive,
    transitionProperty: "background-color",
    transitionDuration: "150ms",
    flexShrink: 0,
  },
  switchTrackOn: {
    backgroundColor: colors.accent,
  },
  switchThumb: {
    width: "13px",
    height: "13px",
    borderRadius: radius.full,
    backgroundColor: "#ffffff",
    transform: "translateX(2px)",
    transitionProperty: "transform",
    transitionDuration: "150ms",
  },
  switchThumbOn: {
    transform: "translateX(15px)",
  },
  divider: {
    height: "1px",
    marginTop: "5px",
    marginBottom: "5px",
    marginLeft: "-4px",
    marginRight: "-4px",
    backgroundColor: colors.borderSubtle,
  },
  footer: {
    paddingTop: "4px",
    paddingBottom: "2px",
    paddingLeft: "8px",
    paddingRight: "8px",
    fontSize: "11px",
    color: colors.textMuted,
  },
});

export function DocAppearancePopover({
  settings,
  onChange,
  onCopyPageMarkdown,
  getPageStats,
}: DocAppearancePopoverProps) {
  const [open, setOpen] = useState(false);
  const stats = open ? getPageStats() : { words: 0, chars: 0 };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Page appearance and actions"
        data-merak-trigger="appearance"
        {...stylex.props(styles.trigger)}
      >
        <MoreHorizontal size={16} />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        data-merak-popover="appearance"
        {...stylex.props(styles.panel)}
      >
        <div {...stylex.props(styles.sectionLabel)}>Font style</div>
        <div {...stylex.props(styles.fontGrid)}>
          {FONT_STYLE_OPTIONS.map((option) => {
            const isActive = settings.fontStyle === option.id;
            const sampleStyle =
              option.id === "serif"
                ? styles.fontSampleSerif
                : option.id === "mono"
                  ? styles.fontSampleMono
                  : styles.fontSampleSans;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onChange({ ...settings, fontStyle: option.id })}
                {...stylex.props(styles.fontCard, isActive && styles.fontCardActive)}
              >
                <span {...stylex.props(sampleStyle)}>Ag</span>
                <span
                  {...stylex.props(
                    styles.fontCardCaption,
                    isActive && styles.fontCardCaptionActive,
                  )}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>

        <div {...stylex.props(styles.sectionLabel)}>Customize</div>

        <button
          type="button"
          role="switch"
          aria-checked={settings.smallText}
          onClick={() => onChange({ ...settings, smallText: !settings.smallText })}
          {...stylex.props(styles.toggleRow)}
        >
          <span {...stylex.props(styles.rowLeft)}>
            <span {...stylex.props(styles.rowIcon)}>
              <Type size={14} />
            </span>
            <span>Small text</span>
          </span>
          <span
            aria-hidden="true"
            {...stylex.props(styles.switchTrack, settings.smallText && styles.switchTrackOn)}
          >
            <span
              {...stylex.props(styles.switchThumb, settings.smallText && styles.switchThumbOn)}
            />
          </span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={settings.fullWidth}
          onClick={() => onChange({ ...settings, fullWidth: !settings.fullWidth })}
          {...stylex.props(styles.toggleRow)}
        >
          <span {...stylex.props(styles.rowLeft)}>
            <span {...stylex.props(styles.rowIcon)}>
              <ArrowLeftRight size={14} />
            </span>
            <span>Full width</span>
          </span>
          <span
            aria-hidden="true"
            {...stylex.props(styles.switchTrack, settings.fullWidth && styles.switchTrackOn)}
          >
            <span
              {...stylex.props(styles.switchThumb, settings.fullWidth && styles.switchThumbOn)}
            />
          </span>
        </button>

        <div {...stylex.props(styles.divider)} />

        <button
          type="button"
          onClick={() => {
            void onCopyPageMarkdown();
            setOpen(false);
          }}
          {...stylex.props(styles.toggleRow)}
        >
          <span {...stylex.props(styles.rowLeft)}>
            <span {...stylex.props(styles.rowIcon)}>
              <Copy size={14} />
            </span>
            <span>Copy page Markdown</span>
          </span>
        </button>

        <div {...stylex.props(styles.divider)} />

        <div {...stylex.props(styles.footer)}>
          {stats.words} {stats.words === 1 ? "word" : "words"} · {stats.chars}{" "}
          {stats.chars === 1 ? "char" : "chars"}
        </div>
      </PopoverContent>
    </Popover>
  );
}
