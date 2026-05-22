/**
 * Citation Building Execution (Step 4)
 */

import { getDb } from './db';
import { deliverables } from '../drizzle/schema';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateCitationBuildingPackage } from './citationBuilder';

const execAsync = promisify(exec);

// Upload file to S3 and return CDN URL
async function uploadToS3(filePath: string): Promise<string> {
  const { stdout } = await execAsync(`manus-upload-file ${filePath}`);
  const match = stdout.match(/https:\/\/[^\s]+/);
  if (!match) throw new Error('Failed to extract CDN URL from upload output');
  return match[0].trim();
}

// Notify owner instead of sending email (Gmail MCP requires UI confirmation)
import { notifyOwner } from './_core/notification';

async function notifyOwnerAboutDeliverable(clientName: string, deliverableType: string, clientEmail: string) {
  try {
    await notifyOwner({
      title: `✅ ${deliverableType} Ready for ${clientName}`,
      content: `The ${deliverableType} has been generated and is now available in the client portal for ${clientName} (${clientEmail}). The client can download it from their portal.`,
    });
    console.log(`[Notification] Owner notified about ${deliverableType} for ${clientName}`);
    return true;
  } catch (error) {
    console.error(`[Notification] Failed to notify owner:`, error);
    return false;
  }
}

export async function executeCitationBuilding(order: any, client: any) {
  console.log(`[Citation Building] Starting for ${client.businessName}...`);
  
  try {
    // Step 1: Generate citation building guide
    const citationMarkdown = await generateCitationBuildingPackage({
      businessName: client.businessName,
      businessWebsite: client.businessWebsite,
      industry: client.industry || 'Professional Services',
      businessAddress: client.businessAddress || '',
      targetLocation: client.targetLocation || '',
      servicesOffered: client.servicesOffered || '',
      phone: client.phone,
    });
    
    console.log(`[Citation Building] Generated guide (${citationMarkdown.length} chars)`);
    
    // Step 2: Save markdown to temp file
    const sanitizedName = client.businessName.replace(/[^a-zA-Z0-9]/g, '_');
    const mdPath = join(tmpdir(), `${sanitizedName}_Citation_Building.md`);
    writeFileSync(mdPath, citationMarkdown);
    
    // Step 3: Convert to PDF
    const pdfPath = join(tmpdir(), `${sanitizedName}_Citation_Building.pdf`);
    await execAsync(`manus-md-to-pdf ${mdPath} ${pdfPath}`);
    console.log(`[Citation Building] PDF created: ${pdfPath}`);
    
    // Step 4: Upload to S3
    const cdnUrl = await uploadToS3(pdfPath);
    console.log(`[Citation Building] PDF uploaded: ${cdnUrl}`);
    
    // Step 5: Create deliverable record
    const db = await getDb();
    if (!db) {
      console.error('[Citation Building] Database not available');
      return false;
    }
    
    await db.insert(deliverables).values({
      orderId: order.id,
      deliverableType: 'citation_building',
      title: 'Citation Building & Directory Submission Guide',
      description: 'Complete guide to submitting your business to 20 high-authority directories including Google Business Profile, Yelp, Bing Places, BBB, and more. Includes step-by-step instructions, priority rankings, and progress tracking.',
      status: 'completed',
      fileUrl: cdnUrl,
      completedAt: new Date(),
      notes: 'Start with high-priority directories (Google, Yelp, Bing). Use exact same NAP (Name, Address, Phone) across all platforms. Track progress with checkboxes.',
    });
    
    console.log(`[Citation Building] Deliverable created successfully`);
    
    // Step 6: Notify owner (client will see it in portal)
    await notifyOwnerAboutDeliverable(
      client.businessName,
      'Citation Building Guide',
      client.email
    );
    
    console.log(`[Citation Building] ✅ Completed successfully for ${client.businessName}`);
    return true;
    
  } catch (error) {
    console.error(`[Citation Building] Failed for ${client.businessName}:`, error);
    return false;
  }
}
