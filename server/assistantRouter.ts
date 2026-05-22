/**
 * Assistant (VA) Router
 *
 * tRPC endpoints for the VA assistant dashboard at /assistant.
 * VAs can view their directory submission assignments, download SOP PDFs,
 * start/complete assignments, and report issues.
 *
 * Access: users with role "assistant" or "admin"
 */

import { assistantProcedure, router, adminProcedure } from "./_core/trpc";
// Note: markVerified uses adminProcedure — only admins can verify VA work
import { z } from "zod";
import { getDb } from "./db";
import { vaAssignments, clients, orders, directorySubmissions, vaSubmissionFiles, vaMessages, redditDrafts, redditThreads, users } from "../drizzle/schema";
import { eq, desc, and, sql, isNull } from "drizzle-orm";
import { invokeLLM } from "./_core/claude";
import type { Message } from "./_core/claude";

// H9: Allowed MIME types for VA submission uploads
const ALLOWED_SUBMISSION_MIMES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
  "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]);

export const assistantRouter = router({
  // ── Queries ──────────────────────────────────────────────────

  /** Get stats for the assistant dashboard header */
  getStats: assistantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { pending: 0, inProgress: 0, submitted: 0, verified: 0, failed: 0, total: 0 };

    const isAdmin = ctx.user.role === 'admin';

    // Use SQL-level filtering instead of loading all rows into memory
    const whereClause = isAdmin
      ? undefined
      : sql`(${vaAssignments.assignedToUserId} = ${ctx.user.id} OR ${vaAssignments.assignedToUserId} IS NULL)`;

    const rows = whereClause
      ? await db.select({ status: vaAssignments.status }).from(vaAssignments).where(whereClause)
      : await db.select({ status: vaAssignments.status }).from(vaAssignments);

    return {
      pending: rows.filter(a => a.status === 'pending').length,
      inProgress: rows.filter(a => a.status === 'in_progress').length,
      submitted: rows.filter(a => a.status === 'submitted').length,
      verified: rows.filter(a => a.status === 'verified').length,
      failed: rows.filter(a => a.status === 'failed').length,
      total: rows.length,
    };
  }),

  /** Get all assignments visible to this assistant */
  getAssignments: assistantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const isAdmin = ctx.user.role === 'admin';

    // Use SQL-level WHERE instead of loading all + filtering in JS
    const whereClause = isAdmin
      ? undefined
      : sql`(${vaAssignments.assignedToUserId} = ${ctx.user.id} OR ${vaAssignments.assignedToUserId} IS NULL)`;

    const query = db
      .select({
        id: vaAssignments.id,
        orderId: vaAssignments.orderId,
        clientId: vaAssignments.clientId,
        directoryName: vaAssignments.directoryName,
        assignedToUserId: vaAssignments.assignedToUserId,
        status: vaAssignments.status,
        sopPdfUrl: vaAssignments.sopPdfUrl,
        submissionUrl: vaAssignments.submissionUrl,
        submissionAccount: vaAssignments.submissionAccount,
        notes: vaAssignments.notes,
        startedAt: vaAssignments.startedAt,
        completedAt: vaAssignments.completedAt,
        createdAt: vaAssignments.createdAt,
        updatedAt: vaAssignments.updatedAt,
        // Client info
        businessName: clients.businessName,
        clientName: clients.fullName,
        clientEmail: clients.email,
        clientPhone: clients.phone,
        businessWebsite: clients.businessWebsite,
        servicesOffered: clients.servicesOffered,
        industry: clients.industry,
        businessAddress: clients.businessAddress,
        targetLocation: clients.targetLocation,
      })
      .from(vaAssignments)
      .leftJoin(clients, eq(vaAssignments.clientId, clients.id));

    const assignments = whereClause
      ? await query.where(whereClause).orderBy(desc(vaAssignments.createdAt))
      : await query.orderBy(desc(vaAssignments.createdAt));

    return assignments;
  }),

  /** Get single assignment detail with full client info */
  getAssignmentDetail: assistantProcedure
    .input(z.object({ assignmentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [assignment] = await db
        .select()
        .from(vaAssignments)
        .where(eq(vaAssignments.id, input.assignmentId))
        .limit(1);

      if (!assignment) throw new Error("Assignment not found");

      // Check access: admin sees all, assistant sees own or unassigned
      if (ctx.user.role !== 'admin' && assignment.assignedToUserId !== null && assignment.assignedToUserId !== ctx.user.id) {
        throw new Error("Access denied");
      }

      // Get full client record
      const [client] = await db
        .select()
        .from(clients)
        .where(eq(clients.id, assignment.clientId))
        .limit(1);

      return {
        ...assignment,
        client: client || null,
      };
    }),

  // ── Mutations ─────────────────────────────────────────────────

  /** VA picks up an assignment — marks as in_progress (atomic to prevent race conditions) */
  startAssignment: assistantProcedure
    .input(z.object({ assignmentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Atomic UPDATE with WHERE status check to prevent race conditions
      // Two VAs clicking "Start" simultaneously: only one succeeds
      const result = await db
        .update(vaAssignments)
        .set({
          status: 'in_progress',
          assignedToUserId: ctx.user.id,
          startedAt: new Date(),
        })
        .where(and(
          eq(vaAssignments.id, input.assignmentId),
          eq(vaAssignments.status, 'pending'),
        ));

      // Check if any row was actually updated (MySQL returns affectedRows)
      const affectedRows = (result as any)[0]?.affectedRows ?? (result as any).affectedRows ?? 0;
      if (affectedRows === 0) {
        // Either not found or already claimed
        const [assignment] = await db
          .select()
          .from(vaAssignments)
          .where(eq(vaAssignments.id, input.assignmentId))
          .limit(1);

        if (!assignment) throw new Error("Assignment not found");
        throw new Error("Assignment has already been claimed by another assistant");
      }

      return { success: true };
    }),

  /** VA completes a submission — marks as submitted with URL */
  completeAssignment: assistantProcedure
    .input(z.object({
      assignmentId: z.number(),
      submissionUrl: z.string().max(500).optional(),
      submissionAccount: z.string().max(255).optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [assignment] = await db
        .select()
        .from(vaAssignments)
        .where(eq(vaAssignments.id, input.assignmentId))
        .limit(1);

      if (!assignment) throw new Error("Assignment not found");
      if (assignment.status !== 'in_progress') throw new Error("Assignment must be in progress to complete");

      // Ownership check: only the assigned VA or admin can complete
      if (ctx.user.role !== 'admin' && assignment.assignedToUserId !== ctx.user.id) {
        throw new Error("You can only complete assignments assigned to you");
      }

      await db
        .update(vaAssignments)
        .set({
          status: 'submitted',
          submissionUrl: input.submissionUrl || assignment.submissionUrl,
          submissionAccount: input.submissionAccount || assignment.submissionAccount,
          notes: input.notes || assignment.notes,
          completedAt: new Date(),
        })
        .where(eq(vaAssignments.id, input.assignmentId));

      // Update directorySubmissions with meaningful status
      try {
        const dirSubs = await db
          .select()
          .from(directorySubmissions)
          .where(
            and(
              eq(directorySubmissions.orderId, assignment.orderId),
              eq(directorySubmissions.directoryName, assignment.directoryName)
            )
          )
          .limit(1);

        if (dirSubs.length > 0) {
          // Directories that require phone/identity verification from the business
          const PHONE_VERIFY_DIRS = ['bbb', 'yelp', 'bingplaces', 'applemapsconnect'];
          const dirNorm = assignment.directoryName.toLowerCase().replace(/[^a-z]/g, '');
          const needsPhoneVerify = PHONE_VERIFY_DIRS.some(d => dirNorm.includes(d));

          const verificationMsg = needsPhoneVerify
            ? `We've submitted your ${assignment.directoryName} listing. They will contact your business to verify — please answer any verification calls or emails from ${assignment.directoryName}.`
            : `We've submitted your ${assignment.directoryName} listing. Awaiting directory approval — this typically takes 1-5 business days.`;

          await db
            .update(directorySubmissions)
            .set({
              submissionUrl: input.submissionUrl || null,
              verificationInstructions: verificationMsg,
            })
            .where(eq(directorySubmissions.id, dirSubs[0].id));

          // Auto-notify client if verification requires their action (phone call, etc.)
          if (needsPhoneVerify) {
            try {
              const { clientMessages } = await import('../drizzle/schema');
              await db.insert(clientMessages).values({
                clientId: assignment.clientId,
                orderId: assignment.orderId,
                senderType: 'agent',
                message: `Great news! We've submitted your business to ${assignment.directoryName}. 📞 **Important**: ${assignment.directoryName} will call or email your business to verify the listing. Please make sure to answer any verification calls or respond to verification emails from them. This is the final step to get your listing live!`,
                isRead: false,
                isProcessed: false,
                emailSent: false,
              });
              console.log(`[Assistant] Sent verification notification to client ${assignment.clientId} for ${assignment.directoryName}`);
            } catch (msgErr) {
              console.warn('[Assistant] Failed to send verification notification:', msgErr);
            }
          }
        }
      } catch (e) {
        console.warn('[Assistant] Failed to update directorySubmissions:', e);
      }

      return { success: true };
    }),

  /** Admin-only: marks a submission as verified after reviewing VA work */
  markVerified: adminProcedure
    .input(z.object({ assignmentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [assignment] = await db
        .select()
        .from(vaAssignments)
        .where(eq(vaAssignments.id, input.assignmentId))
        .limit(1);

      if (!assignment) throw new Error("Assignment not found");
      if (assignment.status !== 'submitted') throw new Error("Assignment must be in 'submitted' status to verify");

      await db
        .update(vaAssignments)
        .set({ status: 'verified' })
        .where(eq(vaAssignments.id, input.assignmentId));

      // NOW mark directorySubmissions as completed (verified = truly done)
      try {
        await db
          .update(directorySubmissions)
          .set({
            status: 'completed',
            completedAt: new Date(),
          })
          .where(
            and(
              eq(directorySubmissions.orderId, assignment.orderId),
              eq(directorySubmissions.directoryName, assignment.directoryName)
            )
          );
      } catch (e) {
        console.warn('[Assistant] Failed to update directorySubmissions on verify:', e);
      }

      return { success: true };
    }),

  /** VA reports an issue with an assignment */
  reportIssue: assistantProcedure
    .input(z.object({
      assignmentId: z.number(),
      issue: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Fetch assignment first for ownership check
      const [assignment] = await db
        .select()
        .from(vaAssignments)
        .where(eq(vaAssignments.id, input.assignmentId))
        .limit(1);

      if (!assignment) throw new Error("Assignment not found");

      // Ownership check: only the assigned VA, unassigned, or admin can report issues
      if (ctx.user.role !== 'admin' && assignment.assignedToUserId !== null && assignment.assignedToUserId !== ctx.user.id) {
        throw new Error("You can only report issues on assignments assigned to you");
      }

      await db
        .update(vaAssignments)
        .set({
          status: 'failed',
          notes: input.issue,
        })
        .where(eq(vaAssignments.id, input.assignmentId));

      // Update directorySubmissions to failed as well
      try {
        await db
          .update(directorySubmissions)
          .set({
            status: 'failed',
            errorMessage: `VA reported issue: ${input.issue}`,
          })
          .where(
            and(
              eq(directorySubmissions.orderId, assignment.orderId),
              eq(directorySubmissions.directoryName, assignment.directoryName)
            )
          );
      } catch (e) {
        console.warn('[Assistant] Failed to update directorySubmissions:', e);
      }

      return { success: true };
    }),

  // ── File Uploads for Submissions ──────────────────────────────

  /** Upload a screenshot/document when submitting an assignment */
  uploadSubmissionFile: assistantProcedure
    .input(z.object({
      assignmentId: z.number(),
      fileName: z.string().max(255),
      mimeType: z.string().refine(
        (t) => ALLOWED_SUBMISSION_MIMES.has(t),
        { message: "File type not allowed" }
      ),
      fileSize: z.number().max(10 * 1024 * 1024, "File size must be under 10MB"),
      fileData: z.string(), // Base64 encoded
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify assignment exists and belongs to this VA
      const [assignment] = await db
        .select()
        .from(vaAssignments)
        .where(eq(vaAssignments.id, input.assignmentId))
        .limit(1);

      if (!assignment) throw new Error("Assignment not found");
      if (ctx.user.role !== 'admin' && assignment.assignedToUserId !== ctx.user.id) {
        throw new Error("You can only upload files for your own assignments");
      }

      // Only allow uploads for in-progress or submitted assignments
      if (!['in_progress', 'submitted'].includes(assignment.status)) {
        throw new Error("Files can only be uploaded for in-progress or submitted assignments");
      }

      // Decode base64
      const fileBuffer = Buffer.from(input.fileData, "base64");

      // Generate unique key
      const crypto = await import("crypto");
      const randomSuffix = crypto.randomBytes(8).toString("hex");
      const sanitizedName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileKey = `va-submissions/${assignment.id}/${randomSuffix}-${sanitizedName}`;

      // Upload to storage
      const { storagePut } = await import("./storage");
      const { url } = await storagePut(`client-files/${fileKey}`, fileBuffer, input.mimeType);

      // Save record
      await db.insert(vaSubmissionFiles).values({
        assignmentId: input.assignmentId,
        fileName: sanitizedName,
        originalName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        fileKey,
        url,
      });

      return { success: true, url };
    }),

  /** Get all submission files for an assignment */
  getSubmissionFiles: assistantProcedure
    .input(z.object({ assignmentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      // Verify access
      const [assignment] = await db
        .select()
        .from(vaAssignments)
        .where(eq(vaAssignments.id, input.assignmentId))
        .limit(1);

      if (!assignment) throw new Error("Assignment not found");
      if (ctx.user.role !== 'admin' && assignment.assignedToUserId !== null && assignment.assignedToUserId !== ctx.user.id) {
        throw new Error("Access denied");
      }

      return db
        .select()
        .from(vaSubmissionFiles)
        .where(eq(vaSubmissionFiles.assignmentId, input.assignmentId))
        .orderBy(desc(vaSubmissionFiles.createdAt));
    }),

  /** Delete a submission file (before final submit) */
  deleteSubmissionFile: assistantProcedure
    .input(z.object({ fileId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [file] = await db
        .select()
        .from(vaSubmissionFiles)
        .where(eq(vaSubmissionFiles.id, input.fileId))
        .limit(1);

      if (!file) throw new Error("File not found");

      // Verify ownership via assignment
      const [assignment] = await db
        .select()
        .from(vaAssignments)
        .where(eq(vaAssignments.id, file.assignmentId))
        .limit(1);

      if (!assignment) throw new Error("Assignment not found");
      if (ctx.user.role !== 'admin' && assignment.assignedToUserId !== ctx.user.id) {
        throw new Error("Access denied");
      }

      // Delete from cloud storage first (best-effort; DB record is the authority)
      try {
        const { storageDelete } = await import("./storage");
        await storageDelete(`client-files/${file.fileKey}`);
      } catch (e) {
        console.warn('[Assistant] Failed to delete file from storage:', e);
      }

      await db.delete(vaSubmissionFiles).where(eq(vaSubmissionFiles.id, input.fileId));

      return { success: true };
    }),

  // ── AI Chat for VAs ─────────────────────────────────────────

  /** Get chat message history for an assignment */
  getVaMessages: assistantProcedure
    .input(z.object({ assignmentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      // Verify access
      const [assignment] = await db
        .select()
        .from(vaAssignments)
        .where(eq(vaAssignments.id, input.assignmentId))
        .limit(1);

      if (!assignment) throw new Error("Assignment not found");
      if (ctx.user.role !== 'admin' && assignment.assignedToUserId !== null && assignment.assignedToUserId !== ctx.user.id) {
        throw new Error("Access denied");
      }

      return db
        .select()
        .from(vaMessages)
        .where(eq(vaMessages.assignmentId, input.assignmentId))
        .orderBy(vaMessages.createdAt)
        .limit(200); // Cap at 200 messages to prevent unbounded queries
    }),

  /** Send a message to the AI assistant (scoped to assignment client data) */
  sendVaMessage: assistantProcedure
    .input(z.object({
      assignmentId: z.number(),
      message: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Fetch assignment
      const [assignment] = await db
        .select()
        .from(vaAssignments)
        .where(eq(vaAssignments.id, input.assignmentId))
        .limit(1);

      if (!assignment) throw new Error("Assignment not found");
      if (ctx.user.role !== 'admin' && assignment.assignedToUserId !== null && assignment.assignedToUserId !== ctx.user.id) {
        throw new Error("Access denied");
      }

      // Load full client record
      const [client] = await db
        .select()
        .from(clients)
        .where(eq(clients.id, assignment.clientId))
        .limit(1);

      if (!client) throw new Error("Client not found");

      // Save user message
      await db.insert(vaMessages).values({
        assignmentId: input.assignmentId,
        userId: ctx.user.id,
        role: 'user',
        content: input.message,
      });

      // Load conversation history (most recent 20 messages for context window)
      // Must order DESC to get the latest, then reverse for chronological order
      const historyDesc = await db
        .select()
        .from(vaMessages)
        .where(eq(vaMessages.assignmentId, input.assignmentId))
        .orderBy(desc(vaMessages.createdAt))
        .limit(20);
      const history = historyDesc.reverse(); // Chronological order for LLM

      // Build system prompt with client data + strict safeguards
      const systemPrompt = `You are a helpful assistant for directory submission work. A virtual assistant (VA) is submitting the business "${client.businessName}" to the directory "${assignment.directoryName}".

Here is the complete client information:
- Business Name: ${client.businessName}
- Contact Name: ${client.fullName}
- Email: ${client.email}
- Phone: ${client.phone || 'Not provided'}
- Website: ${client.businessWebsite || 'Not provided'}
- Business Address: ${client.businessAddress || 'Not provided'}
- Industry: ${client.industry || 'Not provided'}
- Services Offered: ${client.servicesOffered || 'Not provided'}
- Target Location/Service Area: ${client.targetLocation || 'Not provided'}
- Google Profile: ${client.googleProfileUrl || 'Not provided'}
- CMS Type: ${client.cmsType || 'Not provided'}
- Additional Goals: ${client.additionalGoals || 'Not provided'}

Directory Assignment:
- Directory: ${assignment.directoryName}
- Status: ${assignment.status}

RULES:
1. You can ONLY answer questions about this client's data and the directory submission process.
2. You CANNOT make any changes to any system, database, website, or configuration.
3. You CANNOT execute any commands or modify any files.
4. If asked to do anything beyond answering questions, politely decline and explain you are a read-only assistant.
5. Be helpful, concise, and practical. Focus on actionable advice for the VA.
6. When generating business descriptions, keep them professional and accurate based on the data above.
7. If you notice potential data issues (fake phone numbers, incomplete addresses), flag them clearly.`;

      // Build messages array for LLM
      const llmMessages: Message[] = [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ];

      // Call Claude API (wrapped in try/catch to handle LLM failures gracefully)
      let aiResponse: string;
      try {
        const result = await invokeLLM({
          messages: llmMessages,
          maxTokens: 2048,
          temperature: 0.7,
        });
        aiResponse = result.choices[0]?.message?.content || 'Sorry, I was unable to generate a response.';
      } catch (llmError) {
        console.error('[VA Chat] LLM call failed:', llmError);
        aiResponse = 'Sorry, I was unable to process your request right now. Please try again in a moment.';
      }

      // Save assistant message
      await db.insert(vaMessages).values({
        assignmentId: input.assignmentId,
        userId: ctx.user.id,
        role: 'assistant',
        content: aiResponse,
      });

      return { response: aiResponse };
    }),

  // ── Admin-only: manage assistant accounts & assignments ──────

  /** Admin: create a new assistant user invite */
  createAssistant: adminProcedure
    .input(z.object({
      email: z.string().email().max(320),
      name: z.string().min(1).max(255),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { users } = await import('../drizzle/schema');

      // Check if user already exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existing.length > 0) {
        // Update role to assistant
        await db
          .update(users)
          .set({ role: 'assistant', name: input.name })
          .where(eq(users.id, existing[0].id));
        return { success: true, userId: existing[0].id, message: 'Existing user updated to assistant role' };
      }

      // Create new user with assistant role — they'll complete setup via magic link
      const result = await db.insert(users).values({
        openId: `pending_${Date.now()}`, // Will be replaced when they log in via Supabase
        email: input.email,
        name: input.name,
        role: 'assistant',
        loginMethod: 'magic_link',
      });

      return { success: true, userId: result[0].insertId, message: 'Assistant account created. Send them a login link.' };
    }),

  /** Admin: reassign an assignment to a different VA (also used to retry failed) */
  reassignAssignment: adminProcedure
    .input(z.object({
      assignmentId: z.number(),
      assignToUserId: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get current assignment for directorySubmissions sync
      const [assignment] = await db
        .select()
        .from(vaAssignments)
        .where(eq(vaAssignments.id, input.assignmentId))
        .limit(1);

      if (!assignment) throw new Error("Assignment not found");

      // Reset to pending with clean slate
      await db
        .update(vaAssignments)
        .set({
          assignedToUserId: input.assignToUserId,
          status: 'pending',
          startedAt: null,
          completedAt: null,
          submissionUrl: null,
          submissionAccount: null,
          notes: null,
        })
        .where(eq(vaAssignments.id, input.assignmentId));

      // Also reset directorySubmissions back to in_progress (if it was failed)
      try {
        await db
          .update(directorySubmissions)
          .set({
            status: 'in_progress',
            errorMessage: null,
          })
          .where(
            and(
              eq(directorySubmissions.orderId, assignment.orderId),
              eq(directorySubmissions.directoryName, assignment.directoryName)
            )
          );
      } catch (e) {
        console.warn('[Assistant] Failed to reset directorySubmissions on reassign:', e);
      }

      // Email the assigned VA about their new task
      if (input.assignToUserId) {
        try {
          const [vaUser] = await db.select({ email: users.email, name: users.name })
            .from(users).where(eq(users.id, input.assignToUserId)).limit(1);

          // Look up client name for the email
          const [clientInfo] = await db.select({ businessName: clients.businessName })
            .from(clients).where(eq(clients.id, assignment.clientId)).limit(1);
          const clientName = clientInfo?.businessName || 'Unknown Client';

          if (vaUser?.email) {
            const { sendEmail } = await import('./_core/email');
            await sendEmail({
              to: vaUser.email,
              subject: `New Assignment: ${assignment.directoryName} for ${clientName}`,
              body: `Hi ${vaUser.name || 'there'},\n\nYou've been assigned a directory submission task.\n\nDirectory: ${assignment.directoryName}\nClient: ${clientName}\nSOP PDF: ${assignment.sopPdfUrl || 'N/A'}\n\nLog in to your assistant portal to get started.\n\n— SuggestedByGPT Worker`,
            });
            console.log(`[Assistant] Notified VA ${vaUser.email} about assignment #${input.assignmentId}`);
          }
        } catch (emailErr) {
          console.warn('[Assistant] Failed to email VA about assignment:', emailErr);
        }
      }

      return { success: true };
    }),

  // ── Reddit Draft Endpoints ───────────────────────────────────────────────

  getRedditStats: assistantProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { pending: 0, claimed: 0, posted: 0, rejected: 0, expired: 0, total: 0 };

    const [stats] = await db.select({
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      claimed: sql<number>`SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END)`,
      posted: sql<number>`SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END)`,
      rejected: sql<number>`SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)`,
      expired: sql<number>`SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END)`,
      total: sql<number>`COUNT(*)`,
    }).from(redditDrafts);

    return {
      pending: Number(stats?.pending) || 0,
      claimed: Number(stats?.claimed) || 0,
      posted: Number(stats?.posted) || 0,
      rejected: Number(stats?.rejected) || 0,
      expired: Number(stats?.expired) || 0,
      total: Number(stats?.total) || 0,
    };
  }),

  getRedditDrafts: assistantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    // Show: pending (unclaimed), claimed by this VA, and recently posted
    const drafts = await db.select({
      id: redditDrafts.id,
      threadId: redditDrafts.threadId,
      clientId: redditDrafts.clientId,
      orderId: redditDrafts.orderId,
      draftText: redditDrafts.draftText,
      includesLink: redditDrafts.includesLink,
      toneCategory: redditDrafts.toneCategory,
      assignedToUserId: redditDrafts.assignedToUserId,
      status: redditDrafts.status,
      batchNumber: redditDrafts.batchNumber,
      createdAt: redditDrafts.createdAt,
      // Thread info joined
      subredditName: redditThreads.subredditName,
      threadTitle: redditThreads.threadTitle,
      threadUrl: redditThreads.threadUrl,
      // Client info
      businessName: clients.businessName,
    })
      .from(redditDrafts)
      .innerJoin(redditThreads, eq(redditDrafts.threadId, redditThreads.id))
      .innerJoin(orders, eq(redditDrafts.orderId, orders.id))
      .innerJoin(clients, eq(orders.clientId, clients.id))
      .where(
        sql`${redditDrafts.status} IN ('pending', 'claimed')`,
      )
      .orderBy(desc(redditDrafts.createdAt));

    // For non-admin VAs, show only pending (unclaimed) + their own claimed
    if (ctx.user.role !== 'admin') {
      return drafts.filter(
        d => d.status === 'pending' || d.assignedToUserId === ctx.user.id,
      );
    }

    return drafts;
  }),

  claimRedditDraft: assistantProcedure
    .input(z.object({ draftId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false, error: 'Database unavailable' };

      // Atomic claim — only succeeds if status is still 'pending'
      const result = await db.update(redditDrafts).set({
        status: 'claimed',
        assignedToUserId: ctx.user.id,
        updatedAt: new Date(),
      }).where(and(
        eq(redditDrafts.id, input.draftId),
        eq(redditDrafts.status, 'pending'),
      ));

      const affected = (result as any)[0]?.affectedRows ?? (result as any).rowsAffected ?? 0;
      if (affected === 0) {
        return { success: false, error: 'Draft already claimed by another VA' };
      }

      return { success: true };
    }),

  markRedditPosted: assistantProcedure
    .input(z.object({ draftId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false, error: 'Database unavailable' };

      // Critical fix: verify VA ownership + status in one atomic update
      const result2 = await db.update(redditDrafts).set({
        status: 'posted',
        postedAt: new Date(),
        postedByUserId: ctx.user.id,
        updatedAt: new Date(),
      }).where(and(
        eq(redditDrafts.id, input.draftId),
        eq(redditDrafts.status, 'claimed'),
        eq(redditDrafts.assignedToUserId, ctx.user.id),
      ));

      const affected2 = (result2 as any)[0]?.affectedRows ?? (result2 as any).rowsAffected ?? 0;
      if (affected2 === 0) {
        return { success: false, error: 'Draft not found or not claimed by you' };
      }

      // Update thread status
      const [draft2] = await db.select({ threadId: redditDrafts.threadId })
        .from(redditDrafts).where(eq(redditDrafts.id, input.draftId)).limit(1);
      if (draft2) {
        await db.update(redditThreads).set({ status: 'posted' })
          .where(eq(redditThreads.id, draft2.threadId));
      }

      return { success: true };
    }),

  rejectRedditDraft: assistantProcedure
    .input(z.object({
      draftId: z.number(),
      reason: z.enum([
        'thread_locked',
        'thread_deleted',
        'subreddit_removed_post',
        'reddit_account_suspended',
        'other',
      ]),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false, error: 'Database unavailable' };

      const reasonMap: Record<string, string> = {
        thread_locked: 'Thread is locked — cannot reply',
        thread_deleted: 'Thread was deleted',
        subreddit_removed_post: 'Subreddit removed the post',
        reddit_account_suspended: 'Reddit account was suspended',
        other: input.notes || 'Other issue',
      };

      // Critical fix: only allow rejecting drafts that are claimed by THIS VA
      const rejectResult = await db.update(redditDrafts).set({
        status: 'rejected',
        rejectionReason: reasonMap[input.reason] || input.reason,
        updatedAt: new Date(),
      }).where(and(
        eq(redditDrafts.id, input.draftId),
        eq(redditDrafts.status, 'claimed'),
        eq(redditDrafts.assignedToUserId, ctx.user.id),
      ));

      const rejectAffected = (rejectResult as any)[0]?.affectedRows ?? (rejectResult as any).rowsAffected ?? 0;
      if (rejectAffected === 0) {
        return { success: false, error: 'Draft not found or not claimed by you' };
      }

      // Mark thread as skipped
      const [draftForThread] = await db.select({ threadId: redditDrafts.threadId })
        .from(redditDrafts).where(eq(redditDrafts.id, input.draftId)).limit(1);
      if (draftForThread) {
        await db.update(redditThreads).set({ status: 'skipped' })
          .where(eq(redditThreads.id, draftForThread.threadId));
      }

      return { success: true };
    }),
});
