/**
 * useApprovalWorkflow — Encapsulates deliverable approval/rejection logic.
 * Extracted from ClientPortal.tsx for reuse in V2.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface UseApprovalWorkflowOptions {
  refetchDeliverables: () => void;
  refetchActionItems: () => void;
}

export function useApprovalWorkflow({ refetchDeliverables, refetchActionItems }: UseApprovalWorkflowOptions) {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectDeliverableId, setRejectDeliverableId] = useState<number | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [approvalLoading, setApprovalLoading] = useState<number | null>(null);

  const approveMutation = trpc.clientPortal.approveDeliverable.useMutation();
  const rejectMutation = trpc.clientPortal.rejectDeliverable.useMutation();

  const handleApprove = async (deliverableId: number) => {
    setApprovalLoading(deliverableId);
    try {
      await approveMutation.mutateAsync({ deliverableId });
      toast.success("Changes approved! We will implement them shortly.");
      refetchDeliverables();
      refetchActionItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve");
    } finally {
      setApprovalLoading(null);
    }
  };

  const openRejectDialog = (deliverableId: number) => {
    setRejectDeliverableId(deliverableId);
    setRejectFeedback("");
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!rejectDeliverableId) return;
    try {
      await rejectMutation.mutateAsync({
        deliverableId: rejectDeliverableId,
        feedback: rejectFeedback.trim(),
      });
      toast.success("Feedback submitted! We will revise and send updated changes for your review.");
      setRejectDialogOpen(false);
      refetchDeliverables();
      refetchActionItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit feedback");
    }
  };

  const closeRejectDialog = () => {
    setRejectDialogOpen(false);
  };

  return {
    // Approval
    approvalLoading,
    handleApprove,
    // Rejection dialog
    rejectDialogOpen,
    rejectFeedback,
    setRejectFeedback,
    rejectMutationPending: rejectMutation.isPending,
    openRejectDialog,
    handleReject,
    closeRejectDialog,
  };
}
