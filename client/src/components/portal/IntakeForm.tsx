/**
 * IntakeForm — Business profile form for the client portal.
 *
 * Used in two contexts:
 * 1. Intake banner (funnel buyers completing their profile before worker starts)
 * 2. "Edit" mode on the "Your Business" section (any client updating their info)
 *
 * Pre-populates with existing clientData. Validates 7 mandatory fields.
 * Includes "Auto-Fill from Website" scanner (same as GetStarted page).
 * Calls updateMyProfile tRPC mutation on submit.
 */

import { useState, useCallback, useEffect } from "react";
import confetti from "canvas-confetti";
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
  FormControlLabel,
} from "@mui/material";
import { AutoFixHigh, Save } from "@mui/icons-material";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { scrapeWebsite } from "@/lib/websiteScraper";

// ── Types ──────────────────────────────────────────────────────────────

interface IntakeFormProps {
  /** Existing client data to pre-populate fields */
  clientData: {
    businessName?: string | null;
    businessWebsite?: string | null;
    industry?: string | null;
    businessAddress?: string | null;
    targetLocation?: string | null;
    servicesOffered?: string | null;
    cmsType?: string | null;
    phone?: string | null;
    hasGoogleProfile?: boolean | null;
    googleProfileUrl?: string | null;
    competitors?: string | null;
    additionalGoals?: string | null;
  };
  /** Called after successful save — parent should refetch data */
  onSaved: () => void;
  /** Called when user cancels editing (only shown when isEdit=true) */
  onCancel?: () => void;
  /** True when used as edit mode (shows Cancel button) */
  isEdit?: boolean;
}

interface FormData {
  businessName: string;
  businessWebsite: string;
  industry: string;
  businessAddress: string;
  targetLocation: string;
  servicesOffered: string;
  cmsType: string;
  phone: string;
  hasGoogleProfile: boolean;
  googleProfileUrl: string;
  competitors: string;
  additionalGoals: string;
}

const CMS_OPTIONS = [
  "WordPress",
  "Wix",
  "Squarespace",
  "Shopify",
  "Webflow",
  "GoDaddy",
  "Custom / Other",
  "Don't Know",
];

const MANDATORY_KEYS: (keyof FormData)[] = [
  "businessName",
  "businessWebsite",
  "industry",
  "businessAddress",
  "targetLocation",
  "servicesOffered",
  "cmsType",
];

// ── Component ──────────────────────────────────────────────────────────

