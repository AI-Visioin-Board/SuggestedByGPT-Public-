/**
 * Session Context Loader
 *
 * Before each worker cycle, this loads ALL client data into a single
 * SessionContext object. After each step execution, it saves session
 * notes back to the database. This gives the worker "persistent memory"
 * across API calls and server restarts.
 *
 * Core philosophy: Claude never goes in blind. Every step execution
 * starts with full context of what's been done, what's blocked, and
 * what the client has communicated.
 */

/** Deliverable types that require CMS/backend login to deploy. Used to skip when noCmsBackend is true. */
export const CMS_DEPENDENT_TYPES = [
  'robots_txt_audit',                // deploys fixed robots.txt via CMS
  'llms_txt',                        // deploys llms.txt via CMS
  'schema_website_implementation',   // installs schema JSON-LD on site via CMS
  'faq_website_implementation',      // installs FAQ section on site via CMS
];

import { getDb } from './db';
import {
  clients,
  orders,
  deliverables,
  actionItems,
  clientCredentials,
  clientMessages,
  clientFiles,
  progressLog,
  directorySubmissions,
  supportTickets,
  supportTicketMessages,
} from '../drizzle/schema';
import type {
  Client,
  Order,
  Deliverable,
  ActionItem,
  ClientCredential,
  ClientMessage,
  ClientFile,
  ProgressLog,
  DirectorySubmission,
  SupportTicket,
  SupportTicketMessage,
} from '../drizzle/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { notifyOwner } from './_core/notification';
import { generateVAInstructions } from './vaInstructions';
import type { CMSTaskType } from './cmsAutomation';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionContext {
  client: Client;
  order: Order;
  deliverables: Deliverable[];
  credentials: ClientCredential[];
  actionItems: ActionItem[];
  recentMessages: ClientMessage[];      // last 20
  recentProgress: ProgressLog[];        // last session's notes
  blockedSteps: Deliverable[];          // status = 'blocked'
  completedSteps: Deliverable[];        // status = 'completed'
  pendingSteps: Deliverable[];          // status = 'pending'
  inProgressSteps: Deliverable[];       // status = 'in_progress'
  pendingApprovalSteps: Deliverable[];  // status = 'pending_approval'
  approvedSteps: Deliverable[];         // status = 'approved' (ready for Pass 2 implementation)
  changeRequestedSteps: Deliverable[];  // status = 'change_requested' (client submitted feedback, needs regeneration)
  nextStep: Deliverable | null;         // next executable deliverable
  clientFiles: ClientFile[];
  directorySubmissions: DirectorySubmission[];
  supportTicketHistory: Array<{
    ticket: SupportTicket;
    messages: SupportTicketMessage[];
  }>;
  // Computed stats
  totalDeliverables: number;
  completedCount: number;
  blockedCount: number;
  progressPercent: number;
}

/**
 * Union of all failure categories the worker/executors can report.
 *
 * - CMS-layer categories (from `CMSFailureCategory`) describe automation
 *   errors during directory submissions, schema installs, etc.
 * - `api_outage` is a worker-layer category that means the underlying LLM
 *   API is unavailable (5xx/429/overloaded/network error reaching Anthropic).
 *   Outages don't burn retry attempts; the deliverable is reset to pending
 *   and re-attempted on the next worker cycle.
 * - `api_outage_sustained` is escalated after too many consecutive outage
 *   hits so owners get notified if Anthropic is down for days.
 */
export type FailureCategory =
  | 'wrong_credentials'
  | 'two_factor_auth'
  | 'sso_stuck'
  | 'login_redirect'
  | 'plugin_missing'
  | 'editor_blocked'
  | 'timeout'
  | 'platform_limitation'
  | 'api_outage'
  | 'api_outage_sustained'
  | 'unknown';

export interface StepResult {
  success: boolean;
  blocked: boolean;
  blockerReason?: string;
  sessionNotes: string;
  progressPercent: number;               // 0-100 for this specific deliverable
  fileUrl?: string;                      // URL to generated file (if any)
  notes?: string;                        // Notes/instructions for the client
  failureCategory?: FailureCategory;     // WHY it failed — narrows retry and escalation behavior
  failureStep?: string;                  // WHERE in the process it got stuck
}

// ============================================================================
// STEP DEPENDENCY GRAPH
// ============================================================================

/**
 * Defines which steps depend on which other steps.
 * A step can only execute if ALL its dependencies are 'completed'.
 * Empty array = no dependencies, can run immediately.
 */
export const STEP_DEPENDENCIES: Record<string, string[]> = {
  // Jumpstart (all independent — can run in any order, except FAQ install needs FAQ content)
  ai_assessment: [],
  schema_implementation: [],
  citation_audit: [],
  robots_txt_audit: [],
  llms_txt: [],
  faq_schema: [],
  faq_website_implementation: ['faq_schema'],  // needs FAQ content from faq_schema step
  review_strategy: [],
  bing_places: [],

  // Dominator (some depend on Jumpstart results)
  gbp_optimization: [],
  content_optimization: ['ai_assessment'],          // needs assessment data
  competitor_analysis: ['ai_assessment'],            // needs assessment data
  directory_submission_guide: ['citation_audit'],       // needs audit results
  directory_submissions: ['directory_submission_guide'], // needs seeded records + guide
  schema_website_implementation: ['schema_implementation'],  // needs schema code
  social_proof_strategy: [],
  monthly_checkin_1: [],                             // time-gated: 30 days
  monthly_checkin_2: [],                             // time-gated: 60 days

  // Reddit Community Engagement (6 batches, 2/month over 3 months)
  reddit_engagement_batch_1: ['content_optimization'],  // Also time-gated to day 5 below
  reddit_engagement_batch_2: ['reddit_engagement_batch_1'],
  reddit_engagement_batch_3: ['reddit_engagement_batch_2'],
  reddit_engagement_batch_4: ['reddit_engagement_batch_3'],
  reddit_engagement_batch_5: ['reddit_engagement_batch_4'],
  reddit_engagement_batch_6: ['reddit_engagement_batch_5'],

  // Legacy step types (existing executors, mapped for compatibility)
  foursquare_optimization: [],
  wikidata_entry: [],
  content_freshness: [],
  best_of_lists: [],
  ongoing_optimization: [],
};

