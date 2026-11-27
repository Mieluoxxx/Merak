import {
  type McpPermission,
  type McpTokenDto,
  type SpaceDto,
} from "@merak/shared";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  Field,
  FieldDescription,
  FieldLabel,
  Inline,
  Input,
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
  Stack,
  toast,
} from "@merak/ui";
import { colors, font, radius, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  createMcpToken,
  fetchMcpTokens,
  fetchSpaces,
  revokeMcpToken,
  workspaceQueryKeys,
} from "../api/workspace-api.js";

export interface McpTokensPanelProps {
  spaces?: SpaceDto[];
}

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: space.xl,
    maxWidth: "880px",
    width: "100%",
    marginInline: "auto",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
    flexWrap: "wrap",
    paddingBottom: space.lg,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: colors.borderSubtle,
  },
  headerText: {
    flex: "1 1 320px",
    minWidth: 0,
  },
  title: {
    margin: 0,
    fontSize: font.sizeXl,
    fontWeight: 600,
    letterSpacing: "-0.02em",
  },
  subtitle: {
    margin: 0,
    marginTop: space.xs,
    fontSize: font.sizeSm,
    lineHeight: 1.55,
    color: colors.textMuted,
  },
  inlineCode: {
    fontFamily: font.mono,
    fontSize: font.sizeXs,
    paddingBlock: "1px",
    paddingInline: "5px",
    borderRadius: radius.sm,
    backgroundColor: colors.bgHover,
    color: colors.text,
  },
  primaryAction: {
    height: "34px",
    paddingInline: "14px",
    fontSize: font.sizeSm,
    borderRadius: radius.md,
    flexShrink: 0,
  },
  revealCard: {
    borderColor: colors.warning,
    backgroundColor: "rgba(217, 119, 6, 0.08)",
  },
  revealWarning: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    color: colors.warning,
    fontSize: font.sizeSm,
    fontWeight: 600,
  },
  tokenCodeBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.bg,
    fontFamily: font.mono,
    fontSize: font.sizeSm,
    wordBreak: "break-all",
  },
  tokenList: {
    display: "flex",
    flexDirection: "column",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: colors.borderSubtle,
  },
  tokenRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    flexWrap: "wrap",
    paddingBlock: space.md,
    paddingInline: space.sm,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: colors.borderSubtle,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgSubtle,
    },
    transition: "background-color 140ms ease",
  },
  tokenRowRevoked: {
    opacity: 0.65,
  },
  tokenMeta: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    minWidth: 0,
    flex: "1 1 280px",
  },
  tokenName: {
    fontSize: font.sizeMd,
    fontWeight: 600,
    color: colors.text,
  },
  tokenPrefix: {
    fontFamily: font.mono,
    fontSize: font.sizeXs,
    color: colors.textMuted,
  },
  tokenDates: {
    fontSize: font.sizeXs,
    color: colors.textSubtle,
  },
  dialogContent: {
    width: "100%",
    maxWidth: "480px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    marginTop: space.md,
  },
  dialogFooter: {
    marginTop: "4px",
    paddingTop: "14px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: colors.borderSubtle,
    gap: "10px",
  },
  spacePicker: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    maxHeight: "180px",
    overflowY: "auto",
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
  },
  spaceOption: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    fontSize: font.sizeSm,
    color: colors.text,
    cursor: "pointer",
  },
  errorBanner: {
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.danger,
    color: colors.danger,
    fontSize: font.sizeSm,
  },
});

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function McpTokensPanel({ spaces: providedSpaces }: McpTokensPanelProps) {
  const queryClient = useQueryClient();

  const tokensQuery = useQuery({
    queryKey: workspaceQueryKeys.mcpTokens(),
    queryFn: fetchMcpTokens,
  });

  const spacesQuery = useQuery({
    queryKey: workspaceQueryKeys.spaces(),
    queryFn: () => fetchSpaces(),
    enabled: providedSpaces === undefined,
  });

  const spaces = providedSpaces ?? spacesQuery.data ?? [];
  const spaceNameMap = useMemo(
    () => new Map(spaces.map((item) => [item.id, item.name])),
    [spaces],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<McpPermission>("read");
  const [scopeMode, setScopeMode] = useState<"all" | "selected">("all");
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const [revealedToken, setRevealedToken] = useState<{
    name: string;
    rawToken: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<McpTokenDto | null>(null);

  const createMutation = useMutation({
    mutationFn: createMcpToken,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.mcpTokens() });
      setRevealedToken({ name: created.token.name, rawToken: created.rawToken });
      setCopied(false);
      setName("");
      setPermission("read");
      setScopeMode("all");
      setSelectedSpaceIds([]);
      setFormError(null);
      setCreateOpen(false);
      toast.success(`MCP token "${created.token.name}" created`);
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to create token");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeMcpToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.mcpTokens() });
      toast.success("MCP token revoked");
      setRevokeTarget(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to revoke token");
    },
  });

  const toggleSpaceSelection = (spaceId: string) => {
    setSelectedSpaceIds((prev) =>
      prev.includes(spaceId) ? prev.filter((id) => id !== spaceId) : [...prev, spaceId],
    );
  };

  const handleCreateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("Token name is required.");
      return;
    }

    if (scopeMode === "selected" && selectedSpaceIds.length === 0) {
      setFormError("Select at least one space or choose All Spaces.");
      return;
    }

    createMutation.mutate({
      name: trimmedName,
      scopes: {
        spaceIds: scopeMode === "all" ? "*" : selectedSpaceIds,
        permission,
      },
    });
  };

  const handleCopyToken = async () => {
    if (!revealedToken) return;
    try {
      await navigator.clipboard.writeText(revealedToken.rawToken);
      setCopied(true);
      toast.success("Token copied to clipboard");
    } catch {
      toast.error("Unable to access clipboard — copy the token manually");
    }
  };

  const tokens = tokensQuery.data ?? [];

  return (
    <section data-slot="merak-mcp-tokens" {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headerText)}>
          <h1 {...stylex.props(styles.title)}>MCP Agent Tokens</h1>
          <p {...stylex.props(styles.subtitle)}>
            Issue scoped Bearer tokens (<code {...stylex.props(styles.inlineCode)}>mrk_…</code>)
            so remote AI agents can read or edit selected spaces over Streamable HTTP MCP.
          </p>
        </div>

        <Button
          data-variant="solid"
          {...stylex.props(styles.primaryAction)}
          onClick={() => {
            setFormError(null);
            setCreateOpen(true);
          }}
        >
          <Plus size={15} />
          <span>New MCP Token</span>
        </Button>
      </div>

      {revealedToken ? (
        <Card padding="md" xstyle={styles.revealCard}>
          <Stack gap="sm">
            <div {...stylex.props(styles.revealWarning)}>
              <AlertTriangle size={16} />
              <span>
                Copy "{revealedToken.name}" now — this raw token will only be shown once!
              </span>
            </div>
            <div data-agent-secret="" {...stylex.props(styles.tokenCodeBox)}>
              <span>{revealedToken.rawToken}</span>
              <Inline gap="xs">
                <Button onClick={() => void handleCopyToken()}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </Button>
                <Button onClick={() => setRevealedToken(null)}>Dismiss</Button>
              </Inline>
            </div>
          </Stack>
        </Card>
      ) : null}

      {tokensQuery.isLoading ? (
        <Card padding="md" variant="subtle">
          Loading MCP tokens...
        </Card>
      ) : tokensQuery.isError ? (
        <Card padding="md" variant="subtle">
          <Inline gap="sm">
            <ShieldAlert size={16} />
            <span>
              {tokensQuery.error instanceof Error
                ? tokensQuery.error.message
                : "Failed to load MCP tokens."}
            </span>
          </Inline>
        </Card>
      ) : tokens.length === 0 ? (
        <EmptyState
          icon={<KeyRound size={22} />}
          title="No MCP tokens yet"
          description="Create a scoped token to connect Claude, Cursor, or custom agents to your Merak spaces."
          action={
            <Button
              data-variant="solid"
              {...stylex.props(styles.primaryAction)}
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={14} />
              <span>Create First Token</span>
            </Button>
          }
        />
      ) : (
        <div {...stylex.props(styles.tokenList)}>
          {tokens.map((token) => {
            const isRevoked = Boolean(token.revokedAt);
            const scopeLabel =
              token.scopes.spaceIds === "*"
                ? "All Spaces (*)"
                : token.scopes.spaceIds
                    .map((id) => spaceNameMap.get(id) ?? id)
                    .join(", ");

            return (
              <div
                key={token.id}
                {...stylex.props(styles.tokenRow, isRevoked && styles.tokenRowRevoked)}
              >
                <div {...stylex.props(styles.tokenMeta)}>
                  <Inline gap="sm" wrap>
                    <span {...stylex.props(styles.tokenName)}>{token.name}</span>
                    <span {...stylex.props(styles.tokenPrefix)}>{token.prefix}…</span>
                    <Badge tone={token.scopes.permission === "write" ? "warning" : "accent"}>
                      {token.scopes.permission}
                    </Badge>
                    <Badge tone="neutral">{scopeLabel}</Badge>
                    {isRevoked ? <Badge tone="danger">Revoked</Badge> : null}
                  </Inline>
                  <div {...stylex.props(styles.tokenDates)}>
                    Created: {formatTimestamp(token.createdAt)} · Last used:{" "}
                    {formatTimestamp(token.lastUsedAt)}
                    {token.revokedAt ? ` · Revoked: ${formatTimestamp(token.revokedAt)}` : ""}
                  </div>
                </div>

                {!isRevoked ? (
                  <Button
                    data-variant="destructive"
                    onClick={() => setRevokeTarget(token)}
                  >
                    <Trash2 size={14} />
                    <span>Revoke</span>
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={(nextOpen) => setCreateOpen(nextOpen)}>
        <DialogBackdrop />
        <DialogContent {...stylex.props(styles.dialogContent)}>
          <DialogTitle>Create MCP Token</DialogTitle>
          <DialogDescription>
            Choose a name, permission level, and space scope for this agent credential.
          </DialogDescription>

          <form onSubmit={handleCreateSubmit} {...stylex.props(styles.form)} noValidate>
            <Stack gap="md">
              <Field name="token-name">
                <FieldLabel>Token Name</FieldLabel>
                <Input
                  placeholder="Claude Code — Architecture Docs"
                  value={name}
                  onValueChange={(val) => setName(val)}
                  required
                />
              </Field>

              <Field name="token-permission">
                <FieldLabel>Permission</FieldLabel>
                <SegmentedControl<McpPermission>
                  value={permission}
                  onValueChange={(next) => {
                    if (next === "read" || next === "write") {
                      setPermission(next);
                    }
                  }}
                >
                  <SegmentedControlIndicator />
                  <SegmentedControlItem value="read">Read Only</SegmentedControlItem>
                  <SegmentedControlItem value="write">Read &amp; Write</SegmentedControlItem>
                </SegmentedControl>
                <FieldDescription>
                  Read tokens can browse and search; write tokens can create and edit assets.
                </FieldDescription>
              </Field>

              <Field name="token-scope">
                <FieldLabel>Space Scope</FieldLabel>
                <SegmentedControl<"all" | "selected">
                  value={scopeMode}
                  onValueChange={(next) => {
                    if (next === "all" || next === "selected") {
                      setScopeMode(next);
                    }
                  }}
                >
                  <SegmentedControlIndicator />
                  <SegmentedControlItem value="all">All Spaces (*)</SegmentedControlItem>
                  <SegmentedControlItem value="selected">Selected Spaces</SegmentedControlItem>
                </SegmentedControl>
              </Field>

              {scopeMode === "selected" ? (
                <div {...stylex.props(styles.spacePicker)}>
                  {spaces.length === 0 ? (
                    <span {...stylex.props(styles.tokenDates)}>
                      No projects available yet. Create a project first or select All Projects.
                    </span>
                  ) : (
                    spaces.map((item) => {
                      const checked = selectedSpaceIds.includes(item.id);
                      return (
                        <label key={item.id} {...stylex.props(styles.spaceOption)}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSpaceSelection(item.id)}
                          />
                          <span>{item.name}</span>
                          <Badge tone="neutral">
                            {item.visibility === "shared" ? "Shared" : "Private"}
                          </Badge>
                        </label>
                      );
                    })
                  )}
                </div>
              ) : null}

              {formError ? (
                <div role="alert" {...stylex.props(styles.errorBanner)}>
                  {formError}
                </div>
              ) : null}

              <Inline justify="end" gap="sm" xstyle={styles.dialogFooter}>
                <DialogClose disabled={createMutation.isPending}>Cancel</DialogClose>
                <Button
                  type="submit"
                  data-variant="solid"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Generating..." : "Generate Token"}
                </Button>
              </Inline>
            </Stack>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRevokeTarget(null);
        }}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogTitle>Revoke MCP Token?</AlertDialogTitle>
          <AlertDialogDescription>
            {revokeTarget
              ? `Any agent using "${revokeTarget.name}" (${revokeTarget.prefix}…) will immediately lose access.`
              : "This token will immediately lose access."}
          </AlertDialogDescription>
          <Inline justify="end" gap="sm" xstyle={styles.dialogFooter}>
            <AlertDialogClose disabled={revokeMutation.isPending}>Cancel</AlertDialogClose>
            <Button
              data-variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => {
                if (revokeTarget) {
                  revokeMutation.mutate(revokeTarget.id);
                }
              }}
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke Token"}
            </Button>
          </Inline>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
