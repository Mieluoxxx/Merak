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
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
  Stack,
  toast,
} from "@merak/ui";
import { colors, font, radius, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { MailPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  extractAuthError,
  inviteOrganizationMember,
  type OrganizationMemberRole,
} from "../../lib/auth-client.js";

export interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: string;
  organizationName?: string;
  onInvited?: (email: string, role: OrganizationMemberRole) => void;
}

const styles = stylex.create({
  content: {
    width: "100%",
    maxWidth: "440px",
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
  actions: {
    marginTop: space.sm,
  },
});

export function InviteMemberDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  onInvited,
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationMemberRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Enter a valid teammate email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      await inviteOrganizationMember({
        email: trimmedEmail,
        role,
        organizationId,
      });
      toast.success(`Invitation sent to ${trimmedEmail}`);
      onInvited?.(trimmedEmail, role);
      setEmail("");
      setRole("member");
      onOpenChange(false);
    } catch (err) {
      setError(extractAuthError(err, "Failed to invite team member"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => handleOpenChange(nextOpen)}>
      <DialogBackdrop />
      <DialogContent {...stylex.props(styles.content)}>
        <DialogTitle>
          <Inline gap="xs">
            <MailPlus size={18} />
            <span>Invite Teammate</span>
          </Inline>
        </DialogTitle>
        <DialogDescription>
          {organizationName
            ? `Invite a collaborator to join "${organizationName}".`
            : "Invite a collaborator to your active team workspace."}
        </DialogDescription>

        <form onSubmit={handleSubmit} {...stylex.props(styles.form)} noValidate>
          <Stack gap="md">
            <Field name="invite-email">
              <FieldLabel>Email Address</FieldLabel>
              <Input
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onValueChange={(val) => setEmail(val)}
                required
              />
            </Field>

            <Field name="invite-role">
              <FieldLabel>Role</FieldLabel>
              <SegmentedControl<OrganizationMemberRole>
                value={role}
                onValueChange={(next) => {
                  if (next === "member" || next === "admin" || next === "owner") {
                    setRole(next);
                  }
                }}
              >
                <SegmentedControlIndicator />
                <SegmentedControlItem value="member">Member</SegmentedControlItem>
                <SegmentedControlItem value="admin">Admin</SegmentedControlItem>
                <SegmentedControlItem value="owner">Owner</SegmentedControlItem>
              </SegmentedControl>
              <FieldDescription>
                Admins and owners can manage team invitations and workspace settings.
              </FieldDescription>
            </Field>

            {error ? (
              <div role="alert" {...stylex.props(styles.errorBanner)}>
                {error}
              </div>
            ) : null}

            <Inline justify="end" gap="sm" xstyle={styles.actions}>
              <DialogClose disabled={isSubmitting}>Cancel</DialogClose>
              <Button type="submit" data-variant="solid" disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send Invitation"}
              </Button>
            </Inline>
          </Stack>
        </form>
      </DialogContent>
    </Dialog>
  );
}