/**
 * Time-gated steps that shouldn't execute until N days after order creation.
 * Value is the minimum number of days after order.createdAt.
 */
export const TIME_GATED_STEPS: Record<string, number> = {
  monthly_checkin_1: 30,
  monthly_checkin_2: 60,
  reddit_engagement_batch_1: 5,    // Day 5: gives VA time to create Reddit account
  reddit_engagement_batch_2: 15,   // ~2 weeks after batch 1
  reddit_engagement_batch_3: 30,   // month 2 start
  reddit_engagement_batch_4: 45,   // ~2 weeks into month 2
  reddit_engagement_batch_5: 60,   // month 3 start
  reddit_engagement_batch_6: 75,   // ~2 weeks into month 3
};

// ============================================================================
// CONTEXT LOADER
// ============================================================================

/**
 * Load full session context for an order.
 * This is the "memory" that every step executor receives.
 */
export async function loadSessionContext(orderId: number): Promise<SessionContext | null> {
  const db = await getDb();
  if (!db) return null;

  // Load order + client in one query
  const orderResults = await db
    .select()
    .from(orders)
    .leftJoin(clients, eq(orders.clientId, clients.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (orderResults.length === 0 || !orderResults[0].clients) return null;

  const order = orderResults[0].orders;
  const client = orderResults[0].clients;

  // Normalize businessWebsite — ensure protocol prefix for Playwright navigation
  if (client.businessWebsite && !client.businessWebsite.startsWith('http://') && !client.businessWebsite.startsWith('https://')) {
    client.businessWebsite = `https://${client.businessWebsite}`;
  }

  // Load everything else in parallel
  const [
    allDeliverables,
    allCredentials,
    allActionItems,
    recentMessages,
    recentProgress,
    allFiles,
    allDirSubmissions,
    clientTickets,
  ] = await Promise.all([
    db.select().from(deliverables).where(eq(deliverables.orderId, orderId)),
    db.select().from(clientCredentials).where(eq(clientCredentials.clientId, client.id)).orderBy(desc(clientCredentials.createdAt)),
    db.select().from(actionItems).where(eq(actionItems.orderId, orderId)),
    db.select().from(clientMessages)
      .where(eq(clientMessages.clientId, client.id))
      .orderBy(desc(clientMessages.createdAt))
      .limit(20),
    db.select().from(progressLog)
      .where(eq(progressLog.orderId, orderId))
      .orderBy(desc(progressLog.createdAt))
      .limit(20),
    db.select().from(clientFiles).where(eq(clientFiles.clientId, client.id)),
    db.select().from(directorySubmissions).where(eq(directorySubmissions.orderId, orderId)),
    db.select().from(supportTickets)
      .where(eq(supportTickets.clientId, client.id))
      .orderBy(desc(supportTickets.createdAt))
      .limit(10),
  ]);

  // Load support ticket messages for each ticket
  const ticketHistory: Array<{ ticket: SupportTicket; messages: SupportTicketMessage[] }> = [];
  if (clientTickets.length > 0) {
    const ticketMessageResults = await Promise.all(
      clientTickets.map(ticket =>
        db.select().from(supportTicketMessages)
          .where(eq(supportTicketMessages.ticketId, ticket.id))
          .orderBy(supportTicketMessages.createdAt)
          .limit(20)
      )
    );
    for (let i = 0; i < clientTickets.length; i++) {
      ticketHistory.push({ ticket: clientTickets[i], messages: ticketMessageResults[i] });
    }
  }

  // Categorize deliverables
  const blockedSteps = allDeliverables.filter(d => d.status === 'blocked');
  const completedSteps = allDeliverables.filter(d => d.status === 'completed');
  const pendingSteps = allDeliverables.filter(d => d.status === 'pending');
  const inProgressSteps = allDeliverables.filter(d => d.status === 'in_progress');
  const pendingApprovalSteps = allDeliverables.filter(d => d.status === 'pending_approval');
  const approvedSteps = allDeliverables.filter(d => d.status === 'approved');
  const changeRequestedSteps = allDeliverables.filter(d => d.status === 'change_requested');

  const totalDeliverables = allDeliverables.length;
  const completedCount = completedSteps.length;
  const blockedCount = blockedSteps.length;
  const progressPercent = totalDeliverables > 0
    ? Math.round((completedCount / totalDeliverables) * 100)
    : 0;

  // Find next executable step
  const nextStep = getNextExecutableStep(allDeliverables, order);

  return {
    client,
    order,
    deliverables: allDeliverables,
    credentials: allCredentials,
    actionItems: allActionItems,
    recentMessages,
    recentProgress,
    blockedSteps,
    completedSteps,
    pendingSteps,
    inProgressSteps,
    pendingApprovalSteps,
    approvedSteps,
    changeRequestedSteps,
    nextStep,
    clientFiles: allFiles,
    directorySubmissions: allDirSubmissions,
    supportTicketHistory: ticketHistory,
    totalDeliverables,
    completedCount,
    blockedCount,
    progressPercent,
  };
}

// ============================================================================
// STEP SELECTION
// ============================================================================

/**
 * Find the next deliverable that can be executed:
 * 1. Status is 'change_requested' (client submitted feedback — regenerate ASAP) — HIGHEST PRIORITY
 * 2. Status is 'approved' (client approved — ready for Pass 2 implementation)
 * 3. Status is 'pending' (not blocked, not completed, not in_progress)
 * 4. All dependencies are 'completed'
 * 5. Time gates are satisfied (for monthly check-ins)
 * 6. Ordered by stepIndex (lowest first)
 *
 * Note: 'pending_approval' deliverables are SKIPPED — they're waiting for client action.
 */
function getNextExecutableStep(
  allDeliverables: Deliverable[],
  order: Order,
): Deliverable | null {
  const completedTypes = new Set(
    allDeliverables
      .filter(d => d.status === 'completed')
      .map(d => d.deliverableType),
  );

  // Priority 1: Change requested deliverables (client wants revisions — handle immediately)
  const changeRequested = allDeliverables
    .filter(d => d.status === 'change_requested')
    .sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));

  if (changeRequested.length > 0) {
    return changeRequested[0];
  }

  // Priority 2: Approved deliverables (client said "go ahead, install it")
  // These should be executed before any new pending steps.
  const approved = allDeliverables
    .filter(d => d.status === 'approved')
    .sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));

  if (approved.length > 0) {
    return approved[0];
  }

  // Priority 3: Pending deliverables with all deps met
  const pending = allDeliverables
    .filter(d => d.status === 'pending')
    .sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));

  const now = new Date();
  const orderCreated = new Date(order.createdAt);
  const daysSinceOrder = Math.floor(
    (now.getTime() - orderCreated.getTime()) / (1000 * 60 * 60 * 24),
  );

  for (const deliverable of pending) {
    const deps = STEP_DEPENDENCIES[deliverable.deliverableType] || [];
    const depsAllMet = deps.every(dep => completedTypes.has(dep));

    if (!depsAllMet) continue;

    // Check time gate
    const timeGate = TIME_GATED_STEPS[deliverable.deliverableType];
    if (timeGate && daysSinceOrder < timeGate) continue;

    return deliverable;
  }

  return null;
}

