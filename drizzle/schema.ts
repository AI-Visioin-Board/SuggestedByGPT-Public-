import { int, json, mysqlEnum, mysqlTable, text, longtext, timestamp, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "assistant"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Client Portal Tables
 */

// Clients table - stores business information from intake form
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().default(0), // 0 = not yet linked; set on OAuth login via linkClientToUser()
  fullName: varchar("fullName", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  businessName: varchar("businessName", { length: 255 }).notNull(),
  businessWebsite: varchar("businessWebsite", { length: 500 }),
  industry: varchar("industry", { length: 255 }),
  businessAddress: text("businessAddress"),
  targetLocation: text("targetLocation"),
  servicesOffered: text("servicesOffered"),
  cmsType: varchar("cmsType", { length: 100 }), // WordPress, Wix, Squarespace, etc.
  hasGoogleProfile: boolean("hasGoogleProfile").default(false),
  googleProfileUrl: varchar("googleProfileUrl", { length: 500 }),
  competitors: text("competitors"), // Comma-separated URLs
  additionalGoals: text("additionalGoals"),
  meetingRequestedAt: timestamp("meetingRequestedAt"),
  meetingScheduledAt: timestamp("meetingScheduledAt"),
  onboardingCompleted: boolean("onboardingCompleted").default(false),
  noCmsBackend: boolean("noCmsBackend").default(false).notNull(), // Client has no CMS/backend — CMS deliverables permanently locked
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

// Orders table - tracks package purchases
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  packageType: mysqlEnum("packageType", ["jumpstart", "dominator", "assessment"]).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "in_progress", "completed", "cancelled"]).default("pending").notNull(),
  stripePaymentId: varchar("stripePaymentId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  subscriptionStatus: varchar("subscriptionStatus", { length: 50 }),
  subscriptionEndDate: timestamp("subscriptionEndDate"),
  welcomeEmailSent: boolean("welcomeEmailSent").default(false).notNull(),
  tosConsentId: int("tosConsentId"), // FK to tos_consents — links order to electronic consent record
  upgradedFromPackage: varchar("upgradedFromPackage", { length: 50 }), // "jumpstart" when upgraded to dominator
  upgradedAt: timestamp("upgradedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

// Deliverables table - individual work items
export const deliverables = mysqlTable("deliverables", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  deliverableType: varchar("deliverableType", { length: 100 }).notNull(), // ai_assessment, schema_markup, etc.
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "blocked", "pending_approval", "approved", "change_requested"]).default("pending").notNull(),
  progressPercent: int("progressPercent").default(0),
  stepIndex: int("stepIndex").default(0),
  fileUrl: varchar("fileUrl", { length: 500 }), // S3 URL to downloadable file
  completedAt: timestamp("completedAt"),
  notes: text("notes"), // Instructions or notes for client
  blockerReason: text("blockerReason"),
  blockerCreatedAt: timestamp("blockerCreatedAt"),
  retryCount: int("retryCount").default(0).notNull(), // Track failed attempts
  approvalPreviewUrl: varchar("approvalPreviewUrl", { length: 500 }), // URL to preview HTML showing proposed changes
  approvalFeedback: text("approvalFeedback"), // Client's rejection feedback if they request changes
  generatedContent: text("generatedContent"), // Raw markdown/text of the work product (for AI chat context)
});

export type Deliverable = typeof deliverables.$inferSelect;
export type InsertDeliverable = typeof deliverables.$inferInsert;

// Client credentials - securely stores access credentials (will be encrypted in app layer)
export const clientCredentials = mysqlTable("client_credentials", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  credentialType: mysqlEnum("credentialType", ["website_cms", "google_account", "domain_registrar", "other", "sbgpt_plugin"]).notNull(),
  serviceName: varchar("serviceName", { length: 255 }), // e.g., "WordPress", "GoDaddy"
  username: text("username"), // Will be encrypted in application layer
  password: text("password"), // Will be encrypted in application layer
  additionalInfo: text("additionalInfo"), // Any extra info (2FA codes, etc.)
  isVerified: boolean("isVerified").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientCredential = typeof clientCredentials.$inferSelect;
export type InsertClientCredential = typeof clientCredentials.$inferInsert;

// Action items - things the client needs to do (or that the client should be
// aware of, even if no action is required from them).
//
// `requiresClientAction` distinguishes:
//   - true  → "Action Needed From You" (CTA button shown, client must act)
//   - false → "We're Handling This"    (informational only, no button — VA/team is on it)
// Migration 0027 added this column. Default = true (backward compatible).
export const actionItems = mysqlTable("action_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  actionType: mysqlEnum("actionType", ["verify_gbp", "provide_credentials", "review_content", "connect_website", "other"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "completed"]).default("pending").notNull(),
  priority: varchar("priority", { length: 20 }).default("medium"),
  relatedDeliverableId: int("relatedDeliverableId"),
  requiresClientAction: boolean("requiresClientAction").default(true).notNull(),
  bundledInMeeting: boolean("bundledInMeeting").default(false),
  reminderCount: int("reminderCount").default(0).notNull(),
  lastReminderSentAt: timestamp("lastReminderSentAt"),
  completedAt: timestamp("completedAt"),
});

export type ActionItem = typeof actionItems.$inferSelect;
export type InsertActionItem = typeof actionItems.$inferInsert;

