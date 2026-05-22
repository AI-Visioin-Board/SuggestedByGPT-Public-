import { Router } from 'express';
import type { Request, Response } from 'express';
import dns from 'dns/promises';

const router = Router();

interface ScrapedBusinessInfo {
  businessName: string;
  industry: string;
  servicesOffered: string;
  businessPhone: string;
  businessAddress: string;
  socialLinks: string;
}

/**
 * Check if an IP address is private/internal (SSRF protection).
 * Blocks: loopback, private ranges, link-local, cloud metadata.
 */
function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — extract and re-check the IPv4 part
  if (ip.startsWith('::ffff:')) {
    return isPrivateIp(ip.slice(7));
  }

  // IPv4 private/reserved ranges
  if (
    ip.startsWith('127.') ||           // Loopback
    ip.startsWith('10.') ||            // Private Class A
    ip.startsWith('192.168.') ||       // Private Class C
    ip === '0.0.0.0' ||               // Unspecified
    ip === '169.254.169.254' ||        // Cloud metadata (AWS, GCP, Azure)
    ip.startsWith('169.254.') ||       // Link-local
    ip.startsWith('fc00:') ||          // IPv6 ULA
    ip.startsWith('fe80:') ||          // IPv6 link-local
    ip === '::1' ||                    // IPv6 loopback
    ip === '::' ||                     // IPv6 unspecified
    ip.startsWith('fd')                // IPv6 ULA
  ) {
    return true;
  }
  // 172.16.0.0 - 172.31.255.255
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * POST /api/scraper/scrape-website
 * Scrapes a website URL and extracts business information.
 * Protected against SSRF via DNS resolution + private IP blocklist.
 */
router.post('/scrape-website', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Normalize URL
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

    // ── SSRF Protection ────────────────────────────────────────────
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // Only allow HTTP/HTTPS
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only HTTP/HTTPS URLs are allowed' });
    }

    // Resolve hostname to IP and check against private ranges
    try {
      const { address } = await dns.lookup(parsedUrl.hostname);
      if (isPrivateIp(address)) {
        return res.status(400).json({ error: 'URL resolves to a private/internal address' });
      }
    } catch {
      return res.status(400).json({ error: 'Could not resolve hostname' });
    }

    // Fetch the website HTML with timeout and size limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch website: ${response.status}` });
    }

    // Limit response size to 5MB to prevent memory exhaustion
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Response too large' });
    }

    const html = await response.text();
    
    // Parse HTML using regex and string manipulation (no DOM parser on server)
    const extracted: Partial<ScrapedBusinessInfo> = {};

    // 1. Extract from JSON-LD schema markup
    const schemaRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = schemaRegex.exec(html)) !== null) {
      try {
        const schema = JSON.parse(match[1]);

        // Handle Organization or LocalBusiness schema
        if (schema['@type'] === 'Organization' || schema['@type'] === 'LocalBusiness') {
          if (!extracted.businessName && schema.name) {
            extracted.businessName = schema.name;
          }
          if (!extracted.industry && schema.description) {
            extracted.industry = extractIndustryFromText(schema.description);
          }
          if (!extracted.businessPhone && schema.telephone) {
            extracted.businessPhone = schema.telephone;
          }
          if (!extracted.businessAddress && schema.address) {
            if (typeof schema.address === 'string') {
              extracted.businessAddress = schema.address;
            } else if (schema.address.streetAddress) {
              extracted.businessAddress = `${schema.address.streetAddress}, ${schema.address.addressLocality}, ${schema.address.addressRegion} ${schema.address.postalCode}`;
            }
          }
          // Extract service areas if no address
          if (!extracted.businessAddress && schema.areaServed && Array.isArray(schema.areaServed)) {
            const areas = schema.areaServed.map((area: any) => {
              if (typeof area === 'string') return area;
              if (area.name) {
                const city = area.name;
                const state = area.containedInPlace?.name || '';
                return state ? `${city}, ${state}` : city;
              }
              return '';
            }).filter(Boolean);
            if (areas.length > 0) {
              extracted.businessAddress = areas.join('; ');
            }
          }
        }

        // Handle Service schema
        if (schema['@type'] === 'Service') {
          if (!extracted.servicesOffered && schema.description) {
            extracted.servicesOffered = extractServicesFromText(schema.description);
          }
          if (!extracted.industry && schema.name) {
            extracted.industry = schema.name;
          }
        }
      } catch (e) {
        console.error('Error parsing schema:', e);
      }
    }

    // 2. Extract from meta tags
    if (!extracted.businessName) {
      const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
      const twitterTitleMatch = html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i);
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      
      extracted.businessName = cleanText(
        ogTitleMatch?.[1] || 
        twitterTitleMatch?.[1] || 
        titleMatch?.[1]?.split('|')[0]?.split('-')[0] || 
        ''
      );
    }

    if (!extracted.industry) {
      const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
      const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
      const description = ogDescMatch?.[1] || metaDescMatch?.[1] || '';
      if (description) {
        extracted.industry = extractIndustryFromText(description);
      }
    }

    // 3. Extract phone number
    if (!extracted.businessPhone) {
      const phoneRegex = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
      const phoneMatches = html.match(phoneRegex);
      if (phoneMatches && phoneMatches.length > 0) {
        extracted.businessPhone = phoneMatches[0];
      }
    }

    // 4. Extract address
    if (!extracted.businessAddress) {
      const addressRegex = /\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|circle|cir|way)[,\s]+[\w\s]+,\s*[A-Z]{2}\s+\d{5}/gi;
      const addressMatches = html.match(addressRegex);
      if (addressMatches && addressMatches.length > 0) {
        extracted.businessAddress = cleanText(addressMatches[0]);
      }
    }

    // 5. Extract social media links
    const socialDomains = ['facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'tiktok.com'];
    const socialLinks: string[] = [];
    const hrefRegex = /href="([^"]+)"/gi;
    let hrefMatch;
    while ((hrefMatch = hrefRegex.exec(html)) !== null) {
      const href = hrefMatch[1];
      socialDomains.forEach(domain => {
        if (href.includes(domain) && !socialLinks.some(l => l.includes(domain))) {
          socialLinks.push(href);
        }
      });
    }
    if (socialLinks.length > 0) {
      extracted.socialLinks = socialLinks.join('\n');
    }

    // 6. Extract services from page content if not found in schema
    if (!extracted.servicesOffered) {
      // Look for common service-related patterns in the HTML
      const servicePatterns = [
        /(?:services?|offerings?|we offer|including|providing)[\s:]+([^<.]{20,300})/i,
      ];

      for (const pattern of servicePatterns) {
        const serviceMatch = html.match(pattern);
        if (serviceMatch && serviceMatch[1]) {
          extracted.servicesOffered = cleanText(serviceMatch[1]).substring(0, 300);
          break;
        }
      }
    }

    return res.json(extracted);
  } catch (error) {
    console.error('Scraping error:', error);
    return res.status(500).json({ error: 'Failed to scrape website' });
  }
});

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
    .substring(0, 200);
}

