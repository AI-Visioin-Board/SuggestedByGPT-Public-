import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRODUCTS } from '@shared/products';

describe('Stripe Checkout', () => {
  describe('Products Configuration', () => {
    it('should have AI_JUMPSTART product with correct price', () => {
      expect(PRODUCTS.AI_JUMPSTART).toBeDefined();
      expect(PRODUCTS.AI_JUMPSTART.price).toBe(99);
      expect(PRODUCTS.AI_JUMPSTART.stripePriceId).toBeTruthy();
      expect(PRODUCTS.AI_JUMPSTART.id).toBe('ai_jumpstart');
    });

    it('should have AI_DOMINATOR product with correct price', () => {
      expect(PRODUCTS.AI_DOMINATOR).toBeDefined();
      expect(PRODUCTS.AI_DOMINATOR.price).toBe(199);
      expect(PRODUCTS.AI_DOMINATOR.stripePriceId).toBeTruthy();
      expect(PRODUCTS.AI_DOMINATOR.id).toBe('ai_dominator');
    });

    it('should have PAYMENT_TEST product with $5 price', () => {
      expect(PRODUCTS.PAYMENT_TEST).toBeDefined();
      expect(PRODUCTS.PAYMENT_TEST.price).toBe(5);
      expect(PRODUCTS.PAYMENT_TEST.stripePriceId).toBeTruthy();
      expect(PRODUCTS.PAYMENT_TEST.id).toBe('payment_test');
      expect((PRODUCTS.PAYMENT_TEST as any).isTest).toBe(true);
    });

    it('should have valid Stripe price IDs for all products', () => {
      Object.values(PRODUCTS).forEach((product) => {
        expect(product.stripePriceId).toMatch(/^price_/);
      });
    });

    it('should have correct currency for all products', () => {
      Object.values(PRODUCTS).forEach((product) => {
        expect(product.currency).toBe('usd');
      });
    });

    it('should have features array for all products', () => {
      Object.values(PRODUCTS).forEach((product) => {
        expect(Array.isArray(product.features)).toBe(true);
        expect(product.features.length).toBeGreaterThan(0);
      });
    });
  });
});