// Client messages - communication between client and agent
export const clientMessages = mysqlTable("client_messages", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  orderId: int("orderId"), // Optional link to specific order
  senderType: mysqlEnum("senderType", ["client", "agent"]).notNull(),
  message: text("message").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  isProcessed: boolean("isProcessed").default(false).notNull(), // For scheduled task: has agent seen & handled this?
  emailSent: boolean("emailSent").default(false).notNull(), // Was email notification sent for this message?
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientMessage = typeof clientMessages.$inferSelect;
export type InsertClientMessage = typeof clientMessages.$inferInsert;

// Progress log - audit trail of work completed
export const progressLog = mysqlTable("progress_log", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  deliverableId: int("deliverableId"), // Optional, if related to specific deliverable
  message: text("message").notNull(),
  sessionData: json("sessionData"), // Persistent memory — JSON notes from worker sessions
  sessionType: varchar("sessionType", { length: 50 }).default("execution"), // execution, check_in, blocker_notification
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProgressLog = typeof progressLog.$inferSelect;
export type InsertProgressLog = typeof progressLog.$inferInsert;

// Client files - files uploaded by clients through the portal
export const clientFiles = mysqlTable("client_files", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  orderId: int("orderId"), // Optional link to specific order
  fileName: varchar("fileName", { length: 500 }).notNull(),
  originalName: varchar("originalName", { length: 500 }).notNull(),
  mimeType: varchar("mimeType", { length: 255 }).notNull(),
  fileSize: int("fileSize").notNull(), // Size in bytes
  fileKey: varchar("fileKey", { length: 500 }).notNull(), // S3 key
  url: varchar("url", { length: 1000 }).notNull(), // S3 URL
  category: mysqlEnum("category", ["logo", "content", "credentials", "reference", "other"]).default("other").notNull(),
  notes: text("notes"), // Optional description from client
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientFile = typeof clientFiles.$inferSelect;
export type InsertClientFile = typeof clientFiles.$inferInsert;


// Directory Submissions table - tracks automated directory submission progress
export const directorySubmissions = mysqlTable("directorySubmissions", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(), // Links to orders table
  directoryName: varchar("directoryName", { length: 255 }).notNull(), // e.g., "Google Business Profile", "Yelp", "Bing Places"
  directoryUrl: varchar("directoryUrl", { length: 500 }).notNull(), // Base URL of the directory
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "failed", "manual_required"]).default("pending").notNull(),
  submissionUrl: varchar("submissionUrl", { length: 1000 }), // URL of created listing (if successful)
  errorMessage: text("errorMessage"), // Error details if submission failed
  requiresManualVerification: boolean("requiresManualVerification").default(false), // e.g., email/phone verification needed
  verificationInstructions: text("verificationInstructions"), // Instructions for manual steps
  priority: mysqlEnum("priority", ["high", "medium", "low"]).default("medium").notNull(),
  domainAuthority: int("domainAuthority"), // SEO metric (0-100)
  aiVisibilityScore: int("aiVisibilityScore"), // Custom score for AI recommendation likelihood (0-100)
  estimatedTimeMinutes: int("estimatedTimeMinutes"), // Estimated time to complete submission
  attemptCount: int("attemptCount").default(0).notNull(), // Number of submission attempts
  lastAttemptAt: timestamp("lastAttemptAt"), // Timestamp of last attempt
  completedAt: timestamp("completedAt"), // Timestamp when successfully completed
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DirectorySubmission = typeof directorySubmissions.$inferSelect;
export type InsertDirectorySubmission = typeof directorySubmissions.$inferInsert;

// Support Tickets — structured support with lifecycle (open/closed/escalated)
export const supportTickets = mysqlTable("support_tickets", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId"),                    // null for non-authenticated users
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }),       // for non-authenticated users
  subject: varchar("subject", { length: 500 }).notNull(),
  status: mysqlEnum("status", ["open", "awaiting_client", "escalated", "closed"]).default("open").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high"]).default("normal").notNull(),
  category: mysqlEnum("category", ["general", "billing", "technical", "deliverable", "other"]).default("general").notNull(),
  accessToken: varchar("accessToken", { length: 64 }).notNull(), // UUID for non-auth ticket viewing
  escalatedAt: timestamp("escalatedAt"),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

// Support Ticket Messages — threaded conversation within a ticket
export const supportTicketMessages = mysqlTable("support_ticket_messages", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  senderType: mysqlEnum("senderType", ["client", "agent", "admin"]).notNull(),
  message: text("message").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  isProcessed: boolean("isProcessed").default(false).notNull(), // has worker auto-responded?
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupportTicketMessage = typeof supportTicketMessages.$inferSelect;
export type InsertSupportTicketMessage = typeof supportTicketMessages.$inferInsert;

// Processed Stripe webhook events — for idempotency protection
export const processedWebhookEvents = mysqlTable("processed_webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  stripeEventId: varchar("stripeEventId", { length: 255 }).notNull().unique(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
});

// VA Assignments — tracks directory submissions assigned to virtual assistants
export const vaAssignments = mysqlTable("va_assignments", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  clientId: int("clientId").notNull(),
  directoryName: varchar("directoryName", { length: 255 }).notNull(), // BBB, Hotfrog, Cylex, EZLocal, Foursquare
  assignedToUserId: int("assignedToUserId"), // null = unassigned, set when VA picks it up
  status: mysqlEnum("status", ["pending", "in_progress", "submitted", "verified", "failed"]).default("pending").notNull(),
  sopPdfUrl: varchar("sopPdfUrl", { length: 1000 }), // URL to AI-generated SOP PDF with pre-filled instructions
  submissionUrl: varchar("submissionUrl", { length: 1000 }), // URL of created listing (filled by VA after submission)
  submissionAccount: varchar("submissionAccount", { length: 320 }), // Email used to create account on directory
  notes: text("notes"), // VA notes or issue description
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VaAssignment = typeof vaAssignments.$inferSelect;
export type InsertVaAssignment = typeof vaAssignments.$inferInsert;

// Guest Posts — tracks articles placed on third-party blogs via Collaborator.pro
export const guestPosts = mysqlTable("guest_posts", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  clientId: int("clientId").notNull(),
  batchNumber: int("batchNumber").notNull(), // 1, 2, or 3
  collaboratorOrderId: varchar("collaboratorOrderId", { length: 100 }),
  collaboratorSiteId: varchar("collaboratorSiteId", { length: 100 }),
  siteName: varchar("siteName", { length: 255 }),
  siteUrl: varchar("siteUrl", { length: 500 }),
  siteDR: int("siteDR"), // Domain Rating at time of placement
  articleTitle: varchar("articleTitle", { length: 500 }),
  articleContent: text("articleContent"),
  anchorText: varchar("anchorText", { length: 255 }),
  targetUrl: varchar("targetUrl", { length: 500 }), // Client's URL being linked
  publishedUrl: varchar("publishedUrl", { length: 500 }), // Final published URL
  status: mysqlEnum("status", ["draft", "submitted", "published", "rejected", "failed"]).default("draft").notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  submittedAt: timestamp("submittedAt"),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GuestPost = typeof guestPosts.$inferSelect;
export type InsertGuestPost = typeof guestPosts.$inferInsert;

// VA Submission Files -- documents/screenshots uploaded by VAs when submitting assignments
export const vaSubmissionFiles = mysqlTable("va_submission_files", {
  id: int("id").autoincrement().primaryKey(),
  assignmentId: int("assignmentId").notNull(), // FK to va_assignments.id
  fileName: varchar("fileName", { length: 500 }).notNull(),
  originalName: varchar("originalName", { length: 500 }).notNull(),
  mimeType: varchar("mimeType", { length: 255 }).notNull(),
  fileSize: int("fileSize").notNull(), // bytes
  fileKey: varchar("fileKey", { length: 500 }).notNull(), // storage path
  url: varchar("url", { length: 1000 }).notNull(), // public/signed URL
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VaSubmissionFile = typeof vaSubmissionFiles.$inferSelect;
export type InsertVaSubmissionFile = typeof vaSubmissionFiles.$inferInsert;

// VA Chat Messages -- AI chat history scoped per assignment
export const vaMessages = mysqlTable("va_messages", {
  id: int("id").autoincrement().primaryKey(),
  assignmentId: int("assignmentId").notNull(), // FK to va_assignments.id
  userId: int("userId").notNull(), // FK to users.id (the VA who asked)
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VaMessage = typeof vaMessages.$inferSelect;
export type InsertVaMessage = typeof vaMessages.$inferInsert;

// Scans — AI Visibility scan results from /scan page and /api/scan endpoint
export const scans = mysqlTable("scans", {
  id: int("id").autoincrement().primaryKey(),
  scanId: varchar("scanId", { length: 100 }).notNull().unique(),
  leadId: varchar("leadId", { length: 50 }).notNull().unique(),
  businessName: varchar("businessName", { length: 255 }).notNull(),
  websiteUrl: varchar("websiteUrl", { length: 500 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  industry: varchar("industry", { length: 50 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 255 }),
  schemaScore: int("schemaScore").default(0),
  aiCrawlerScore: int("aiCrawlerScore").default(0),
  technicalSeoScore: int("technicalSeoScore").default(0),
  contentSignalsScore: int("contentSignalsScore").default(0),
  directoryPresenceScore: int("directoryPresenceScore").default(0),
  reviewSignalsScore: int("reviewSignalsScore").default(0),
  overallScore: int("overallScore").default(0),
  grade: varchar("grade", { length: 1 }),
  topRecommendations: json("topRecommendations"),
  fullResponse: json("fullResponse"),
  source: mysqlEnum("source", ["public_form", "api", "internal"]).default("public_form"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Scan = typeof scans.$inferSelect;
export type InsertScan = typeof scans.$inferInsert;

// Email Drip Queue — Funnel abandonment email sequences
export const emailDripQueue = mysqlTable("email_drip_queue", {
  id: int("id").autoincrement().primaryKey(),
  scanId: varchar("scanId", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  businessName: varchar("businessName", { length: 255 }).notNull(),
  score: int("score").notNull().default(0),
  grade: varchar("grade", { length: 1 }),
  sequenceStep: int("sequenceStep").notNull(),
  scheduledAt: timestamp("scheduledAt").notNull(),
  sentAt: timestamp("sentAt"),
  cancelledAt: timestamp("cancelledAt"),
  status: mysqlEnum("status", ["pending", "sent", "cancelled", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmailDripItem = typeof emailDripQueue.$inferSelect;
export type InsertEmailDripItem = typeof emailDripQueue.$inferInsert;

// Chatbot Conversations — Echo chatbot messages for anonymous homepage visitors
export const chatbotConversations = mysqlTable("chatbot_conversations", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  voiceUsed: boolean("voiceUsed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatbotConversation = typeof chatbotConversations.$inferSelect;
export type InsertChatbotConversation = typeof chatbotConversations.$inferInsert;

// ── Reddit Community Engagement ─────────────────────────────────────────────

// Per-client subreddit targeting list (discovered by scanner)
export const redditSubreddits = mysqlTable("reddit_subreddits", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  subredditName: varchar("subredditName", { length: 100 }).notNull(),
  subscriberCount: int("subscriberCount"),
  allowsBusinessMentions: boolean("allowsBusinessMentions").default(true).notNull(),
  industryRelevanceScore: int("industryRelevanceScore").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  notes: text("notes"),
  discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
  lastScannedAt: timestamp("lastScannedAt"),
});

export type RedditSubreddit = typeof redditSubreddits.$inferSelect;
export type InsertRedditSubreddit = typeof redditSubreddits.$inferInsert;

// Qualified threads discovered by scanner
export const redditThreads = mysqlTable("reddit_threads", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  orderId: int("orderId").notNull(),
  subredditName: varchar("subredditName", { length: 100 }).notNull(),
  redditPostId: varchar("redditPostId", { length: 20 }).notNull(),
  threadTitle: varchar("threadTitle", { length: 500 }).notNull(),
  threadUrl: varchar("threadUrl", { length: 1000 }).notNull(),
  threadBody: text("threadBody"),  // selftext from Reddit — used by Claude for better drafts
  threadAuthor: varchar("threadAuthor", { length: 100 }),
  threadScore: int("threadScore").default(0).notNull(),
  commentCount: int("commentCount").default(0).notNull(),
  threadCreatedAt: timestamp("threadCreatedAt"),
  relevanceScore: int("relevanceScore").default(0).notNull(),
  qualificationReason: text("qualificationReason"),
  status: mysqlEnum("status", ["discovered", "draft_generated", "queued", "posted", "skipped", "expired"]).default("discovered").notNull(),
  discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
});

export type RedditThread = typeof redditThreads.$inferSelect;
export type InsertRedditThread = typeof redditThreads.$inferInsert;

// Claude-generated responses queued for VAs to post
export const redditDrafts = mysqlTable("reddit_drafts", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId").notNull(),
  clientId: int("clientId").notNull(),
  orderId: int("orderId").notNull(),
  draftText: text("draftText").notNull(),
  includesLink: boolean("includesLink").default(false).notNull(),
  toneCategory: varchar("toneCategory", { length: 50 }),
  assignedToUserId: int("assignedToUserId"),
  status: mysqlEnum("status", ["pending", "claimed", "posted", "rejected", "expired"]).default("pending").notNull(),
  rejectionReason: text("rejectionReason"),
  batchNumber: int("batchNumber").notNull().default(1),
  postedAt: timestamp("postedAt"),
  postedByUserId: int("postedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type RedditDraft = typeof redditDrafts.$inferSelect;
export type InsertRedditDraft = typeof redditDrafts.$inferInsert;

// ── Reddit Per-Client Automation ────────────────────────────────────────────
// One dedicated Reddit account per Dominator client, fully automated by the
// worker. Posts come FROM the client's own account (warm-up + promotional),
// not from a shared SBGPT account. See docs/architecture/reddit-per-client-automation-plan.md

// Pool of residential ISP proxies available for assignment to client accounts.
// Each account pins exactly one IP for its lifetime — never reused across accounts.
export const redditProxyPool = mysqlTable("reddit_proxy_pool", {
  id: int("id").autoincrement().primaryKey(),
  provider: mysqlEnum("provider", ["webshare_isp", "iproyal_residential", "mobile_reserve"]).notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }).notNull(),
  port: int("port").notNull(),
  encryptedUsername: text("encryptedUsername").notNull(),  // proxy auth, AES-256-GCM
  encryptedPassword: text("encryptedPassword").notNull(),
  geoRegion: varchar("geoRegion", { length: 50 }),         // e.g., 'US-TX'
  geoCity: varchar("geoCity", { length: 100 }),            // e.g., 'Boston' (from VPNAPI per-IP)
  geoLat: decimal("geoLat", { precision: 10, scale: 6 }),  // for geolocation API + geo-tz lookup
  geoLng: decimal("geoLng", { precision: 10, scale: 6 }),
  geoTimezone: varchar("geoTimezone", { length: 50 }),     // canonical IANA, e.g. 'America/New_York'
  reputationCheckedAt: timestamp("reputationCheckedAt"),
  reputationFlagged: boolean("reputationFlagged").default(false).notNull(),
  reputationScore: int("reputationScore"),                 // VPNAPI.io / AbuseIPDB score
  assignedAccountId: int("assignedAccountId"),             // FK clientRedditAccounts.id (legacy) or warmedRedditAccounts.id
  // 'reserved' is an intermediate state during VA Generate Account flow:
  // atomic SKIP LOCKED claim flips proxy from 'available' → 'reserved' before
  // spawning Browserbase session, then 'assigned' on Mark Created, or back to
  // 'available' on Cancel / TTL cleanup.
  status: mysqlEnum("status", ["available", "reserved", "assigned", "flagged", "retired"]).default("available").notNull(),
  flaggedAt: timestamp("flaggedAt"),                       // when status flipped to flagged — for age-out
  reservedAt: timestamp("reservedAt"),                     // when proxy was claimed during Generate
  reservedByVaId: int("reservedByVaId"),                   // FK users(id) — who claimed it
  lastAttemptAt: timestamp("lastAttemptAt"),               // when the IP last had a signup attempt — for cooldown
  lastHealthCheckAt: timestamp("lastHealthCheckAt"),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
});

export type RedditProxy = typeof redditProxyPool.$inferSelect;
export type InsertRedditProxy = typeof redditProxyPool.$inferInsert;

// One Reddit account per Dominator client, lifetime ~90 days (warm-up + 60d engagement).
export const clientRedditAccounts = mysqlTable("client_reddit_accounts", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),                     // FK clients.id, unique per client
  redditUsername: varchar("redditUsername", { length: 20 }).notNull().unique(),
  encryptedPassword: text("encryptedPassword").notNull(),  // AES-256-GCM
  fingerprint: text("fingerprint").notNull(),              // JSON config (not sensitive, no encryption)
  encryptedCookies: text("encryptedCookies"),              // serialized session, AES-256-GCM, refreshed each session
  emailAlias: varchar("emailAlias", { length: 320 }).notNull().unique(),  // client-NNN@accounts-sbgpt.com
  proxyId: int("proxyId"),                                 // FK redditProxyPool.id
  proxyTimezone: varchar("proxyTimezone", { length: 50 }),  // cached for active-hours scheduling
  status: mysqlEnum("status", [
    "pending_creation",      // queued, account doesn't exist yet
    "creating",              // signup flow in progress
    "verifying",             // waiting on email verification
    "warming_up",            // in 30-day warm-up
    "ready",                 // warm-up complete, ready for promotional
    "posting",               // promotional phase active
    "shadowbanned",          // detected by shadowbanChecker — retired
    "flagged",               // manual review needed
    "retired",               // end of lifecycle, dormant maintenance only
  ]).default("pending_creation").notNull(),
  dayNumber: int("dayNumber").default(0).notNull(),        // 0=just created, 30=warm-up complete, 90=cycle ends
  karmaCount: int("karmaCount").default(0).notNull(),      // total = post + comment
  postKarma: int("postKarma").default(0).notNull(),
  commentKarma: int("commentKarma").default(0).notNull(),
  captchaHitsLastHour: int("captchaHitsLastHour").default(0).notNull(),  // circuit breaker
  captchaCircuitOpenedAt: timestamp("captchaCircuitOpenedAt"),  // when circuit triggered (cool 24h)
  shadowbanned: boolean("shadowbanned").default(false).notNull(),
  lastShadowbanCheckAt: timestamp("lastShadowbanCheckAt"),
  lastSessionAt: timestamp("lastSessionAt"),               // last successful login
  failureReason: text("failureReason"),                    // populated when status=flagged
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ClientRedditAccount = typeof clientRedditAccounts.$inferSelect;
export type InsertClientRedditAccount = typeof clientRedditAccounts.$inferInsert;

// State machine for all per-account actions (warm-up + promotional).
// Worker pulls due tasks (status=pending, scheduledAt<=now), executes via accountPoster.
export const redditAccountTasks = mysqlTable("reddit_account_tasks", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),                   // FK clientRedditAccounts.id
  taskType: mysqlEnum("taskType", [
    "warmup_subscribe",          // join a relevant or general subreddit
    "warmup_lurk",               // open a hot thread, scroll, dwell
    "warmup_upvote",             // upvote 5-10 posts/comments
    "warmup_comment_neutral",    // friendly comment in unrelated sub, no business mention
    "warmup_textpost_neutral",   // text post asking question about industry, no business mention
    "promotional_comment",       // reply to discovered thread, may include link (Day 30+)
    "promotional_textpost",      // rare — text post highlighting industry insight (Day 30+)
    "shadowban_check",           // probe AyrA's API, update DB
    "dormant_maintenance",       // Day 90+: 1 upvote/day to keep alive
  ]).notNull(),
  scheduledAt: timestamp("scheduledAt").notNull(),
  executedAt: timestamp("executedAt"),
  status: mysqlEnum("status", ["pending", "in_progress", "success", "failed", "skipped"]).default("pending").notNull(),
  workerId: varchar("workerId", { length: 50 }),           // race-lock claim
  dayNumber: int("dayNumber").notNull(),                   // which lifecycle day this task belongs to
  content: text("content"),                                // comment/post body for tasks that need it
  targetSubreddit: varchar("targetSubreddit", { length: 21 }),
  targetThreadId: varchar("targetThreadId", { length: 20 }),  // Reddit base36 ID
  resultUrl: varchar("resultUrl", { length: 500 }),        // posted URL on success
  resultMessage: text("resultMessage"),                    // error or info
  draftId: int("draftId"),                                 // FK redditDrafts.id for promotional tasks
  retryCount: int("retryCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type RedditAccountTask = typeof redditAccountTasks.$inferSelect;
export type InsertRedditAccountTask = typeof redditAccountTasks.$inferInsert;

// Verification email queue — populated by Cloudflare Worker, drained by accountCreator.
// One row per inbound Reddit verification email.
export const redditVerificationQueue = mysqlTable("reddit_verification_queue", {
  id: int("id").autoincrement().primaryKey(),
  emailAlias: varchar("emailAlias", { length: 320 }).notNull(),
  code: varchar("code", { length: 10 }),                   // 6-digit code if Reddit sent one
  magicLink: varchar("magicLink", { length: 1000 }),       // verification URL if Reddit sent one
  rawSubject: varchar("rawSubject", { length: 500 }),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  consumedAt: timestamp("consumedAt"),                     // set when accountCreator picks up
});

export type RedditVerification = typeof redditVerificationQueue.$inferSelect;
export type InsertRedditVerification = typeof redditVerificationQueue.$inferInsert;

// ════════════════════════════════════════════════════════════════════════
// WARMED REDDIT ACCOUNT POOL (Build #1, 2026-04-26)
// Replaces the autonomous-signup model with a VA-driven creation flow:
// VA generates email+password+Browserbase iframe in admin panel, manually
// signs up Reddit (handles captcha + interests wizard), then a separate
// warming worker (Build #2) drives the account through N days of organic
// activity before assignment to a Dominator client.
// See CLAUDE.md Section 16 / RECENT_SESSIONS.md for the strategic pivot.
// ════════════════════════════════════════════════════════════════════════

export const warmedRedditAccounts = mysqlTable("warmed_reddit_accounts", {
  id: int("id").autoincrement().primaryKey(),
  emailAlias: varchar("emailAlias", { length: 255 }).notNull().unique(),
  emailDomain: varchar("emailDomain", { length: 100 }).notNull(),
  encryptedPassword: text("encryptedPassword").notNull(),  // AES-256-GCM
  redditUsername: varchar("redditUsername", { length: 20 }).unique(),  // null until VA marks created
  proxyId: int("proxyId"),                                 // FK redditProxyPool.id
  fingerprint: text("fingerprint").notNull(),              // JSON, generated at proxy alloc
  encryptedCookies: text("encryptedCookies"),              // captured from Browserbase post-signup
  status: mysqlEnum("status", [
    "pending",                  // creds minted, VA actively in iframe
    "awaiting_verification",    // VA done; needs first warming login from our infra
    "warming",                  // in N-day warming cycle
    "warmed",                   // ready to assign to a client
    "active",                   // assigned + posting for a client
    "captcha_blocked",          // warming login hit captcha; needs operator
    "verification_required",    // Reddit demanded device verification email
    "phone_blocked",            // Reddit demanded phone verification at signup
    "email_blocked",            // Reddit refused the email/domain at signup
    "failed",                   // terminal failure
    "cancelled",                // VA cancelled or session timed out
  ]).default("pending").notNull(),
  adspowerProfileId: varchar("adspowerProfileId", { length: 100 }),  // AdsPower user_id from Local API
  adspowerWsEndpoint: text("adspowerWsEndpoint"),                    // CDP WS URL captured at /browser/start
  expiresAt: timestamp("expiresAt"),                       // pending row TTL
  heartbeatAt: timestamp("heartbeatAt"),                   // frontend pings while signup is active
  dayNumber: int("dayNumber").default(0).notNull(),
  warmingTargetDays: int("warmingTargetDays").default(30).notNull(),  // 30-day full warming ramp (was 2 for first-batch test, graduated 2026-04-30)
  warmedAt: timestamp("warmedAt"),
  assignedClientId: int("assignedClientId"),               // FK clients.id, set on assignment
  assignedAt: timestamp("assignedAt"),
  lastSessionAt: timestamp("lastSessionAt"),
  failureReason: text("failureReason"),
  consecutiveFailures: int("consecutiveFailures").default(0).notNull(),
  emailReissueCount: int("emailReissueCount").default(0).notNull(),  // capped at 2 per row
  createdByVaId: int("createdByVaId"),                     // FK users.id — audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WarmedRedditAccount = typeof warmedRedditAccounts.$inferSelect;
export type InsertWarmedRedditAccount = typeof warmedRedditAccounts.$inferInsert;

// Generalized inbound email queue — replaces redditVerificationQueue.
// Captures ALL inbound emails to our domains, not just Reddit OTPs:
//   - VA signup OTPs (during account creation, surfaced via SSE inbox panel)
//   - Reddit device-verification emails (caught during warming worker first login)
//   - Future: any inbox-driven flow
export const inboundEmails = mysqlTable("inbound_emails", {
  id: int("id").autoincrement().primaryKey(),
  emailAlias: varchar("emailAlias", { length: 255 }).notNull(),
  fromAddress: varchar("fromAddress", { length: 320 }).notNull(),
  subject: text("subject").notNull(),
  plainBody: longtext("plainBody").notNull(),
  htmlBody: longtext("htmlBody"),
  extractedCode: varchar("extractedCode", { length: 20 }),     // 6-digit OTP if matched
  extractedLink: text("extractedLink"),                        // magic link if matched
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  consumedAt: timestamp("consumedAt"),                         // when UI/worker picked it up
});

export type InboundEmail = typeof inboundEmails.$inferSelect;
export type InsertInboundEmail = typeof inboundEmails.$inferInsert;

// Email domain pool — domains we use for Reddit signup emails. Rotation across
// these spreads accounts across domains so Reddit can't bulk-flag a single domain.
// Includes our fresh `inboxsbgpt.com` plus established marketing domains (warmed
// from prior email campaigns, higher domain reputation).
export const emailDomainPool = mysqlTable("email_domain_pool", {
  id: int("id").autoincrement().primaryKey(),
  domain: varchar("domain", { length: 100 }).notNull().unique(),
  status: mysqlEnum("status", ["active", "retired"]).default("active").notNull(),
  spfConfigured: boolean("spfConfigured").default(false).notNull(),
  dkimConfigured: boolean("dkimConfigured").default(false).notNull(),
  dmarcConfigured: boolean("dmarcConfigured").default(false).notNull(),
  isWarmed: boolean("isWarmed").default(false).notNull(),       // true for established marketing domains
  accountCount: int("accountCount").default(0).notNull(),       // accounts using this domain
  recentRejections: int("recentRejections").default(0).notNull(), // Reddit rejected this email at signup
  lastRejectionAt: timestamp("lastRejectionAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmailDomain = typeof emailDomainPool.$inferSelect;
export type InsertEmailDomain = typeof emailDomainPool.$inferInsert;

// Audit log for VA actions on warmed Reddit accounts.
// Every Generate, Mark Created, Cancel, password-view etc. writes a row.
// Useful for: debugging, abuse-defense, VA accountability, cost tracking.
export const redditAccountAuditLog = mysqlTable("reddit_account_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId"),                              // FK warmedRedditAccounts.id, nullable
  vaId: int("vaId"),                                        // FK users.id — who did this
  action: mysqlEnum("action", [
    "generate",
    "mark_created",
    "cancel",
    "reissue_email",
    "extend_session",
    "cookie_access",
    "password_view",
    "mark_phone_blocked",
    "mark_email_blocked",
    "manual_status_change",
  ]).notNull(),
  detail: json("detail"),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
});

export type RedditAccountAuditLogRow = typeof redditAccountAuditLog.$inferSelect;
export type InsertRedditAccountAuditLogRow = typeof redditAccountAuditLog.$inferInsert;

// Per-session diagnostic log for the warming worker (Build #2). One row per
// attempted session. Drives the operator-triage view + per-account history.
export const warmingSessionLog = mysqlTable("warming_session_log", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),                  // FK warmedRedditAccounts.id
  sessionNumber: int("sessionNumber").notNull(),          // monotonic per account
  dayNumber: int("dayNumber").notNull(),
  proxyId: int("proxyId"),                                // FK redditProxyPool.id
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  outcome: mysqlEnum("outcome", [
    "success",
    "login_via_cookies",
    "login_via_password",
    "captcha_at_login",
    "device_verification_required",
    "wrong_password",
    "rate_limited",
    "proxy_failed",
    "account_suspended",
    "crashed",
    "other_error",
  ]).notNull(),
  loginSucceeded: boolean("loginSucceeded").default(false).notNull(),
  actionsAttempted: json("actionsAttempted"),             // {browse: 5, upvote: 3, comment: 1}
  actionsCompleted: json("actionsCompleted"),
  errorDetail: text("errorDetail"),
  screenshotPath: varchar("screenshotPath", { length: 500 }),
});

export type WarmingSessionLog = typeof warmingSessionLog.$inferSelect;
export type InsertWarmingSessionLog = typeof warmingSessionLog.$inferInsert;

// ── Delegated Access — allows clients to grant portal access to team members ──
export const delegatedAccess = mysqlTable("delegated_access", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),               // FK to clients.id — the client granting access
  delegateEmail: varchar("delegateEmail", { length: 320 }).notNull(), // email of the delegate (lowercase)
  addedByUserId: int("addedByUserId").notNull(),     // FK to users.id — who added this delegate
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),                 // null = active; set when revoked (soft delete)
});

export type DelegatedAccess = typeof delegatedAccess.$inferSelect;
export type InsertDelegatedAccess = typeof delegatedAccess.$inferInsert;

// ── Voice Sessions — AI voice agent appointments booked by clients ────────
export const voiceSessions = mysqlTable("voice_sessions", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  orderId: int("orderId"),
  status: mysqlEnum("status", [
    "scheduled",
    "reminder_sent",
    "waiting",
    "active",
    "completed",
    "cancelled",
    "no_show",
  ]).default("scheduled").notNull(),
  scheduledAt: timestamp("scheduledAt").notNull(),
  startedAt: timestamp("startedAt"),
  endedAt: timestamp("endedAt"),
  durationSeconds: int("durationSeconds"),
  transcriptSummary: text("transcriptSummary"),
  transcriptMessages: json("transcriptMessages"), // Array of {role, content, timestamp}
  cancelledAt: timestamp("cancelledAt"),
  cancelReason: varchar("cancelReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VoiceSession = typeof voiceSessions.$inferSelect;
export type InsertVoiceSession = typeof voiceSessions.$inferInsert;

// ToS consent records — electronic signature evidence for chargeback defense
export const tosConsents = mysqlTable("tos_consents", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  clientId: int("clientId"),
  tosVersion: varchar("tosVersion", { length: 20 }).notNull(),
  privacyVersion: varchar("privacyVersion", { length: 20 }).notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }).notNull(),
  userAgent: text("userAgent").notNull(),
  flow: varchar("flow", { length: 50 }).notNull(), // get_started, funnel_start, portal_upgrade, free_assessment
  productId: varchar("productId", { length: 50 }),
  checkboxText: text("checkboxText").notNull(),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  acceptedAt: timestamp("acceptedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TosConsent = typeof tosConsents.$inferSelect;
export type InsertTosConsent = typeof tosConsents.$inferInsert;

// ── Analytics — lightweight page view + event tracking ─────────────────────

// Page views — one row per page load
export const analyticsPageViews = mysqlTable("analytics_page_views", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  path: varchar("path", { length: 500 }).notNull(),
  referrer: varchar("referrer", { length: 1000 }),
  userAgent: varchar("userAgent", { length: 500 }),
  screenWidth: int("screenWidth"),
  country: varchar("country", { length: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AnalyticsPageView = typeof analyticsPageViews.$inferSelect;

// Events — button clicks, video plays, voice agent opens, etc.
export const analyticsEvents = mysqlTable("analytics_events", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  eventName: varchar("eventName", { length: 100 }).notNull(),
  eventData: varchar("eventData", { length: 500 }),
  path: varchar("path", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// Dominator Blog Content Delivery (added 2026-05-12, migration 0028)
//
// Five new tables that drive the per-Dominator-order blog content program.
// All additions are PURELY ADDITIVE — no existing tables modified except
// blog_posts (one new nullable column for showcase fallback mode).
//
// Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-Dominator-order content program configuration.
 * One row inserted at Stripe webhook time alongside the deliverables seed block.
 */
export const clientContentConfig = mysqlTable("client_content_config", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().unique(),
  clientId: int("clientId").notNull(),
  // 'wordpress' | 'shopify' | 'wix' | 'squarespace' | 'showcase' | 'other'
  cmsPlatform: varchar("cmsPlatform", { length: 64 }).notNull(),
  // 'plugin' | 'app_password' | 'oauth' | 'editor_user' | 'none' (showcase mode)
  cmsAuthMethod: varchar("cmsAuthMethod", { length: 32 }),
  brandVoiceKey: varchar("brandVoiceKey", { length: 32 }).default("professional"),
  brandVoiceCustom: text("brandVoiceCustom"),
  // [{ url, pageTopic }, ...] — discovered at onboarding from sitemap scrape
  internalLinkTargets: json("internalLinkTargets"),
  // 'yoast' | 'rankmath' | 'aioseo' | null — drives schema conflict avoidance
  existingSchemaPlugin: varchar("existingSchemaPlugin", { length: 32 }),
  featuredImagePreference: varchar("featuredImagePreference", { length: 32 }).default("unsplash"),
  featuredImageCustomUrl: varchar("featuredImageCustomUrl", { length: 500 }),
  // When the client clicks the showcase-consent checkbox (Showcase mode only)
  showcaseConsentAt: timestamp("showcaseConsentAt"),
  // 10-12 query strings for the per-client citation monitor
  citationQueryBattery: json("citationQueryBattery").notNull(),
  publishCadenceKey: varchar("publishCadenceKey", { length: 32 }).default("dominator_default"),
  longformDayOfWeek: int("longformDayOfWeek").default(1), // 0=Sun..6=Sat, default Monday
  longformFrequency: varchar("longformFrequency", { length: 32 }).default("once_at_start"),
  // [2, 4] = Tue+Thu (Dominator default). Plus would use [2, 4, 6].
  shortDaysOfWeek: json("shortDaysOfWeek").default([2, 4]),
  publishHourUtc: int("publishHourUtc").default(14),
  totalLongformsTarget: int("totalLongformsTarget").default(1),
  totalShortsTarget: int("totalShortsTarget").default(18),
  startedAt: timestamp("startedAt"),
  pausedAt: timestamp("pausedAt"),
  pauseReason: text("pauseReason"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ClientContentConfig = typeof clientContentConfig.$inferSelect;
export type InsertClientContentConfig = typeof clientContentConfig.$inferInsert;

/**
 * Per-article record. Mirrors guest_posts pattern but for our blog content.
 * Status flow: draft → ready_to_publish → publishing → published → verified
 *                                                    → publish_failed → ready_to_publish (retry up to 3x)
 */
export const clientBlogPost = mysqlTable("client_blog_post", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  clientId: int("clientId").notNull(),
  contentConfigId: int("contentConfigId").notNull(),
  topicId: int("topicId"),
  // 'longform' | 'short'
  kind: varchar("kind", { length: 16 }).notNull(),
  // Unique per clientId (enforced via composite unique constraint)
  slug: varchar("slug", { length: 255 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  metaTitle: varchar("metaTitle", { length: 200 }),
  metaDescription: varchar("metaDescription", { length: 320 }),
  bodyMarkdown: longtext("bodyMarkdown").notNull(),
  bodyHtml: longtext("bodyHtml").notNull(),
  // Combined Article + FAQPage <script> blocks ready to inject
  schemaJsonLd: longtext("schemaJsonLd"),
  wordCount: int("wordCount").notNull().default(0),
  featuredImageUrl: varchar("featuredImageUrl", { length: 500 }),
  featuredImageAttribution: varchar("featuredImageAttribution", { length: 500 }),
  internalLinksUsed: json("internalLinksUsed"),
  externalCitations: json("externalCitations"),
  // Layer-2 output: array of { claim, verifiability, needsResearch, researchResult, source }
  verifiableClaimsAudit: json("verifiableClaimsAudit"),
  // Stats from the multi-layer generation pipeline (for telemetry + cost tracking)
  generationLayers: json("generationLayers"),
  // { passed, failureReasons[], attempts }
  qualityGateResult: json("qualityGateResult"),
  // 'draft' | 'ready_to_publish' | 'publishing' | 'published' | 'publish_failed' | 'verified' | 'rejected'
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  publishedUrl: varchar("publishedUrl", { length: 500 }),
  publishedCmsPostId: varchar("publishedCmsPostId", { length: 120 }),
  publishedAt: timestamp("publishedAt"),
  verifiedAt: timestamp("verifiedAt"),
  // { h1_match, schema_present, schema_valid, schema_types[], word_count_live, internal_links_live }
  verificationResult: json("verificationResult"),
  screenshotDesktopUrl: varchar("screenshotDesktopUrl", { length: 500 }),
  screenshotMobileUrl: varchar("screenshotMobileUrl", { length: 500 }),
  publishAttempts: int("publishAttempts").notNull().default(0),
  lastPublishError: text("lastPublishError"),
  // 'plugin' | 'oauth_api' | 'patchright' | 'showcase_local'
  lastPublishMethod: varchar("lastPublishMethod", { length: 32 }),
  rejectedReason: text("rejectedReason"),
  generatedCostUsd: decimal("generatedCostUsd", { precision: 8, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ClientBlogPost = typeof clientBlogPost.$inferSelect;
export type InsertClientBlogPost = typeof clientBlogPost.$inferInsert;

/**
 * Per-client topic queue. Seeded at intake. Consumed by writers in priority order.
 * Each topic can be consumed once (consumedAt set when blogPostId is created from it).
 */
export const clientContentTopic = mysqlTable("client_content_topic", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  contentConfigId: int("contentConfigId").notNull(),
  // Unique per clientId (enforced via composite unique constraint)
  topicSlug: varchar("topicSlug", { length: 180 }).notNull(),
  topicTitle: text("topicTitle").notNull(),
  topicSummary: text("topicSummary"),
  // 'longform' | 'short' | 'either'
  kind: varchar("kind", { length: 16 }).notNull(),
  // 'how_to' | 'comparison' | 'when_to' | 'best_for' | 'faq' | 'listicle'
  format: varchar("format", { length: 32 }),
  primaryKeyword: varchar("primaryKeyword", { length: 255 }),
  predictedWordCount: int("predictedWordCount"),
  rationale: text("rationale"),
  // 0-100. Boosted by citation feedback when client is losing on related queries.
  priorityScore: int("priorityScore").notNull().default(50),
  priorityReason: text("priorityReason"),
  consumedAt: timestamp("consumedAt"),
  blogPostId: int("blogPostId"),
  rejectedAt: timestamp("rejectedAt"),
  rejectedReason: text("rejectedReason"),
  // 'initial_seed' | 'manual' | 'citation_feedback' | 'cluster_refresh'
  source: varchar("source", { length: 32 }).notNull().default("initial_seed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientContentTopic = typeof clientContentTopic.$inferSelect;
export type InsertClientContentTopic = typeof clientContentTopic.$inferInsert;

/**
 * Per-client weekly citation monitor results.
 * Mirrors internal_citation_checks (owned by sbgpt-internal-agent) for consistency.
 * Powers the "Citation Rate" sparkline on the client dashboard.
 */
export const clientCitationCheck = mysqlTable("client_citation_check", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  contentConfigId: int("contentConfigId").notNull(),
  // Format: client{clientId}_{YYYY-MM-DD}_weekly
  runId: varchar("runId", { length: 64 }).notNull(),
  queryId: varchar("queryId", { length: 64 }).notNull(),
  queryText: text("queryText").notNull(),
  llmProvider: varchar("llmProvider", { length: 32 }).notNull().default("anthropic"),
  llmModel: varchar("llmModel", { length: 64 }).notNull(),
  groundedSearch: int("groundedSearch").notNull().default(1),
  mentionedClient: int("mentionedClient").notNull().default(0),
  mentionPosition: int("mentionPosition"),
  mentionContext: text("mentionContext"),
  competitorsMentioned: json("competitorsMentioned"),
  sourcesCited: json("sourcesCited"),
  fullAnswer: longtext("fullAnswer"),
  costUsd: decimal("costUsd", { precision: 8, scale: 4 }).notNull().default("0"),
  latencyMs: int("latencyMs").notNull().default(0),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientCitationCheck = typeof clientCitationCheck.$inferSelect;
export type InsertClientCitationCheck = typeof clientCitationCheck.$inferInsert;

/**
 * OAuth tokens for Shopify + Wix.
 * Separate from client_credentials because OAuth tokens have refresh lifecycles,
 * are revocable per-app, and have expiry semantics that don't fit the credentials
 * table's "username/password" shape.
 */
export const oauthToken = mysqlTable("oauth_token", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  // 'shopify' | 'wix'
  provider: varchar("provider", { length: 32 }).notNull(),
  // Shopify: 'mystore.myshopify.com'; Wix: site instanceId
  shopDomain: varchar("shopDomain", { length: 255 }),
  encryptedAccessToken: text("encryptedAccessToken").notNull(),
  encryptedRefreshToken: text("encryptedRefreshToken"),
  scope: text("scope"),
  tokenType: varchar("tokenType", { length: 32 }).default("Bearer"),
  expiresAt: timestamp("expiresAt"),
  revokedAt: timestamp("revokedAt"),
  lastUsedAt: timestamp("lastUsedAt"),
  lastRefreshedAt: timestamp("lastRefreshedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OauthToken = typeof oauthToken.$inferSelect;
export type InsertOauthToken = typeof oauthToken.$inferInsert;