/**
 * Check if there are unresolved blockers that haven't been bundled into a meeting.
 */
export function hasUnresolvedBlockers(context: SessionContext): boolean {
  return context.blockedSteps.length > 0;
}

/**
 * Get count of blockers that haven't been bundled into a meeting request.
 *
 * NOTE: All action item types — including 'verify_gbp' — count toward the
 * 3-blocker threshold that triggers a meeting proposal in sendMeetingProposal().
 * This is intentional: GBP access issues should be bundled with other blockers
 * into one consolidated meeting request, not sent as separate emails.
 * No special-case logic is needed here; the existing filter covers it.
 */
export function getUnbundledBlockerCount(context: SessionContext): number {
  const unbundled = context.actionItems.filter(
    ai => ai.status === 'pending' && !ai.bundledInMeeting,
  );
  return unbundled.length;
}

// ============================================================================
// SESSION NOTES (PERSISTENT MEMORY)
// ============================================================================

/**
 * Save session notes after a step execution.
 * This is the "memory" that persists across worker cycles.
 */
export async function saveSessionNotes(
  orderId: number,
  deliverableId: number | undefined,
  message: string,
  sessionData?: Record<string, unknown>,
  sessionType: string = 'execution',
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(progressLog).values({
    orderId,
    deliverableId,
    message,
    sessionData: sessionData ? sessionData : undefined,
    sessionType,
  });

  console.log(`[Session] Order #${orderId}: ${message}`);
}

// ─────────────────────────────────────────────────────────────
// API outage observability
// ─────────────────────────────────────────────────────────────
// Per-deliverable consecutive-outage counter, cleared whenever a non-outage
// result (success OR real failure) is recorded. In-process only — resets
// on worker restart, which is acceptable because a restart itself is a
// logged signal. After SUSTAINED_OUTAGE_THRESHOLD hits in a row on the
// SAME deliverable, we escalate so the owner gets notified even if
// Anthropic stays down for days.
//
// At the worker's 3-hour cadence, 20 hits ≈ 60 hours (2.5 days) of
// continuous outage before escalation fires.
const consecutiveOutageHits = new Map<number, number>();
const SUSTAINED_OUTAGE_THRESHOLD = 20;
let sustainedOutageOwnerNotifiedFor = new Set<number>(); // Don't spam — one notification per deliverable per process

/**
 * Update a deliverable's status and progress after step execution.
 * This replaces the old pattern of creating new deliverable records —
 * now we UPDATE the pre-seeded record from the webhook.
 *
 * CRITICAL GUARD: If the deliverable is currently 'pending_approval',
 * do NOT reset it. The retry loop must not overwrite approval state.
 */
