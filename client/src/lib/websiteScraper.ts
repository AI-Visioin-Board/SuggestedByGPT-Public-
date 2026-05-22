/**
 * Website scraper utility - calls backend API to extract business information
 * Backend handles fetching and parsing to avoid CORS issues
 */

export interface ScrapedBusinessInfo {
  businessName: string;
  industry: string;
  servicesOffered: string;
  businessPhone: string;
  businessAddress: string;
  socialLinks: string;
}

export async function scrapeWebsite(url: string): Promise<Partial<ScrapedBusinessInfo>> {
  try {
    // Call backend API to scrape the website (avoids CORS issues)
    const response = await fetch('/api/scraper/scrape-website', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch website');
    }
    
    // Backend returns the extracted data directly
    const extracted: Partial<ScrapedBusinessInfo> = await response.json();
    return extracted;
  } catch (error) {
    console.error('Error scraping website:', error);
    // Return empty object if scraping fails
    return {};
  }
}
