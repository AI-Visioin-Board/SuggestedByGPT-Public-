/**
 * RejectionDialog — Dark glass dialog for deliverable change requests.
 * Uses the useApprovalWorkflow hook for state/mutations.
 *
 * Two-field form: "Which section?" + "What would you like to change?"
 * Combines into a structured feedback string for the AI to make targeted edits
 * instead of rewriting the entire deliverable.
 */
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  MenuItem,
} from "@mui/material";

const FAQ_SECTIONS = [
  "All / General",
  "A specific FAQ question",
  "FAQ section heading or intro",
  "Schema markup / structured data",
  "Styling / layout",
  "Add new content",
  "Remove something",
  "Other",
];

interface RejectionDialogProps {
  open: boolean;
  onClose: () => void;
  feedback: string;
  setFeedback: (v: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function RejectionDialog({
  open,
  onClose,
  feedback,
  setFeedback,
  onSubmit,
  isSubmitting,
}: RejectionDialogProps) {
  const [section, setSection] = useState("All / General");
  const [changeText, setChangeText] = useState("");

  // Combine section + change text into structured feedback for the AI
  const updateCombinedFeedback = (newSection: string, newChange: string) => {
    if (!newChange.trim()) {
      setFeedback("");
      return;
    }
    const sectionLabel = newSection === "All / General" ? "" : `[Section: ${newSection}] `;
    setFeedback(`${sectionLabel}${newChange.trim()}`);
  };

  // Reset local state when dialog opens/closes
  const handleClose = () => {
    setSection("All / General");
    setChangeText("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18 }}>
        Request Changes
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: "rgba(255,255,255,0.5)", mb: 2 }}>
          Tell us what you'd like changed. We'll update just that part and send it back for your review — we won't rewrite everything.
        </Typography>
        <TextField
          select
          fullWidth
          label="Which section?"
          value={section}
          onChange={(e) => {
            setSection(e.target.value);
            updateCombinedFeedback(e.target.value, changeText);
          }}
          sx={{ mb: 2 }}
          size="small"
        >
          {FAQ_SECTIONS.map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
        <TextField
          autoFocus
          fullWidth
          multiline
          rows={4}
          label="What would you like to change?"
          placeholder='e.g., "Add a question about rental arbitrage management" or "Change the heading to say Local SEO FAQ"'
          value={changeText}
          onChange={(e) => {
            setChangeText(e.target.value);
            updateCombinedFeedback(section, e.target.value);
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          color="warning"
          disabled={!feedback.trim() || isSubmitting}
          onClick={onSubmit}
        >
          {isSubmitting ? "Submitting..." : "Submit Feedback"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