export async function updateDeliverableFromResult(
  deliverableId: number,
  result: StepResult,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Guard: Don't overwrite pending_approval or approved status via retry logic
  const [currentStatus] = await db.select({ status: deliverables.status })
    .from(deliverables)
    .where(eq(deliverables.id, deliverableId))
    .limit(1);

  if (currentStatus?.status === 'pending_approval') {
    console.log(`[Session] Deliverable #${deliverableId} is pending_approval — skipping updateDeliverableFromResult`);
    return;
  }
  if (currentStatus?.status === 'approved') {
    console.log(`[Session] Deliverable #${deliverableId} is approved — skipping updateDeliverableFromResult`);
    return;
  }
  if (currentStatus?.status === 'change_requested') {
    console.log(`[Session] Deliverable #${deliverableId} is change_requested — skipping updateDeliverableFromResult`);
    return;
  }

  if (result.blocked) {
    await db.update(deliverables).set({
      status: 'blocked',
      blockerReason: result.blockerReason || 'Unknown blocker',
      blockerCreatedAt: new Date(),
      progressPercent: result.progressPercent,
      notes: result.notes,
    }).where(eq(deliverables.id, deliverableId));
  } else if (result.success) {
    await db.update(deliverables).set({
      status: 'completed',
      progressPercent: 100,
      completedAt: new Date(),
      fileUrl: result.fileUrl,
      notes: result.notes,
    }).where(eq(deliverables.id, deliverableId));
  } else if (result.failureCategory === 'platform_limitation') {
    // Platform genuinely can't do this — skip ALL retries, block immediately, escalate
    console.log(`[Session] Deliverable #${deliverableId} hit platform limitation — blocking immediately (no retries)`);
    const failureStep = result.failureStep || 'unknown step';
    const blockerReason = `Platform limitation: ${result.sessionNotes || result.notes || 'This platform does not support automated installation'}`;

    await db.update(deliverables).set({
      status: 'blocked',
      blockerReason,
      blockerCreatedAt: new Date(),
      progressPercent: result.progressPercent,
      notes: result.notes || `Platform limitation. ${result.sessionNotes}`,
    }).where(eq(deliverables.id, deliverableId));

    // Immediate escalation — no retry burn
    const [delRecord] = await db.select({ orderId: deliverables.orderId })
      .from(deliverables).where(eq(deliverables.id, deliverableId)).limit(1);
    if (delRecord) {
      await escalateBlockedDeliverable(db, delRecord.orderId, deliverableId, 'platform_limitation', failureStep, result.sessionNotes || '');
    }
  } else {
    // Failed but not blocked — increment retry count
    // Auto-block after 5 failed attempts to prevent infinite retry loops
    const MAX_RETRIES = 5;

    // API outages (Anthropic down, network errors) don't count toward retry limit.
    // These are transient infrastructure issues that resolve on their own — the worker
    // will just pick the deliverable up again next cycle without burning a retry.
    const isApiOutage = result.failureCategory === 'api_outage';

    // Track consecutive outages so sustained downtime (days) isn't invisible.
    let consecutiveOutages = 0;
    if (isApiOutage) {
      consecutiveOutages = (consecutiveOutageHits.get(deliverableId) ?? 0) + 1;
      consecutiveOutageHits.set(deliverableId, consecutiveOutages);
      console.warn(
        `[Session] Deliverable #${deliverableId} hit API outage (consecutive: ${consecutiveOutages}/${SUSTAINED_OUTAGE_THRESHOLD}). ${result.sessionNotes}`,
      );
    } else {
      // Non-outage result — clear the counter so we only count unbroken runs.
      if (consecutiveOutageHits.has(deliverableId)) {
        consecutiveOutageHits.delete(deliverableId);
        sustainedOutageOwnerNotifiedFor.delete(deliverableId);
      }
    }

    // Sustained-outage escalation: if the API has been down across many
    // consecutive worker cycles on the same deliverable, the owner needs to
    // know so they can decide whether to switch providers or pause the
    // worker. Escalate ONCE per deliverable per process.
    const sustainedOutage =
      isApiOutage &&
      consecutiveOutages >= SUSTAINED_OUTAGE_THRESHOLD &&
      !sustainedOutageOwnerNotifiedFor.has(deliverableId);

    if (sustainedOutage) {
      sustainedOutageOwnerNotifiedFor.add(deliverableId);
      console.error(
        `[Session] SUSTAINED API OUTAGE on deliverable #${deliverableId}: ${consecutiveOutages} consecutive hits. Escalating to owner.`,
      );
      try {
        const [delRecord] = await db.select({ orderId: deliverables.orderId })
          .from(deliverables).where(eq(deliverables.id, deliverableId)).limit(1);
        if (delRecord) {
          await escalateBlockedDeliverable(
            db,
            delRecord.orderId,
            deliverableId,
            'api_outage_sustained',
            'llm_api_call',
            `Claude API has been unavailable across ${consecutiveOutages} consecutive worker cycles. Latest error: ${result.sessionNotes}`,
          );
        }
      } catch (escalationError) {
        console.error(`[Session] Sustained outage escalation failed for #${deliverableId}:`, escalationError);
      }
      // Do NOT block the deliverable — keep it pending so it resumes
      // automatically when the API recovers. The owner just needs a heads-up.
    }

    const [retryInfo] = await db.select({ retryCount: deliverables.retryCount })
      .from(deliverables)
      .where(eq(deliverables.id, deliverableId))
      .limit(1);

    const retryCount = isApiOutage
      ? (retryInfo?.retryCount ?? 0)       // Don't increment — just reset to pending
      : (retryInfo?.retryCount ?? 0) + 1;  // Real failure — count it

    if (!isApiOutage && retryCount >= MAX_RETRIES) {
      // Auto-block — too many failures. Escalate based on failure category.
      const failureCategory = result.failureCategory || 'unknown';
      const failureStep = result.failureStep || 'unknown step';
      const blockerReason = `Auto-blocked after ${MAX_RETRIES} failed attempts. Last failure: ${result.sessionNotes}`;

      await db.update(deliverables).set({
        status: 'blocked',
        blockerReason,
        blockerCreatedAt: new Date(),
        progressPercent: result.progressPercent,
        notes: result.notes || `Failed ${MAX_RETRIES} times. Category: ${failureCategory}. Step: ${failureStep}. Last error: ${result.sessionNotes}`,
        retryCount,
      }).where(eq(deliverables.id, deliverableId));
      console.log(`[Session] Deliverable #${deliverableId} auto-blocked after ${MAX_RETRIES} retries. Failure: ${failureCategory} at ${failureStep}`);

      // ── ESCALATION: Create action item + notify owner based on failure type ──
      // Get orderId from the deliverable record
      const [delRecord] = await db.select({ orderId: deliverables.orderId })
        .from(deliverables).where(eq(deliverables.id, deliverableId)).limit(1);
      if (delRecord) {
        await escalateBlockedDeliverable(db, delRecord.orderId, deliverableId, failureCategory, failureStep, result.sessionNotes);
      }
    } else {
      // Reset to pending for retry
      await db.update(deliverables).set({
        status: 'pending',
        progressPercent: result.progressPercent,
        notes: isApiOutage
          ? result.notes || `API unavailable — will auto-retry next cycle (retry count unchanged at ${retryCount}/${MAX_RETRIES})`
          : result.notes || `Failed (attempt ${retryCount}/${MAX_RETRIES}): ${result.sessionNotes}`,
        retryCount,
      }).where(eq(deliverables.id, deliverableId));
    }
  }
}

