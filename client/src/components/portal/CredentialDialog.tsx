/**
 * CredentialDialog — Dark glass dialog for credential collection.
 * Collects CMS credentials + optional Reddit account credentials.
 * Uses the useCredentialDialog hook for all state/mutations.
 */
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";

interface CredentialDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  canSave: boolean;
  isSaving: boolean;
  credentialType: "website_cms" | "google_account" | "domain_registrar";
  setCredentialType: (v: "website_cms" | "google_account" | "domain_registrar") => void;
  serviceName: string;
  setServiceName: (v: string) => void;
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  hasExistingCredentials: boolean;
  /** Client's email address for Reddit prompt */
  clientEmail?: string;
  /** Whether this is a Dominator package (show Reddit section) */
  isDominator?: boolean;
  // Reddit credential props
  hasRedditAccount?: "yes" | "no" | null;
  setHasRedditAccount?: (v: "yes" | "no" | null) => void;
  redditUsername?: string;
  setRedditUsername?: (v: string) => void;
  redditPassword?: string;
  setRedditPassword?: (v: string) => void;
  showRedditPassword?: boolean;
  setShowRedditPassword?: (v: boolean) => void;
}

export function CredentialDialog({
  open,
  onClose,
  onSave,
  canSave,
  isSaving,
  credentialType,
  setCredentialType,
  serviceName,
  setServiceName,
  username,
  setUsername,
  password,
  setPassword,
  notes,
  setNotes,
  showPassword,
  setShowPassword,
  hasExistingCredentials,
  clientEmail,
  isDominator,
  hasRedditAccount,
  setHasRedditAccount,
  redditUsername,
  setRedditUsername,
  redditPassword,
  setRedditPassword,
  showRedditPassword,
  setShowRedditPassword,
}: CredentialDialogProps) {
  const showRedditSection = isDominator && setHasRedditAccount;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18 }}>
        {hasExistingCredentials ? "Update Your Credentials" : "Provide Website Access"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 2 }}>
          <Alert severity={hasExistingCredentials ? "warning" : "info"}>
            <Typography variant="body2">
              {hasExistingCredentials
                ? "You're updating your saved credentials. This will replace the previous login we have on file. Your credentials are encrypted and stored securely."
                : "Your credentials are encrypted and stored securely. We'll only use them to optimize your website for AI visibility."}
            </Typography>
          </Alert>

          <FormControl fullWidth>
            <InputLabel>Platform Type</InputLabel>
            <Select
              value={credentialType}
              label="Platform Type"
              onChange={(e) => setCredentialType(e.target.value as any)}
            >
              <MenuItem value="website_cms">Website CMS (WordPress, Wix, Shopify, Squarespace, etc.)</MenuItem>
              <MenuItem value="google_account">Google Account</MenuItem>
              <MenuItem value="domain_registrar">Domain Registrar</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Service Name"
            placeholder="e.g., WordPress, Wix, Squarespace"
            fullWidth
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
          />

          <TextField
            label="Username / Email"
            placeholder="admin@yourbusiness.com"
            fullWidth
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            placeholder="Your password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            InputProps={{
              endAdornment: (
                <Box
                  component="button"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  sx={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px",
                    display: "flex",
                    alignItems: "center",
                    color: "text.secondary",
                    "&:hover": { color: "text.primary" },
                  }}
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </Box>
              ),
            }}
          />

          <TextField
            label="Additional Info (Optional)"
            placeholder="2FA codes, admin URL, etc."
            multiline
            rows={3}
            fullWidth
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {/* ── Reddit Credentials Section (Dominator only) ── */}
          {showRedditSection && (
            <>
              <Divider sx={{ my: 1 }} />

              <Box sx={{
                p: 2,
                borderRadius: "12px",
                bgcolor: "rgba(255, 69, 0, 0.04)",
                border: "1px solid rgba(255, 69, 0, 0.15)",
              }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary", mb: 0.5 }}>
                  Reddit Account
                </Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 2, lineHeight: 1.6 }}>
                  We'll post helpful content in Reddit communities to boost your AI visibility.
                  {clientEmail && (
                    <> Do you have a Reddit account associated with <strong>{clientEmail}</strong>?</>
                  )}
                  {!clientEmail && <> Do you already have a Reddit account?</>}
                </Typography>

                <ToggleButtonGroup
                  value={hasRedditAccount}
                  exclusive
                  onChange={(_, val) => { if (val !== null) setHasRedditAccount(val); }}
                  size="small"
                  sx={{ mb: hasRedditAccount === "yes" ? 2 : 0 }}
                >
                  <ToggleButton
                    value="yes"
                    sx={{
                      fontSize: 12, px: 2.5, py: 1,
                      "&.Mui-selected": { bgcolor: "rgba(255,69,0,0.12)", color: "#FF4500" },
                    }}
                  >
                    Yes, I have one
                  </ToggleButton>
                  <ToggleButton
                    value="no"
                    sx={{
                      fontSize: 12, px: 2.5, py: 1,
                      "&.Mui-selected": { bgcolor: "rgba(52,211,153,0.12)", color: "#34D399" },
                    }}
                  >
                    No, create one for me
                  </ToggleButton>
                </ToggleButtonGroup>

                {hasRedditAccount === "yes" && setRedditUsername && setRedditPassword && setShowRedditPassword && (
                  <Stack spacing={2}>
                    <TextField
                      label="Reddit Username"
                      placeholder="your_username (without u/)"
                      fullWidth
                      size="small"
                      value={redditUsername}
                      onChange={(e) => setRedditUsername(e.target.value)}
                    />
                    <TextField
                      label="Reddit Password"
                      type={showRedditPassword ? "text" : "password"}
                      placeholder="Your Reddit password"
                      fullWidth
                      size="small"
                      value={redditPassword}
                      onChange={(e) => setRedditPassword(e.target.value)}
                      InputProps={{
                        endAdornment: (
                          <Box
                            component="button"
                            type="button"
                            onClick={() => setShowRedditPassword(!showRedditPassword)}
                            sx={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: "8px",
                              display: "flex",
                              alignItems: "center",
                              color: "text.secondary",
                              "&:hover": { color: "text.primary" },
                            }}
                          >
                            {showRedditPassword ? <VisibilityOff /> : <Visibility />}
                          </Box>
                        ),
                      }}
                    />
                  </Stack>
                )}

                {hasRedditAccount === "no" && (
                  <Alert severity="success" sx={{ mt: 1 }}>
                    <Typography variant="body2" sx={{ fontSize: 12 }}>
                      We'll create a Reddit account for you. You'll get a verification email
                      {clientEmail ? ` at ${clientEmail}` : ""} — just click the link to confirm.
                    </Typography>
                  </Alert>
                )}
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={!canSave || isSaving}
          sx={{
            background: "linear-gradient(135deg, #D97B6A, #E8A99A)",
            "&:hover": { background: "linear-gradient(135deg, #C4695A, #D97B6A)" },
          }}
        >
          {isSaving ? "Saving..." : "Save Securely"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
