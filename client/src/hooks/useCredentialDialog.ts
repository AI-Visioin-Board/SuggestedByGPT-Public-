/**
 * useCredentialDialog — Encapsulates credential form state, save mutation,
 * and the auto-unblock refetch fix (refetchDeliverables on save).
 * Extracted from ClientPortal.tsx for reuse in V2.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import confetti from "canvas-confetti";

interface UseCredentialDialogOptions {
  refetchCredentials: () => void;
  refetchDeliverables: () => void; // Bug fix: also refetch deliverables to show auto-unblock
  refetchActionItems?: () => void; // Bug fix: refetch action items so "provide_credentials" disappears
}

export function useCredentialDialog({ refetchCredentials, refetchDeliverables, refetchActionItems }: UseCredentialDialogOptions) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [credentialType, setCredentialType] = useState<"website_cms" | "google_account" | "domain_registrar">("website_cms");
  const [serviceName, setServiceName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Reddit credential state
  const [hasRedditAccount, setHasRedditAccount] = useState<"yes" | "no" | null>(null);
  const [redditUsername, setRedditUsername] = useState("");
  const [redditPassword, setRedditPassword] = useState("");
  const [showRedditPassword, setShowRedditPassword] = useState(false);

  const saveCredentialMutation = trpc.clientPortal.saveCredential.useMutation();

  const resetForm = () => {
    setServiceName("");
    setUsername("");
    setPassword("");
    setNotes("");
    setShowPassword(false);
    setHasRedditAccount(null);
    setRedditUsername("");
    setRedditPassword("");
    setShowRedditPassword(false);
  };

  const openDialog = (type: "website_cms" | "google_account" | "domain_registrar" = "website_cms") => {
    setCredentialType(type);
    resetForm();
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleSave = async () => {
    // Save CMS/main credentials first
    try {
      await saveCredentialMutation.mutateAsync({
        credentialType,
        serviceName,
        username,
        password,
        additionalInfo: notes,
      });
    } catch (error) {
      console.error("Failed to save credentials:", error);
      toast.error("Failed to save credentials. Please try again.");
      return;
    }

    // Save Reddit credentials separately (if applicable)
    let redditSaved = true;
    if (hasRedditAccount === "yes" && redditUsername && redditPassword) {
      try {
        await saveCredentialMutation.mutateAsync({
          credentialType: "other",
          serviceName: "Reddit",
          username: redditUsername,
          password: redditPassword,
          additionalInfo: "Client-provided Reddit account credentials",
        });
      } catch (error) {
        console.error("Failed to save Reddit credentials:", error);
        redditSaved = false;
      }
    } else if (hasRedditAccount === "no") {
      try {
        await saveCredentialMutation.mutateAsync({
          credentialType: "other",
          serviceName: "Reddit",
          username: "NEEDS_CREATION",
          password: "NEEDS_CREATION",
          additionalInfo: "Client does not have a Reddit account. VA needs to create one.",
        });
      } catch (error) {
        console.error("Failed to save Reddit marker:", error);
        redditSaved = false;
      }
    }

    // Show appropriate toast
    if (!redditSaved) {
      toast.success("Website credentials saved! Reddit credentials failed — please try again from settings.");
    } else if (hasRedditAccount === "yes" && redditUsername) {
      toast.success("Website and Reddit credentials saved securely!");
    } else if (hasRedditAccount === "no") {
      toast.success("Credentials saved! We'll create a Reddit account for you.");
    } else {
      toast.success("Credentials saved securely!");
    }

    // Celebrate! 🎉
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

    closeDialog();
    refetchCredentials();
    refetchDeliverables();
    refetchActionItems?.();
  };

  const canSave = !!(serviceName && username && password);

  return {
    dialogOpen,
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
    openDialog,
    closeDialog,
    handleSave,
    canSave,
    isSaving: saveCredentialMutation.isPending,
    // Reddit-specific
    hasRedditAccount,
    setHasRedditAccount,
    redditUsername,
    setRedditUsername,
    redditPassword,
    setRedditPassword,
    showRedditPassword,
    setShowRedditPassword,
  };
}

/** Mask email for display: "admin@foo.com" → "ad***@foo.com", "admin" → "ad***" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return (local || "").slice(0, 2) + "***";
  return local!.slice(0, 2) + "***@" + domain;
}