/**
 * Escalate a blocked deliverable based on WHY it failed.
 * Creates the right action item and notifies the right people.
 *
 * ALL owner emails use uniform subject: "[SBGPT Worker] TYPE — Client — Deliverable"
 * so they're instantly recognizable in your inbox.
 *
 * Failure categories and their escalation paths:
 * - wrong_credentials → action item for CLIENT to re-upload credentials + notify owner
 * - two_factor_auth → action item to BOOK APPOINTMENT with client + notify owner
 * - sso_stuck / login_redirect → notify OWNER (system issue, not client's fault)
 * - plugin_missing / editor_blocked → notify OWNER (need different approach)
 * - timeout → notify OWNER (infrastructure issue)
 * - unknown → notify OWNER for manual investigation
 */
async function escalateBlockedDeliverable(
  db: any,
  orderId: number,
  deliverableId: number,
  failureCategory: FailureCategory | string,
  failureStep: string,
  lastError: string,
): Promise<void> {
  try {
    // Get deliverable and client info for the notification
    const [delInfo] = await db.select({
      deliverableType: deliverables.deliverableType,
      title: deliverables.title,
    }).from(deliverables).where(eq(deliverables.id, deliverableId)).limit(1);

    const [orderInfo] = await db.select({
      clientId: orders.clientId,
      packageType: orders.packageType,
    }).from(orders).where(eq(orders.id, orderId)).limit(1);

    let clientName = 'Unknown Client';
    if (orderInfo) {
      const [clientInfo] = await db.select({ fullName: clients.fullName, businessName: clients.businessName })
        .from(clients).where(eq(clients.id, orderInfo.clientId)).limit(1);
      clientName = clientInfo?.businessName || clientInfo?.fullName || 'Unknown Client';
    }

    const deliverableTitle = delInfo?.title || delInfo?.deliverableType || 'Unknown Deliverable';
    const pkg = orderInfo?.packageType || 'unknown';

    // Uniform subject prefix so all worker emails are instantly recognizable
    const subjectPrefix = '[SBGPT Worker]';

    // ── Route based on failure category ──
    switch (failureCategory) {
      case 'wrong_credentials': {
        // Client needs to re-upload correct credentials (with dedup)
        await createActionItemIfNotExists(db, {
          orderId,
          actionType: 'provide_credentials',
          title: `Credentials not working — please re-upload`,
          description: `We tried to install "${deliverableTitle}" on your website but the login credentials didn't work. Please double-check your username and password and re-upload them in the Credentials section of your portal.\n\nTechnical detail: ${lastError}`,
          priority: 'high',
          relatedDeliverableId: deliverableId,
        });

        // Also notify owner so you know
        await notifyOwner({
          title: `${subjectPrefix} Wrong Credentials — ${clientName}`,
          content: `Client: ${clientName} (${pkg})\nDeliverable: ${deliverableTitle}\n\nClient's credentials were rejected by their CMS/hosting.\nAction item created asking them to re-upload.\n\nFailed at: ${failureStep}\nError: ${lastError}`,
        });
        console.log(`[Escalation] Created 'provide_credentials' action item + notified owner for ${clientName}`);
        break;
      }

      case 'two_factor_auth': {
        // Need to book appointment — client must enter 2FA code live (with dedup)
        await createActionItemIfNotExists(db, {
          orderId,
          actionType: 'other',
          title: `2FA required — need to schedule a quick call`,
          description: `Your website has two-factor authentication enabled. We need to do a brief screen share or call so you can enter the verification code while we install "${deliverableTitle}". This usually takes 5-10 minutes.\n\nOr you can temporarily disable 2FA, let us know via support chat, and we'll complete the installation automatically.`,
          priority: 'high',
          relatedDeliverableId: deliverableId,
          bundledInMeeting: true,  // Flag: this should be bundled into an appointment
        });

        await notifyOwner({
          title: `${subjectPrefix} 2FA Block — ${clientName}`,
          content: `Client: ${clientName} (${pkg})\nDeliverable: ${deliverableTitle}\n\nTwo-factor auth is blocking CMS automation.\nOptions:\n1. Schedule a 5-min call with client to enter 2FA code live\n2. Ask client to temporarily disable 2FA\n\nAction item created for client.\n\nFailed at: ${failureStep}\nError: ${lastError}`,
        });
        console.log(`[Escalation] Created 2FA appointment action item + notified owner for ${clientName}`);
        break;
      }

      case 'sso_stuck':
      case 'login_redirect': {
        // System issue — notify owner, not client's fault
        await notifyOwner({
          title: `${subjectPrefix} Login Flow Issue — ${clientName}`,
          content: `Client: ${clientName} (${pkg})\nDeliverable: ${deliverableTitle}\n\nThe CMS automation login flow is failing. This is a SYSTEM issue, not the client's fault.\n\nFailure: ${failureCategory}\nFailed at: ${failureStep}\nError: ${lastError}\n\nAction needed: Check the login flow for this hosting provider and fix the automator.`,
        });

        await createActionItemIfNotExists(db, {
          orderId,
          actionType: 'other',
          title: `Website installation paused — our team is investigating`,
          description: `We ran into a technical issue while installing "${deliverableTitle}" on your website. Our team has been notified and is working on it. No action needed from you — we'll complete this as soon as the issue is resolved.`,
          priority: 'medium',
          relatedDeliverableId: deliverableId,
          requiresClientAction: false,  // Team-handled — informational only
          bundledInMeeting: false,
        });
        console.log(`[Escalation] Notified owner about SSO/login issue for ${clientName}`);
        break;
      }

      case 'platform_limitation': {
        // Platform genuinely can't do this — create VA task + notify owner with VA instructions
        await createActionItemIfNotExists(db, {
          orderId,
          actionType: 'other',
          title: `Manual setup needed — ${deliverableTitle}`,
          description: `Your website platform doesn't support automated installation of "${deliverableTitle}". Our team will complete this manually for you. No action needed from you — we'll update you when it's done.`,
          priority: 'medium',
          relatedDeliverableId: deliverableId,
          requiresClientAction: false,  // Team-handled (VA picks up via SOP) — informational only
        });

        // Generate VA instruction document from the failure step info
        // failureStep format: "install_robots_txt → Squarespace platform limitation"
        let vaInstructions = '';
        try {
          const taskTypeMatch = failureStep.match(/^(install_\w+)/);
          const platformMatch = failureStep.match(/→\s*(\w+)\s+platform/i);
          const taskType = taskTypeMatch ? taskTypeMatch[1] as CMSTaskType : null;
          const platform = platformMatch ? platformMatch[1] : null;

          // Get client info for the instructions
          let businessWebsite = '';
          let businessName = clientName;
          if (orderInfo) {
            const [clientDetails] = await db.select({
              businessWebsite: clients.businessWebsite,
              businessName: clients.businessName,
            }).from(clients).where(eq(clients.id, orderInfo.clientId)).limit(1);
            businessWebsite = clientDetails?.businessWebsite || '';
            businessName = clientDetails?.businessName || clientName;
          }

          if (taskType && platform && businessWebsite) {
            // Note: The actual deliverable content (robots.txt rules, llms.txt, schema JSON)
            // is stored in the deliverable record / generated PDF. The VA instructions use
            // placeholder content and instruct the VA to reference the deliverable attachment.
            vaInstructions = generateVAInstructions({
              platform,
              taskType,
              businessName,
              businessWebsite,
              content: `[See the generated deliverable attachment for the exact content to install. Deliverable: ${deliverableTitle}]`,
            });
          }
        } catch (vaErr) {
          console.warn(`[Escalation] VA instruction generation failed:`, vaErr);
        }

        const instructionSection = vaInstructions
          ? `\n\n--- VA INSTRUCTIONS ---\n${vaInstructions}`
          : '\n\nNo VA instructions template available for this platform/task combination.';

        await notifyOwner({
          title: `${subjectPrefix} Platform Limitation — ${clientName}`,
          content: `Client: ${clientName} (${pkg})\nDeliverable: ${deliverableTitle}\n\nPlatform does not support automated installation.\nManual completion required (VA task created).\n\nPlatform/Step: ${failureStep}\nDetails: ${lastError}\n\nThis was blocked immediately — no retries were wasted.${instructionSection}`,
        });
        console.log(`[Escalation] Created VA task + notified owner with instructions about platform limitation for ${clientName}`);
        break;
      }

      case 'plugin_missing':
      case 'editor_blocked': {
        // Need owner/VA to install a plugin or use different approach
        await notifyOwner({
          title: `${subjectPrefix} Plugin/Editor Issue — ${clientName}`,
          content: `Client: ${clientName} (${pkg})\nDeliverable: ${deliverableTitle}\n\nCMS automation failed because a required plugin is missing or the editor is blocked.\n\nFailed at: ${failureStep}\nError: ${lastError}\n\nOptions:\n1. Install required plugin (WPCode, Yoast, etc.) on client's site\n2. Use FTP/file manager approach\n3. Have VA do manual installation`,
        });
        console.log(`[Escalation] Notified owner about plugin/editor issue for ${clientName}`);
        break;
      }

      case 'timeout': {
        await notifyOwner({
          title: `${subjectPrefix} Repeated Timeout — ${clientName}`,
          content: `Client: ${clientName} (${pkg})\nDeliverable: ${deliverableTitle}\n\nCMS automation has timed out 5 times in a row.\n\nFailed at: ${failureStep}\nError: ${lastError}\n\nPossible causes: slow client website, Railway resource limits, network issues.`,
        });
        console.log(`[Escalation] Notified owner about repeated timeouts for ${clientName}`);
        break;
      }

      case 'api_outage_sustained': {
        // LLM API has been unavailable across many consecutive worker cycles.
        // The deliverable is NOT blocked (will resume when API recovers),
        // but the owner needs to know so they can decide whether to switch
        // providers, raise an Anthropic support ticket, or pause the worker.
        await notifyOwner({
          title: `${subjectPrefix} Sustained API Outage — ${clientName}`,
          content: `Client: ${clientName} (${pkg})\nDeliverable: ${deliverableTitle}\n\nThe Claude API has been unavailable across many consecutive worker cycles. The deliverable is still PENDING and will auto-resume when the API recovers — no retry burn.\n\nFailed at: ${failureStep}\nLatest error: ${lastError}\n\nSuggested actions:\n1. Check https://status.anthropic.com\n2. If down for > 24h, consider temporarily switching model/provider\n3. No action needed if Anthropic is already aware — the worker will pick this deliverable up automatically when the API is back.`,
        });
        console.log(`[Escalation] Notified owner about sustained API outage affecting ${clientName}'s deliverable`);
        break;
      }

      default: {
        await notifyOwner({
          title: `${subjectPrefix} Worker Failure — ${clientName}`,
          content: `Client: ${clientName} (${pkg})\nDeliverable: ${deliverableTitle}\n\nDeliverable failed with an unrecognized issue.\n\nCategory: ${failureCategory}\nFailed at: ${failureStep}\nError: ${lastError}\n\nNeeds manual investigation.`,
        });
        console.log(`[Escalation] Notified owner about unknown failure for ${clientName}`);
        break;
      }
    }
  } catch (error) {
    // Escalation should never crash the worker — log and move on
    console.error(`[Escalation] Failed to escalate deliverable #${deliverableId}:`, error);
  }
}

