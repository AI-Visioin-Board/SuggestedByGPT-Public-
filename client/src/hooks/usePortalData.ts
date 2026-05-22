/**
 * usePortalData — Centralizes all tRPC queries for the client portal.
 * Extracted from ClientPortal.tsx to share between V1 and V2.
 */
import { trpc } from "@/lib/trpc";

export function usePortalData(user: any) {
  const { data: clientData, isLoading: clientLoading, refetch: refetchClientData } = trpc.clientPortal.getMyProfile.useQuery(undefined, {
    enabled: !!user,
  });

  const { data: orders, isLoading: ordersLoading } = trpc.clientPortal.getMyOrders.useQuery(undefined, {
    enabled: !!user,
  });

  const activeOrder = orders?.[0]; // Most recent order

  const { data: deliverables, refetch: refetchDeliverables } = trpc.clientPortal.getDeliverables.useQuery(
    { orderId: activeOrder?.id ?? 0 },
    { enabled: !!activeOrder, refetchInterval: 60000 },
  );

  const { data: actionItems, refetch: refetchActionItems } = trpc.clientPortal.getActionItems.useQuery(
    { orderId: activeOrder?.id ?? 0 },
    { enabled: !!activeOrder },
  );

  const { data: directorySubmissions } = trpc.clientPortal.getDirectorySubmissions.useQuery(
    { orderId: activeOrder?.id ?? 0 },
    { enabled: !!activeOrder },
  );

  const { data: progressSummary } = trpc.clientPortal.getProgressSummary.useQuery(
    { orderId: activeOrder?.id ?? 0 },
    { enabled: !!activeOrder, refetchInterval: 60000 },
  );

  const { data: messages } = trpc.clientPortal.getMessages.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: files, refetch: refetchFiles } = trpc.clientPortal.getFiles.useQuery(undefined, {
    enabled: !!user,
  });

  const { data: savedCredentials, refetch: refetchCredentials } = trpc.clientPortal.getMyCredentials.useQuery(undefined, {
    enabled: !!user,
  });

  // NOTE: Voice session queries (getActiveVoiceSession, getMyVoiceSessions) are NOT here.
  // VoiceBooking.tsx manages its own voice queries internally to avoid duplicate polling.

  return {
    clientData,
    clientLoading,
    refetchClientData,
    orders,
    ordersLoading,
    activeOrder,
    deliverables,
    refetchDeliverables,
    actionItems,
    refetchActionItems,
    directorySubmissions,
    progressSummary,
    messages,
    files,
    refetchFiles,
    savedCredentials,
    refetchCredentials,
  };
}
