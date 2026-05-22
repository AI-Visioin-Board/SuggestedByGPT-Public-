import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/trpc";
import { getDb } from "./db";
import { clients, orders } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Client Portal Routes Test
 * Tests the tRPC routes for client portal functionality
 */

describe("Client Portal Routes", () => {
  const mockUserId = 99999; // Use a high ID to avoid conflicts
  const mockClientId = 99999;

  // Clean up test data before each test
  beforeEach(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // Delete test data
    await db.delete(orders).where(eq(orders.clientId, mockClientId));
    await db.delete(clients).where(eq(clients.userId, mockUserId));
  });

  it("should throw error when client profile does not exist", async () => {
    const mockContext: TrpcContext = {
      req: {} as any,
      res: {} as any,
      user: {
        id: mockUserId,
        openId: "test-open-id",
        name: "Test User",
        email: "test@example.com",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
        loginMethod: "email",
      },
    };

    const caller = appRouter.createCaller(mockContext);

    await expect(caller.clientPortal.getMyProfile()).rejects.toThrow("Client profile not found");
  });

  it("should return client profile when it exists", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test client
    await db.insert(clients).values({
      id: mockClientId,
      userId: mockUserId,
      fullName: "John Doe",
      email: "john@example.com",
      phone: "555-0123",
      businessName: "Test Business",
      businessWebsite: "https://testbusiness.com",
      industry: "Technology",
      businessAddress: "123 Test St",
      targetLocation: "Miami, FL",
      servicesOffered: "Web development, SEO",
      cmsType: "WordPress",
      hasGoogleProfile: false,
      competitors: "competitor1.com, competitor2.com",
      additionalGoals: "Increase AI visibility",
    });

    const mockContext: TrpcContext = {
      req: {} as any,
      res: {} as any,
      user: {
        id: mockUserId,
        openId: "test-open-id",
        name: "Test User",
        email: "test@example.com",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
        loginMethod: "email",
      },
    };

    const caller = appRouter.createCaller(mockContext);
    const profile = await caller.clientPortal.getMyProfile();

    expect(profile).toBeDefined();
    expect(profile.fullName).toBe("John Doe");
    expect(profile.businessName).toBe("Test Business");
    expect(profile.email).toBe("john@example.com");
  });

  it("should return empty array when client has no orders", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test client without orders
    await db.insert(clients).values({
      id: mockClientId,
      userId: mockUserId,
      fullName: "Jane Doe",
      email: "jane@example.com",
      businessName: "Another Business",
      businessWebsite: "https://anotherbusiness.com",
    });

    const mockContext: TrpcContext = {
      req: {} as any,
      res: {} as any,
      user: {
        id: mockUserId,
        openId: "test-open-id",
        name: "Test User",
        email: "test@example.com",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
        loginMethod: "email",
      },
    };

    const caller = appRouter.createCaller(mockContext);
    const ordersList = await caller.clientPortal.getMyOrders();

    expect(ordersList).toBeDefined();
    expect(Array.isArray(ordersList)).toBe(true);
    expect(ordersList.length).toBe(0);
  });

  it("should return orders when client has them", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test client
    await db.insert(clients).values({
      id: mockClientId,
      userId: mockUserId,
      fullName: "Bob Smith",
      email: "bob@example.com",
      businessName: "Bob's Business",
      businessWebsite: "https://bobsbusiness.com",
    });

    // Create test order
    await db.insert(orders).values({
      clientId: mockClientId,
      packageType: "jumpstart",
      price: "99.00",
      status: "processing",
      stripePaymentId: "pi_test_123",
    });

    const mockContext: TrpcContext = {
      req: {} as any,
      res: {} as any,
      user: {
        id: mockUserId,
        openId: "test-open-id",
        name: "Test User",
        email: "test@example.com",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
        loginMethod: "email",
      },
    };

    const caller = appRouter.createCaller(mockContext);
    const ordersList = await caller.clientPortal.getMyOrders();

    expect(ordersList).toBeDefined();
    expect(Array.isArray(ordersList)).toBe(true);
    expect(ordersList.length).toBe(1);
    expect(ordersList[0].packageType).toBe("jumpstart");
    expect(ordersList[0].status).toBe("processing");
    expect(ordersList[0].price).toBe("99.00");
  });
});
