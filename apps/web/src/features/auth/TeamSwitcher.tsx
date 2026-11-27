import {
  Button,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Inline,
  Input,
  Menu,
  MenuContent,
  MenuGroupLabel,
  MenuItem,
  MenuItemIcon,
  MenuSeparator,
  MenuTrigger,
  Stack,
  toast,
} from "@merak/ui";
import { colors, font, radius, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, LogOut, Plus, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  createOrganization,
  extractAuthError,
  setActiveOrganization,
  signOut,
  slugifyOrganizationName,
  useActiveOrganization,
  useListOrganizations,
  useSession,
} from "../../lib/auth-client.js";
import { InviteMemberDialog } from "./InviteMemberDialog.js";

export interface TeamSwitcherProps {
  onOrganizationChanged?: (organizationId: string) => void;
  onSignedOut?: () => void;
}

const styles = stylex.create({
  trigger: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgElevated,
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: 500,
    cursor: "pointer",
  },
  orgIdentity: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    minWidth: 0,
    overflow: "hidden",
  },
  orgAvatar: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    borderRadius: radius.sm,
    backgroundColor: colors.accentSubtle,
    color: colors.accent,
    fontSize: font.sizeXs,
    fontWeight: 600,
    flexShrink: 0,
  },
  orgNameWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    minWidth: 0,
  },
  orgName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "150px",
    lineHeight: 1.25,
  },
  userEmail: {
    fontSize: "11px",
    color: colors.textSubtle,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "150px",
  },
  menuContent: {
    minWidth: "236px",
  },
  itemRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: space.sm,
  },
  dialogContent: {
    width: "100%",
    maxWidth: "420px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    marginTop: space.md,
  },
  errorBanner: {
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    border: `1px solid ${colors.danger}`,
    color: colors.danger,
    fontSize: font.sizeSm,
  },
});

