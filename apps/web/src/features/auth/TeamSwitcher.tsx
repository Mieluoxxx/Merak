import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIcon,
  MenuSeparator,
  MenuTrigger,
  toast,
} from "@merak/ui";
import { colors, font, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, LogOut, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  extractAuthError,
  setActiveOrganization,
  signOut,
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
    height: "auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    paddingBlock: "6px",
    paddingInline: "8px",
    borderRadius: "7px",
    borderWidth: 0,
    borderStyle: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: 500,
    cursor: "pointer",
    transition: "background-color 150ms ease",
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
    width: "28px",
    height: "28px",
    borderRadius: "7px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.accentSubtle,
    backgroundColor: colors.accentSubtle,
    color: colors.accent,
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.02em",
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
    maxWidth: "156px",
    fontSize: font.sizeSm,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    lineHeight: 1.3,
    color: colors.text,
  },
  userEmail: {
    fontSize: "11px",
    color: colors.textSubtle,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "156px",
    lineHeight: 1.3,
  },
  triggerChevron: {
    color: colors.textSubtle,
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
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
});

export function TeamSwitcher({ onOrganizationChanged, onSignedOut }: TeamSwitcherProps) {
  const queryClient = useQueryClient();
  const session = useSession();
  const activeOrg = useActiveOrganization();
  const orgsQuery = useListOrganizations();

  const [inviteOpen, setInviteOpen] = useState(false);

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
      toast.success(`Switched to ${target?.name ?? "workspace"}`);
    } catch (err) {
      toast.error(extractAuthError(err, "Could not switch workspace"));
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
        <MenuTrigger aria-label="Workspace menu" {...stylex.props(styles.trigger)}>
          <span {...stylex.props(styles.orgIdentity)}>
            <span {...stylex.props(styles.orgAvatar)}>{initials}</span>
            <span {...stylex.props(styles.orgNameWrap)}>
              <span {...stylex.props(styles.orgName)}>{displayName}</span>
              {session.data?.user?.email ? (
                <span {...stylex.props(styles.userEmail)}>{session.data.user.email}</span>
              ) : null}
            </span>
          </span>
          <span {...stylex.props(styles.triggerChevron)}>
            <ChevronsUpDown size={14} />
          </span>
        </MenuTrigger>

        <MenuContent align="start" sideOffset={6} {...stylex.props(styles.menuContent)}>
          {organizations.length > 1 ? (
            <>
              <MenuGroup>
                <MenuGroupLabel>Workspaces</MenuGroupLabel>
                {organizations.map((org) => {
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
                })}
              </MenuGroup>

              <MenuSeparator />
            </>
          ) : null}

          <MenuItem
            value="action:invite-member"
            disabled={!currentOrg}
            onSelect={() => setInviteOpen(true)}
          >
            <MenuItemIcon>
              <UserPlus size={14} />
            </MenuItemIcon>
            <span>Invite Collaborators</span>
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

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={currentOrg?.id}
        organizationName={currentOrg?.name}
      />
    </>
  );
}