function extractIndustryFromText(text: string): string {
  const keywords = {
    'Short-Term Rental Management': ['short-term rental', 'str management', 'airbnb management', 'vacation rental management'],
    'Property Management': ['property management', 'real estate management'],
    'Plumbing': ['plumb', 'pipe', 'drain', 'water heater'],
    'HVAC': ['hvac', 'heating', 'cooling', 'air conditioning', 'furnace'],
    'Legal Services': ['law', 'attorney', 'lawyer', 'legal'],
    'Real Estate': ['real estate', 'realtor', 'homes for sale'],
    'Restaurant': ['restaurant', 'dining', 'food service', 'cuisine'],
    'Retail': ['retail', 'store', 'shop'],
    'Healthcare': ['medical', 'health', 'doctor', 'clinic', 'dental'],
    'Consulting': ['consult', 'advisory', 'strategy'],
    'Construction': ['construction', 'contractor', 'building', 'remodel'],
    'Marketing': ['marketing', 'advertising', 'seo', 'digital marketing'],
  };

  const lowerText = text.toLowerCase();

  for (const [industry, terms] of Object.entries(keywords)) {
    if (terms.some(term => lowerText.includes(term))) {
      return industry;
    }
  }

  // Fallback: return first 100 chars
  return text.substring(0, 100).trim();
}

function extractServicesFromText(text: string): string {
  // Common service-related patterns
  const servicePatterns = [
    /(?:services?|offerings?|we offer|including|providing)[\s:]+([^.]{20,300})/i,
  ];

  for (const pattern of servicePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim().substring(0, 300);
    }
  }

  // Fallback: return first 200 chars
  return text.substring(0, 200).trim();
}

export default router;
