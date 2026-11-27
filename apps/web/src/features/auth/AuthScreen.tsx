import {
  Button,
  Card,
  Field,
  FieldError,
  FieldLabel,
  Inline,
  Input,
  Stack,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@merak/ui";
import { colors, font, radius, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  extractAuthError,
  signInWithEmail,
  signUpWithEmail,
} from "../../lib/auth-client.js";

export type AuthMode = "sign-in" | "sign-up";

export interface AuthScreenProps {
  defaultMode?: AuthMode;
  onAuthenticated?: () => void | Promise<void>;
}

const styles = stylex.create({
  page: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: space.xl,
    backgroundColor: colors.bgSubtle,
    color: colors.text,
    fontFamily: font.sans,
  },
  container: {
    width: "100%",
    maxWidth: "420px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: space.xs,
    marginBottom: space.xl,
  },
  brandBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "40px",
    height: "40px",
    borderRadius: radius.lg,
    backgroundColor: colors.accentSubtle,
    color: colors.accent,
    marginBottom: space.xs,
  },
  title: {
    margin: 0,
    fontSize: font.sizeXl,
    fontWeight: 600,
    letterSpacing: "-0.02em",
  },
  subtitle: {
    margin: 0,
    fontSize: font.sizeSm,
    color: colors.textMuted,
  },
  tabsRoot: {
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
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
  submitButton: {
    width: "100%",
    justifyContent: "center",
  },
  footerNote: {
    margin: 0,
    fontSize: font.sizeXs,
    color: colors.textSubtle,
    textAlign: "center",
  },
});

export function AuthScreen({ defaultMode = "sign-in", onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    if (mode === "sign-up" && !name.trim()) {
      setError("Display name is required to create an account.");
      return;
    }

    if (mode === "sign-up" && password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "sign-in") {
        await signInWithEmail({ email: trimmedEmail, password });
      } else {
        await signUpWithEmail({ name: name.trim(), email: trimmedEmail, password });
      }
      await onAuthenticated?.();
    } catch (err) {
      setError(extractAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div data-slot="merak-auth-screen" {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.container)}>
        <div {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.brandBadge)}>
            <Sparkles size={20} />
          </div>
          <h1 {...stylex.props(styles.title)}>Merak Workspace</h1>
          <p {...stylex.props(styles.subtitle)}>
            Human-agent collaborative knowledge base, whiteboards, and artifacts.
          </p>
        </div>

        <Card padding="lg" variant="elevated">
          <Tabs
            value={mode}
            onValueChange={(next) => {
              if (next === "sign-in" || next === "sign-up") {
                setMode(next);
                setError(null);
              }
            }}
            {...stylex.props(styles.tabsRoot)}
          >
            <TabsList>
              <TabsTab value="sign-in">Sign In</TabsTab>
              <TabsTab value="sign-up">Create Account</TabsTab>
            </TabsList>

            <TabsPanel value="sign-in">
              <form onSubmit={handleSubmit} {...stylex.props(styles.form)} noValidate>
                <Stack gap="md">
                  <Field name="email">
                    <FieldLabel>Email</FieldLabel>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={email}
                      onValueChange={(val) => setEmail(val)}
                      required
                    />
                    <FieldError />
                  </Field>

                  <Field name="password">
                    <FieldLabel>Password</FieldLabel>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onValueChange={(val) => setPassword(val)}
                      required
                    />
                    <FieldError />
                  </Field>

                  {error ? (
                    <div role="alert" {...stylex.props(styles.errorBanner)}>
                      {error}
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    data-variant="solid"
                    disabled={isSubmitting}
                    {...stylex.props(styles.submitButton)}
                  >
                    {isSubmitting ? "Signing in..." : "Sign In"}
                  </Button>
                </Stack>
              </form>
            </TabsPanel>

            <TabsPanel value="sign-up">
              <form onSubmit={handleSubmit} {...stylex.props(styles.form)} noValidate>
                <Stack gap="md">
                  <Field name="name">
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      type="text"
                      autoComplete="name"
                      placeholder="Ada Lovelace"
                      value={name}
                      onValueChange={(val) => setName(val)}
                      required
                    />
                    <FieldError />
                  </Field>

                  <Field name="email">
                    <FieldLabel>Email</FieldLabel>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="ada@merak.dev"
                      value={email}
                      onValueChange={(val) => setEmail(val)}
                      required
                    />
                    <FieldError />
                  </Field>

                  <Field name="password">
                    <FieldLabel>Password</FieldLabel>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={password}
                      onValueChange={(val) => setPassword(val)}
                      required
                    />
                    <FieldError />
                  </Field>

                  {error ? (
                    <div role="alert" {...stylex.props(styles.errorBanner)}>
                      {error}
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    data-variant="solid"
                    disabled={isSubmitting}
                    {...stylex.props(styles.submitButton)}
                  >
                    {isSubmitting ? "Creating account..." : "Create Account"}
                  </Button>

                  <Inline justify="center">
                    <p {...stylex.props(styles.footerNote)}>
                      A personal workspace and default Knowledge Base are created automatically.
                    </p>
                  </Inline>
                </Stack>
              </form>
            </TabsPanel>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