/**
 * Mark a deliverable as in_progress (before execution starts).
 * GUARD: Do NOT downgrade 'approved' or 'change_requested' deliverables —
 * they need to keep their status so the executor knows which pass to run.
 */
export async function markDeliverableInProgress(deliverableId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Check current status — don't overwrite approval-flow statuses
  const [current] = await db.select({ status: deliverables.status })
    .from(deliverables)
    .where(eq(deliverables.id, deliverableId))
    .limit(1);

  if (current?.status === 'approved' || current?.status === 'change_requested' || current?.status === 'pending_approval') {
    console.log(`[Session] Deliverable #${deliverableId} is '${current.status}' — keeping status for Pass 2 execution`);
    return;
  }

  await db.update(deliverables).set({
    status: 'in_progress',
  }).where(eq(deliverables.id, deliverableId));
}

/**
 * Create an action item for a blocked step — WITH DEDUPLICATION.
 *
 * Before inserting, checks if a pending action item with the same
 * (orderId + actionType + relatedDeliverableId) already exists.
 * If it does, skip the insert. This prevents the worker from stacking
 * 24+ identical "Need credentials" action items across cycles.
 *
 * Returns true if a new item was created, false if a duplicate was skipped.
 */
export async function createBlockerActionItem(
  orderId: number,
  deliverableId: number,
  blockerReason: string,
  priority: string = 'medium',
  actionType: 'verify_gbp' | 'provide_credentials' | 'review_content' | 'connect_website' | 'other' = 'other',
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Dedup: check for existing pending OR completed item for same deliverable.
  // Must check completed too — otherwise when a client completes an action item,
  // the next worker cycle won't find a pending one and creates a zombie duplicate.
  const existing = await db.select({ id: actionItems.id, status: actionItems.status })
    .from(actionItems)
    .where(
      and(
        eq(actionItems.orderId, orderId),
        eq(actionItems.relatedDeliverableId, deliverableId),
        inArray(actionItems.status, ['pending', 'completed'] as any),
      )
    )
    .limit(1);

  if (existing.length > 0) {
    console.log(`[Session] Skipping duplicate action item for deliverable #${deliverableId} — one already exists (#${existing[0].id}, status: ${existing[0].status})`);
    return false;
  }

  await db.insert(actionItems).values({
    orderId,
    actionType,
    title: `Action needed: ${blockerReason}`,
    description: blockerReason,
    status: 'pending',
    priority,
    relatedDeliverableId: deliverableId,
    bundledInMeeting: false,
  });
  return true;
}

