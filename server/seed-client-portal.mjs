/**
 * Seed script for client portal test data
 * Run with: node server/seed-client-portal.mjs
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function seed() {
  console.log('🌱 Seeding client portal test data...\n');

  // Create database connection
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);

  try {
    // First, get or create a test user
    const [users] = await connection.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      ['test@suggestedbygpt.com']
    );

    let userId;
    if (users.length === 0) {
      console.log('Creating test user...');
      const [result] = await connection.execute(
        `INSERT INTO users (openId, name, email, loginMethod, role) 
         VALUES (?, ?, ?, ?, ?)`,
        ['test-seed-openid-123', 'Test Client', 'test@suggestedbygpt.com', 'email', 'user']
      );
      userId = result.insertId;
      console.log(`✅ Created test user with ID: ${userId}\n`);
    } else {
      userId = users[0].id;
      console.log(`✅ Found existing test user with ID: ${userId}\n`);
    }

    // Check if client already exists
    const [existingClients] = await connection.execute(
      'SELECT id FROM clients WHERE userId = ? LIMIT 1',
      [userId]
    );

    let clientId;
    if (existingClients.length === 0) {
      console.log('Creating test client...');
      const [clientResult] = await connection.execute(
        `INSERT INTO clients (
          userId, fullName, email, phone, businessName, businessWebsite,
          industry, businessAddress, targetLocation, servicesOffered,
          cmsType, hasGoogleProfile, competitors, additionalGoals
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          'John Doe',
          'test@suggestedbygpt.com',
          '555-123-4567',
          'Test SEO Agency',
          'https://testseoagency.com',
          'Digital Marketing',
          '123 Main St, Miami, FL 33101',
          'Miami, FL',
          'SEO, Content Marketing, AI Optimization',
          'WordPress',
          false,
          'competitor1.com, competitor2.com',
          'Become the #1 AI-recommended SEO agency in Miami'
        ]
      );
      clientId = clientResult.insertId;
      console.log(`✅ Created test client with ID: ${clientId}\n`);
    } else {
      clientId = existingClients[0].id;
      console.log(`✅ Found existing test client with ID: ${clientId}\n`);
    }

    // Check if order already exists
    const [existingOrders] = await connection.execute(
      'SELECT id FROM orders WHERE clientId = ? LIMIT 1',
      [clientId]
    );

    let orderId;
    if (existingOrders.length === 0) {
      console.log('Creating test order...');
      const [orderResult] = await connection.execute(
        `INSERT INTO orders (clientId, packageType, price, status, stripePaymentId)
         VALUES (?, ?, ?, ?, ?)`,
        [clientId, 'jumpstart', '99.00', 'processing', 'pi_test_seed_123']
      );
      orderId = orderResult.insertId;
      console.log(`✅ Created test order with ID: ${orderId}\n`);
    } else {
      orderId = existingOrders[0].id;
      console.log(`✅ Found existing test order with ID: ${orderId}\n`);
    }

    // Create deliverables
    console.log('Creating test deliverables...');
    const deliverables = [
      {
        orderId,
        deliverableType: 'ai_assessment',
        title: 'AI Needs Assessment',
        description: 'Comprehensive analysis of your current AI visibility',
        status: 'completed',
        fileUrl: 'https://example.com/assessment.pdf',
        notes: 'Download your personalized AI visibility report'
      },
      {
        orderId,
        deliverableType: 'schema_markup',
        title: 'Schema Markup Implementation',
        description: 'Structured data added to your website',
        status: 'in_progress',
        fileUrl: null,
        notes: 'Waiting for website access credentials'
      },
      {
        orderId,
        deliverableType: 'citation_audit',
        title: 'Citation Audit & Cleanup',
        description: 'Review and fix business listings across directories',
        status: 'pending',
        fileUrl: null,
        notes: null
      },
      {
        orderId,
        deliverableType: 'ai_visibility_report',
        title: 'AI Visibility Report',
        description: 'Test results showing your business in AI responses',
        status: 'pending',
        fileUrl: null,
        notes: null
      },
      {
        orderId,
        deliverableType: 'review_strategy',
        title: 'Review Generation Strategy',
        description: 'Templates and process for generating customer reviews',
        status: 'pending',
        fileUrl: null,
        notes: null
      },
      {
        orderId,
        deliverableType: 'content_assessment',
        title: 'Website Content Assessment',
        description: 'Analysis of your website content for AI optimization',
        status: 'pending',
        fileUrl: null,
        notes: null
      }
    ];

    for (const deliverable of deliverables) {
      const [existing] = await connection.execute(
        'SELECT id FROM deliverables WHERE orderId = ? AND deliverableType = ? LIMIT 1',
        [deliverable.orderId, deliverable.deliverableType]
      );

      if (existing.length === 0) {
        await connection.execute(
          `INSERT INTO deliverables (orderId, deliverableType, title, description, status, fileUrl, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            deliverable.orderId,
            deliverable.deliverableType,
            deliverable.title,
            deliverable.description,
            deliverable.status,
            deliverable.fileUrl,
            deliverable.notes
          ]
        );
        console.log(`  ✅ Created deliverable: ${deliverable.title}`);
      } else {
        console.log(`  ⏭️  Deliverable already exists: ${deliverable.title}`);
      }
    }

    // Create action items
    console.log('\nCreating test action items...');
    const actionItems = [
      {
        orderId,
        actionType: 'provide_credentials',
        title: 'Provide Website Access',
        description: 'We need admin access to your WordPress site to add schema markup',
        status: 'pending'
      },
      {
        orderId,
        actionType: 'verify_gbp',
        title: 'Verify Google Business Profile',
        description: 'Check your email and click the verification link from Google',
        status: 'pending'
      }
    ];

    for (const item of actionItems) {
      const [existing] = await connection.execute(
        'SELECT id FROM action_items WHERE orderId = ? AND actionType = ? LIMIT 1',
        [item.orderId, item.actionType]
      );

      if (existing.length === 0) {
        await connection.execute(
          `INSERT INTO action_items (orderId, actionType, title, description, status)
           VALUES (?, ?, ?, ?, ?)`,
          [item.orderId, item.actionType, item.title, item.description, item.status]
        );
        console.log(`  ✅ Created action item: ${item.title}`);
      } else {
        console.log(`  ⏭️  Action item already exists: ${item.title}`);
      }
    }

    // Create progress log entries
    console.log('\nCreating test progress log...');
    const progressEntries = [
      {
        orderId,
        deliverableId: null,
        message: 'Order received and payment confirmed'
      },
      {
        orderId,
        deliverableId: null,
        message: 'AI Needs Assessment completed and ready for download'
      },
      {
        orderId,
        deliverableId: null,
        message: 'Waiting for client to provide website access credentials'
      }
    ];

    for (const entry of progressEntries) {
      await connection.execute(
        `INSERT INTO progress_log (orderId, deliverableId, message)
         VALUES (?, ?, ?)`,
        [entry.orderId, entry.deliverableId, entry.message]
      );
      console.log(`  ✅ Added progress log: ${entry.message}`);
    }

    console.log('\n✅ Seeding completed successfully!\n');
    console.log('📋 Test Account Details:');
    console.log(`   Email: test@suggestedbygpt.com`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Client ID: ${clientId}`);
    console.log(`   Order ID: ${orderId}`);
    console.log('\n🔗 To view the client portal, log in with this test account and visit /portal\n');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

seed()
  .then(() => {
    console.log('✅ Seed script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed script failed:', error);
    process.exit(1);
  });
