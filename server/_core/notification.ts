/**
 * Owner Notification Service
 *
 * Sends admin notifications via Resend email.
 * Replaces the legacy Manus Forge notification API.
 */

import { sendEmail } from './email';

export type NotificationPayload = {
  title: string;
  content: string;
};

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';

/**
 * Sends a notification email to the project owner (admin).
 * Returns `true` if the email was sent successfully, `false` otherwise.
 * Non-throwing — callers don't need try/catch.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = payload;

  if (!title || !content) {
    console.warn('[Notification] Missing title or content, skipping notification');
    return false;
  }

  try {
    const result = await sendEmail({
      to: ADMIN_EMAIL,
      subject: title,
      body: content,
    });

    if (result) {
      console.log(`[Notification] Owner notified: ${title}`);
    } else {
      console.warn(`[Notification] Failed to notify owner: ${title}`);
    }

    return result;
  } catch (error) {
    console.warn('[Notification] Error sending owner notification:', error);
    return false;
  }
}