/**
 * Deduplicated action item insert — used by ALL action item creation points.
 * Checks for existing pending item with same (orderId + relatedDeliverableId + actionType).
 * Returns true if new item created, false if duplicate skipped.
 */
export async function createActionItemIfNotExists(
  db: any,
  values: {
    orderId: number;
    actionType: string;
    title: string;
    description: string;
    status?: string;
    priority?: string;
    relatedDeliverableId?: number;
    /**
     * `true` (default) → renders in "Action Needed From You" section with a
     *   CTA button (the client must do something).
     * `false` → renders in "We're Handling This" section, informational only,
     *   no CTA button. Use for "no action needed from you, our team is on it"
     *   escalations like SSO failures, platform limitations, etc.
     */
    requiresClientAction?: boolean;
    bundledInMeeting?: boolean;
  },
): Promise<boolean> {
  // Check for existing items in ANY active state — pending OR completed.
  // This prevents recreating action items that the client already completed.
  const conditions = [
    eq(actionItems.orderId, values.orderId),
    eq(actionItems.actionType, values.actionType as any),
    inArray(actionItems.status, ['pending', 'completed'] as any),
  ];

  // If there's a related deliverable, dedup on that too
  if (values.relatedDeliverableId) {
    conditions.push(eq(actionItems.relatedDeliverableId, values.relatedDeliverableId));
  }

  const existing = await db.select({ id: actionItems.id })
    .from(actionItems)
    .where(and(...conditions))
    .limit(1);

  if (existing.length > 0) {
    console.log(`[Session] Skipping duplicate '${values.actionType}' action item for order #${values.orderId} — already exists (#${existing[0].id})`);
    return false;
  }

  await db.insert(actionItems).values({
    ...values,
    status: values.status || 'pending',
    priority: values.priority || 'medium',
    requiresClientAction: values.requiresClientAction ?? true,
    bundledInMeeting: values.bundledInMeeting || false,
  });
  console.log(`[Session] Created '${values.actionType}' action item for order #${values.orderId}: ${values.title} (requiresClientAction=${values.requiresClientAction ?? true})`);
  return true;
}