export function IntakeForm({ clientData, onSaved, onCancel, isEdit }: IntakeFormProps) {
  const [form, setForm] = useState<FormData>({
    businessName: clientData.businessName || "",
    businessWebsite: clientData.businessWebsite || "",
    industry: clientData.industry || "",
    businessAddress: clientData.businessAddress || "",
    targetLocation: clientData.targetLocation || "",
    servicesOffered: clientData.servicesOffered || "",
    cmsType: clientData.cmsType || "",
    phone: clientData.phone || "",
    hasGoogleProfile: clientData.hasGoogleProfile ?? false,
    googleProfileUrl: clientData.googleProfileUrl || "",
    competitors: clientData.competitors || "",
    additionalGoals: clientData.additionalGoals || "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [hasAutoFilled, setHasAutoFilled] = useState(false);

  const updateProfile = trpc.clientPortal.updateMyProfile.useMutation({
    onSuccess: () => {
      toast.success("Business profile saved! Your optimization journey begins.");
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      onSaved();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save profile");
    },
  });

  const handleChange = useCallback(
    (field: keyof FormData, value: string | boolean) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  // ── Auto-Fill from Website ─────────────────────────────────────────

  const handleAutoFill = useCallback(async () => {
    const url = form.businessWebsite.trim();
    if (!url) {
      toast.error("Please enter a website URL first");
      return;
    }

    setIsScanning(true);
    toast.info("Scanning your website...", { duration: 2000 });

    try {
      const scraped = await scrapeWebsite(url);

      // Only fill empty fields — don't overwrite user-entered data
      setForm((prev) => ({
        ...prev,
        businessName: prev.businessName || scraped.businessName || "",
        industry: prev.industry || scraped.industry || "",
        servicesOffered: prev.servicesOffered || scraped.servicesOffered || "",
        phone: prev.phone || scraped.businessPhone || "",
        businessAddress: prev.businessAddress || scraped.businessAddress || "",
      }));

      setHasAutoFilled(true);
      toast.success("Information extracted! Please review and complete any missing fields.", {
        duration: 4000,
      });
    } catch {
      toast.error("Couldn't auto-fill from website. Please enter information manually.");
    } finally {
      setIsScanning(false);
    }
  }, [form.businessWebsite]);

  // ── Validation ─────────────────────────────────────────────────────

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    for (const key of MANDATORY_KEYS) {
      const val = form[key];
      if (typeof val === "string" && !val.trim()) {
        newErrors[key] = "Required";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  // ── Submit ─────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    if (!validate()) {
      toast.error("Please fill in all required fields");
      return;
    }

    updateProfile.mutate({
      businessName: form.businessName.trim(),
      businessWebsite: form.businessWebsite.trim() || null,
      industry: form.industry.trim() || null,
      businessAddress: form.businessAddress.trim() || null,
      targetLocation: form.targetLocation.trim() || null,
      servicesOffered: form.servicesOffered.trim() || null,
      cmsType: form.cmsType || null,
      phone: form.phone.trim() || null,
      hasGoogleProfile: form.hasGoogleProfile,
      googleProfileUrl: form.googleProfileUrl.trim() || null,
      competitors: form.competitors.trim() || null,
      additionalGoals: form.additionalGoals.trim() || null,
    });
  }, [form, validate, updateProfile]);

  // ── Render ─────────────────────────────────────────────────────────

  const textFieldSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "10px",
      fontSize: 14,
    },
    "& .MuiInputLabel-root": { fontSize: 14 },
  };

  return (
    <Box>
      <Stack spacing={2.5}>
        {/* ── Row: Business Name ── */}
        <TextField
          label="Business Name *"
          value={form.businessName}
          onChange={(e) => handleChange("businessName", e.target.value)}
          error={!!errors.businessName}
          helperText={errors.businessName}
          fullWidth
          size="small"
          sx={textFieldSx}
        />

        {/* ── Row: Website + Auto-Fill ── */}
        <Box>
          <TextField
            label="Website URL *"
            value={form.businessWebsite}
            onChange={(e) => handleChange("businessWebsite", e.target.value)}
            error={!!errors.businessWebsite}
            helperText={errors.businessWebsite || "We can scan your site to auto-fill fields below"}
            fullWidth
            size="small"
            sx={textFieldSx}
          />
          {form.businessWebsite.trim() && !hasAutoFilled && (
            <Button
              onClick={handleAutoFill}
              disabled={isScanning}
              size="small"
              startIcon={isScanning ? <CircularProgress size={14} /> : <AutoFixHigh />}
              sx={{
                mt: 1,
                textTransform: "none",
                fontSize: 13,
                color: "#D97B6A",
                borderColor: "rgba(217,123,106,0.4)",
                "&:hover": { borderColor: "#D97B6A", bgcolor: "rgba(217,123,106,0.06)" },
              }}
              variant="outlined"
            >
              {isScanning ? "Scanning..." : "Auto-Fill from Website"}
            </Button>
          )}
        </Box>

        {/* ── Row: Industry ── */}
        <TextField
          label="Industry / Category *"
          value={form.industry}
          onChange={(e) => handleChange("industry", e.target.value)}
          error={!!errors.industry}
          helperText={errors.industry}
          placeholder="e.g. Dentist, Plumber, Law Firm, Restaurant"
          fullWidth
          size="small"
          sx={textFieldSx}
        />

        {/* ── Row: Business Address ── */}
        <TextField
          label="Business Address *"
          value={form.businessAddress}
          onChange={(e) => handleChange("businessAddress", e.target.value)}
          error={!!errors.businessAddress}
          helperText={errors.businessAddress}
          placeholder="123 Main St, City, State ZIP"
          fullWidth
          size="small"
          sx={textFieldSx}
        />

        {/* ── Row: Target Location ── */}
        <TextField
          label="Target Location / Service Area *"
          value={form.targetLocation}
          onChange={(e) => handleChange("targetLocation", e.target.value)}
          error={!!errors.targetLocation}
          helperText={errors.targetLocation}
          placeholder="e.g. Austin, TX metro area"
          fullWidth
          size="small"
          sx={textFieldSx}
        />

        {/* ── Row: Services Offered ── */}
        <TextField
          label="Services Offered *"
          value={form.servicesOffered}
          onChange={(e) => handleChange("servicesOffered", e.target.value)}
          error={!!errors.servicesOffered}
          helperText={errors.servicesOffered}
          placeholder="List your main services (e.g. teeth whitening, implants, general dentistry)"
          fullWidth
          multiline
          minRows={2}
          maxRows={4}
          size="small"
          sx={textFieldSx}
        />

        {/* ── Row: CMS Platform ── */}
        <FormControl fullWidth size="small" error={!!errors.cmsType}>
          <InputLabel sx={{ fontSize: 14 }}>CMS Platform *</InputLabel>
          <Select
            value={form.cmsType}
            onChange={(e) => handleChange("cmsType", e.target.value)}
            label="CMS Platform *"
            sx={{ borderRadius: "10px", fontSize: 14 }}
          >
            {CMS_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </Select>
          {errors.cmsType && (
            <Typography sx={{ fontSize: 12, color: "error.main", mt: 0.5, ml: 1.5 }}>
              {errors.cmsType}
            </Typography>
          )}
        </FormControl>

        {/* ── Divider: Optional Fields ── */}
        <Typography sx={{ fontSize: 12, color: "text.disabled", textTransform: "uppercase", letterSpacing: "0.05em", pt: 1 }}>
          Optional
        </Typography>

        {/* ── Row: Phone ── */}
        <TextField
          label="Business Phone"
          value={form.phone}
          onChange={(e) => handleChange("phone", e.target.value)}
          fullWidth
          size="small"
          sx={textFieldSx}
        />

        {/* ── Row: Google Business Profile ── */}
        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={form.hasGoogleProfile}
                onChange={(e) => handleChange("hasGoogleProfile", e.target.checked)}
                size="small"
              />
            }
            label={
              <Typography sx={{ fontSize: 14, color: "text.primary" }}>
                I have a Google Business Profile
              </Typography>
            }
          />
          {form.hasGoogleProfile && (
            <TextField
              label="Google Business Profile URL"
              value={form.googleProfileUrl}
              onChange={(e) => handleChange("googleProfileUrl", e.target.value)}
              fullWidth
              size="small"
              sx={{ ...textFieldSx, mt: 1 }}
              placeholder="https://maps.google.com/..."
            />
          )}
        </Box>

        {/* ── Row: Competitors ── */}
        <TextField
          label="Top Competitors (URLs or names)"
          value={form.competitors}
          onChange={(e) => handleChange("competitors", e.target.value)}
          fullWidth
          size="small"
          sx={textFieldSx}
          placeholder="e.g. competitor1.com, competitor2.com"
        />

        {/* ── Row: Goals ── */}
        <TextField
          label="Additional Goals or Notes"
          value={form.additionalGoals}
          onChange={(e) => handleChange("additionalGoals", e.target.value)}
          fullWidth
          multiline
          minRows={2}
          maxRows={3}
          size="small"
          sx={textFieldSx}
          placeholder="Anything specific you'd like us to focus on?"
        />

        {/* ── Submit Row ── */}
        <Box sx={{ display: "flex", gap: 1.5, pt: 1 }}>
          <Button
            onClick={handleSubmit}
            disabled={updateProfile.isPending}
            variant="contained"
            startIcon={updateProfile.isPending ? <CircularProgress size={16} sx={{ color: "#fff" }} /> : <Save />}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              fontSize: 14,
              borderRadius: "10px",
              bgcolor: "#D97B6A",
              "&:hover": { bgcolor: "#C4695A" },
              px: 3,
            }}
          >
            {updateProfile.isPending ? "Saving..." : "Save Business Profile"}
          </Button>
          {isEdit && onCancel && (
            <Button
              onClick={onCancel}
              variant="outlined"
              sx={{
                textTransform: "none",
                fontSize: 14,
                borderRadius: "10px",
                borderColor: "rgba(255,255,255,0.2)",
                color: "text.secondary",
                "&:hover": { borderColor: "rgba(255,255,255,0.4)" },
              }}
            >
              Cancel
            </Button>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