export function TeamSwitcher({ onOrganizationChanged, onSignedOut }: TeamSwitcherProps) {
  const queryClient = useQueryClient();
  const session = useSession();
  const activeOrg = useActiveOrganization();
  const orgsQuery = useListOrganizations();

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamSlug, setTeamSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const organizations = orgsQuery.data ?? [];
  const currentOrg = activeOrg.data ?? organizations[0] ?? null;
  const displayName = currentOrg?.name ?? "Personal Workspace";
  const initials = displayName.trim().slice(0, 2).toUpperCase() || "MK";

  const handleSwitchOrganization = async (orgId: string) => {
    if (orgId === currentOrg?.id) return;
    try {
      await setActiveOrganization(orgId);
      await queryClient.invalidateQueries();
      onOrganizationChanged?.(orgId);
      const target = organizations.find((item) => item.id === orgId);
      toast.success(`Switched to ${target?.name ?? "team"}`);
    } catch (err) {
      toast.error(extractAuthError(err, "Could not switch team"));
    }
  };

  const handleCreateOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);

    const trimmedName = teamName.trim();
    const resolvedSlug = (slugTouched ? teamSlug : slugifyOrganizationName(trimmedName)).trim();
    if (!trimmedName) {
      setCreateError("Team name is required.");
      return;
    }
    if (!resolvedSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resolvedSlug)) {
      setCreateError("Slug must use lowercase letters, numbers, and hyphens.");
      return;
    }

    setIsCreating(true);
    try {
      const created = await createOrganization({
        name: trimmedName,
        slug: resolvedSlug,
      });
      if (created?.id) {
        await setActiveOrganization(created.id);
        await queryClient.invalidateQueries();
        onOrganizationChanged?.(created.id);
      }
      toast.success(`Created team "${trimmedName}"`);
      setTeamName("");
      setTeamSlug("");
      setSlugTouched(false);
      setCreateOpen(false);
    } catch (err) {
      setCreateError(extractAuthError(err, "Failed to create team"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      queryClient.clear();
      onSignedOut?.();
    } catch (err) {
      toast.error(extractAuthError(err, "Failed to sign out"));
    }
  };

  return (
    <>
      <Menu>
        <MenuTrigger aria-label="Switch workspace team" {...stylex.props(styles.trigger)}>
          <span {...stylex.props(styles.orgIdentity)}>
            <span {...stylex.props(styles.orgAvatar)}>{initials}</span>
            <span {...stylex.props(styles.orgNameWrap)}>
              <span {...stylex.props(styles.orgName)}>{displayName}</span>
              {session.data?.user?.email ? (
                <span {...stylex.props(styles.userEmail)}>{session.data.user.email}</span>
              ) : null}
            </span>
          </span>
          <ChevronsUpDown size={14} />
        </MenuTrigger>

        <MenuContent align="start" sideOffset={6} {...stylex.props(styles.menuContent)}>
          <MenuGroupLabel>Teams</MenuGroupLabel>
          {organizations.length > 0 ? (
            organizations.map((org) => {
              const isActive = org.id === currentOrg?.id;
              return (
                <MenuItem
                  key={org.id}
                  value={`org:${org.id}`}
                  onSelect={() => {
                    void handleSwitchOrganization(org.id);
                  }}
                >
                  <MenuItemIcon>
                    <Building2 size={14} />
                  </MenuItemIcon>
                  <span {...stylex.props(styles.itemRow)}>
                    <span>{org.name}</span>
                    {isActive ? <Check size={14} /> : null}
                  </span>
                </MenuItem>
              );
            })
          ) : (
            <MenuItem value="org:empty" disabled>
              No teams loaded
            </MenuItem>
          )}

          <MenuSeparator />

          <MenuItem
            value="action:create-team"
            onSelect={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            <MenuItemIcon>
              <Plus size={14} />
            </MenuItemIcon>
            <span>Create Team</span>
          </MenuItem>

          <MenuItem
            value="action:invite-member"
            disabled={!currentOrg}
            onSelect={() => setInviteOpen(true)}
          >
            <MenuItemIcon>
              <UserPlus size={14} />
            </MenuItemIcon>
            <span>Invite Teammates</span>
          </MenuItem>

          {session.data?.user ? (
            <>
              <MenuSeparator />
              <MenuItem
                value="action:sign-out"
                destructive
                onSelect={() => {
                  void handleSignOut();
                }}
              >
                <MenuItemIcon>
                  <LogOut size={14} />
                </MenuItemIcon>
                <span>Sign Out</span>
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>

      <Dialog open={createOpen} onOpenChange={(nextOpen) => setCreateOpen(nextOpen)}>
        <DialogBackdrop />
        <DialogContent {...stylex.props(styles.dialogContent)}>
          <DialogTitle>Create Team</DialogTitle>
          <DialogDescription>
            Create a shared team workspace for collaborative spaces, documents, and MCP agents.
          </DialogDescription>

          <form onSubmit={handleCreateOrganization} {...stylex.props(styles.form)} noValidate>
            <Stack gap="md">
              <Field name="team-name">
                <FieldLabel>Team Name</FieldLabel>
                <Input
                  placeholder="Platform Engineering"
                  value={teamName}
                  onValueChange={(val) => {
                    setTeamName(val);
                    if (!slugTouched) {
                      setTeamSlug(slugifyOrganizationName(val));
                    }
                  }}
                  required
                />
              </Field>

              <Field name="team-slug">
                <FieldLabel>URL Slug</FieldLabel>
                <Input
                  placeholder="platform-engineering"
                  value={teamSlug}
                  onValueChange={(val) => {
                    setSlugTouched(true);
                    setTeamSlug(val);
                  }}
                  required
                />
                <FieldDescription>
                  Lowercase letters, numbers, and hyphens only.
                </FieldDescription>
              </Field>

              {createError ? (
                <div role="alert" {...stylex.props(styles.errorBanner)}>
                  {createError}
                </div>
              ) : null}

              <Inline justify="end" gap="sm">
                <DialogClose disabled={isCreating}>Cancel</DialogClose>
                <Button type="submit" data-variant="solid" disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create Team"}
                </Button>
              </Inline>
            </Stack>
          </form>
        </DialogContent>
      </Dialog>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={currentOrg?.id}
        organizationName={currentOrg?.name}
      />
    </>
  );
}