/**
 * Set a deliverable to 'pending_approval' status.
 * Creates a 'review_content' action item and sends an approval request email.
 * Used by executors that modify the client's website (FAQ install, schema install, etc.)
 */
export async function setDeliverablePendingApproval(
  orderId: number,
  deliverableId: number,
  previewUrl: string,
  previewDescription: string,
  /**
   * Optional override for the action-item title. Default ("Review & Approve
   * Website Changes") fits CMS-modifying deliverables (FAQ install, schema
   * install, etc). Pass an alternative for non-CMS deliverables — e.g.
   * guest-post drafts use "Review & Approve Article Drafts."
   */
  actionItemTitle: string = 'Review & Approve Website Changes',
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Guard: only transition from valid states (pending, in_progress)
  const [current] = await db.select({ status: deliverables.status })
    .from(deliverables)
    .where(eq(deliverables.id, deliverableId))
    .limit(1);

  if (current && current.status !== 'pending' && current.status !== 'in_progress' && current.status !== 'change_requested') {
    console.warn(`[Session] Cannot set deliverable #${deliverableId} to pending_approval — current status is '${current.status}'`);
    return;
  }

  // Update deliverable status to pending_approval with preview URL
  await db.update(deliverables).set({
    status: 'pending_approval',
    approvalPreviewUrl: previewUrl,
    progressPercent: 90, // Content generated, just needs approval
  }).where(eq(deliverables.id, deliverableId));

  // Create a review_content action item linked to this deliverable (with dedup)
  await createActionItemIfNotExists(db, {
    orderId,
    actionType: 'review_content',
    title: actionItemTitle,
    description: previewDescription,
    priority: 'high',
    relatedDeliverableId: deliverableId,
  });

  console.log(`[Session] Deliverable #${deliverableId} set to pending_approval — awaiting client review`);
}

/**
 * Check if a client has completed any action items since last check.
 * If so, unblock the related deliverables.
 */
export async function processCompletedActionItems(context: SessionContext): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  let unblockedCount = 0;

  for (const item of context.actionItems) {
    if (item.status !== 'completed') continue;
    if (!item.relatedDeliverableId) continue;

    // Find the blocked deliverable
    const blocked = context.blockedSteps.find(d => d.id === item.relatedDeliverableId);
    if (blocked) {
      await db.update(deliverables).set({
        status: 'pending',
        blockerReason: null,
        blockerCreatedAt: null,
      }).where(eq(deliverables.id, blocked.id));
      unblockedCount++;
      console.log(`[Session] Unblocked deliverable ${blocked.deliverableType} (action item completed)`);
    }
  }

  return unblockedCount;
}

/**
 * Build a summary string of the current context for logging/debugging.
 */
export function summarizeContext(context: SessionContext): string {
  return [
    `Order #${context.order.id} (${context.order.packageType}) for ${context.client.businessName}`,
    `Progress: ${context.completedCount}/${context.totalDeliverables} (${context.progressPercent}%)`,
    `Status: ${context.pendingSteps.length} pending, ${context.inProgressSteps.length} in-progress, ${context.changeRequestedSteps.length} change-requested, ${context.pendingApprovalSteps.length} awaiting-approval, ${context.approvedSteps.length} approved, ${context.blockedCount} blocked`,
    `Next step: ${context.nextStep?.deliverableType || 'none'}`,
    `Credentials: ${context.credentials.length} stored`,
    `Messages: ${context.recentMessages.length} recent`,
    `Files: ${context.clientFiles.length} uploaded`,
    `Support tickets: ${context.supportTicketHistory.length} tickets`,
  ].join(' | ');
}
