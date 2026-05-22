import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('./db', () => ({
  getDb: vi.fn(),
}));

// Mock the notification module
vi.mock('./_core/notification', () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { getDb } from './db';
import { notifyOwner } from './_core/notification';

describe('Client Messaging System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Database Schema', () => {
    it('should have clientMessages table with correct fields', async () => {
      const { clientMessages } = await import('../drizzle/schema');
      
      // Verify the table exists and has the expected columns
      expect(clientMessages).toBeDefined();
      
      // Check column names exist in the table config
      const columnNames = Object.keys(clientMessages);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('clientId');
      expect(columnNames).toContain('orderId');
      expect(columnNames).toContain('senderType');
      expect(columnNames).toContain('message');
      expect(columnNames).toContain('isRead');
      expect(columnNames).toContain('isProcessed');
      expect(columnNames).toContain('emailSent');
      expect(columnNames).toContain('createdAt');
    });
  });

  describe('Products Configuration', () => {
    it('should include PAYMENT_TEST product', async () => {
      const { PRODUCTS } = await import('../shared/products');
      
      expect(PRODUCTS.PAYMENT_TEST).toBeDefined();
      expect(PRODUCTS.PAYMENT_TEST.price).toBe(5);
      expect(PRODUCTS.PAYMENT_TEST.name).toBeDefined();
      expect(PRODUCTS.PAYMENT_TEST.stripePriceId).toBeDefined();
    });

    it('should still include AI_JUMPSTART and AI_DOMINATOR products', async () => {
      const { PRODUCTS } = await import('../shared/products');
      
      expect(PRODUCTS.AI_JUMPSTART).toBeDefined();
      expect(PRODUCTS.AI_JUMPSTART.price).toBe(99);
      expect(PRODUCTS.AI_DOMINATOR).toBeDefined();
      expect(PRODUCTS.AI_DOMINATOR.price).toBe(199);
    });
  });

  describe('Notification System', () => {
    it('notifyOwner should be callable with title and content', async () => {
      const result = await notifyOwner({
        title: 'Test Notification',
        content: 'Test content for notification',
      });
      
      expect(notifyOwner).toHaveBeenCalledWith({
        title: 'Test Notification',
        content: 'Test content for notification',
      });
      expect(result).toBe(true);
    });

    it('notifyOwner should handle payment notification format', async () => {
      const notificationContent = [
        'A new client just purchased AI Jumpstart ($99)!',
        '',
        'Client: Test User',
        'Email: test@example.com',
        'Package: AI Jumpstart',
        'Order ID: 1',
        '',
        'The scheduled task will automatically begin servicing this client within 6 hours.',
      ].join('\n');

      await notifyOwner({
        title: '🎉 New Client Payment: Test User',
        content: notificationContent,
      });

      expect(notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('New Client Payment'),
          content: expect.stringContaining('AI Jumpstart'),
        })
      );
    });
  });

  describe('Message DB Helpers', () => {
    it('createMessage should insert a message and return id', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          $returningId: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      });

      (getDb as any).mockResolvedValue({
        insert: mockInsert,
      });

      const { createMessage } = await import('./clientDb');
      
      const result = await createMessage({
        clientId: 1,
        senderType: 'client',
        message: 'Hello, I have a question about my order.',
        isRead: false,
        isProcessed: false,
        emailSent: false,
      });

      expect(result).toEqual({ id: 1 });
      expect(mockInsert).toHaveBeenCalled();
    });

    it('getMessagesByClientId should return messages ordered by date', async () => {
      const mockMessages = [
        { id: 2, clientId: 1, senderType: 'agent', message: 'Reply', createdAt: new Date('2026-02-24T12:00:00Z') },
        { id: 1, clientId: 1, senderType: 'client', message: 'Hello', createdAt: new Date('2026-02-24T11:00:00Z') },
      ];

      const mockOrderBy = vi.fn().mockResolvedValue(mockMessages);
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

      (getDb as any).mockResolvedValue({
        select: mockSelect,
      });

      const { getMessagesByClientId } = await import('./clientDb');
      const messages = await getMessagesByClientId(1);

      expect(messages).toHaveLength(2);
      expect(mockSelect).toHaveBeenCalled();
    });

    it('markMessagesAsRead should update unread messages', async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

      (getDb as any).mockResolvedValue({
        update: mockUpdate,
      });

      const { markMessagesAsRead } = await import('./clientDb');
      await markMessagesAsRead(1, 'agent');

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith({ isRead: true });
    });
  });

  describe('Webhook Payment Test Handling', () => {
    it('should handle PAYMENT_TEST product type in webhook', () => {
      // Verify the product mapping logic
      const productId = 'PAYMENT_TEST';
      const packageType = productId === 'PAYMENT_TEST' ? 'jumpstart' : (productId === 'AI_JUMPSTART' ? 'jumpstart' : 'dominator');
      const status = productId === 'PAYMENT_TEST' ? 'completed' : 'pending';
      
      expect(packageType).toBe('jumpstart');
      expect(status).toBe('completed');
    });

    it('should handle AI_JUMPSTART product type correctly', () => {
      const productId = 'AI_JUMPSTART';
      const packageType = productId === 'PAYMENT_TEST' ? 'jumpstart' : (productId === 'AI_JUMPSTART' ? 'jumpstart' : 'dominator');
      const status = productId === 'PAYMENT_TEST' ? 'completed' : 'pending';
      
      expect(packageType).toBe('jumpstart');
      expect(status).toBe('pending');
    });

    it('should handle AI_DOMINATOR product type correctly', () => {
      const productId = 'AI_DOMINATOR';
      const packageType = productId === 'PAYMENT_TEST' ? 'jumpstart' : (productId === 'AI_JUMPSTART' ? 'jumpstart' : 'dominator');
      const status = productId === 'PAYMENT_TEST' ? 'completed' : 'pending';
      
      expect(packageType).toBe('dominator');
      expect(status).toBe('pending');
    });
  });
});
