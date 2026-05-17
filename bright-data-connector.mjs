/**
 * Bright Data API Connector
 * Mock/stub mode until May 25 when BD_API_KEY is wired
 */

const BD_API_KEY = process.env.BD_API_KEY;
const BD_CUSTOMER_ID = process.env.BD_CUSTOMER_ID;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Web Unlocker - fetch raw HTML/text from any URL
 * @param {string} url - Target URL
 * @returns {Promise<{url: string, text: string, status: number, chars: number}>}
 */
export async function webUnlocker(url) {
  await sleep(1600); // Simulate network latency

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    // Mock mode
    const mockText = `
      Welcome to Example Company - Industry-Leading Solutions

      Founded in 2015, Example Company has grown to become a trusted partner for over 5,000 enterprises worldwide.
      Our mission is to deliver innovative technology solutions that drive business transformation.

      Products & Services:
      - Enterprise Software Platform
      - Cloud Infrastructure Solutions
      - Professional Services & Consulting
      - 24/7 Customer Support

      Recent Achievements:
      - Named a Leader in Gartner Magic Quadrant 2025
      - $250M Series D funding round completed
      - Expanded to 15 countries across 4 continents
      - 99.99% uptime SLA maintained for 18 consecutive months

      Leadership Team:
      Our executive team brings decades of experience from Fortune 500 companies and leading startups.

      Customers include Fortune 500 companies across finance, healthcare, retail, and technology sectors.

      Join Our Team:
      We're hiring talented engineers, product managers, and sales professionals. Visit our careers page.

      Contact: info@example.com | +1-555-0100 | San Francisco, CA
    `.trim();

    return {
      url,
      text: mockText,
      status: 200,
      chars: mockText.length
    };
  }

  // Real BD Web Unlocker API
  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      zone: 'unlocker',
      url,
      format: 'raw'
    })
  });

  const text = await response.text();
  return {
    url,
    text,
    status: response.status,
    chars: text.length
  };
}

/**
 * SERP API - Google search results
 * @param {string} query - Search query
 * @returns {Promise<{query: string, results: Array}>}
 */
export async function serpApi(query) {
  await sleep(1100); // Simulate network latency

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    // Mock mode
    return {
      query,
      results: [
        {
          title: 'Example Company Announces Major Product Launch',
          snippet: 'Industry leader Example Company today unveiled its next-generation platform, featuring AI-powered analytics and enhanced security...',
          url: 'https://techcrunch.com/2026/05/example-company-launch',
          date: '2026-05-14'
        },
        {
          title: 'Example Company Raises $250M in Series D Funding',
          snippet: 'The enterprise software company has secured $250 million in new funding led by Sequoia Capital and Andreessen Horowitz...',
          url: 'https://venturebeat.com/2026/04/example-company-funding',
          date: '2026-04-22'
        },
        {
          title: 'CEO Interview: The Future of Enterprise Software',
          snippet: 'We sat down with Example Company CEO to discuss their vision for transforming how businesses leverage technology...',
          url: 'https://forbes.com/2026/03/example-company-ceo-interview',
          date: '2026-03-15'
        },
        {
          title: 'Example Company Expands to European Market',
          snippet: 'With new offices in London, Berlin, and Paris, the company is accelerating its international growth strategy...',
          url: 'https://bloomberg.com/2026/02/example-company-europe',
          date: '2026-02-28'
        },
        {
          title: 'Industry Report: Example Company Named Market Leader',
          snippet: 'Gartner positions Example Company in the Leaders quadrant for the third consecutive year, citing innovation and customer satisfaction...',
          url: 'https://gartner.com/reports/2026-magic-quadrant',
          date: '2026-01-10'
        }
      ]
    };
  }

  // Real BD SERP API
  const response = await fetch('https://api.brightdata.com/serp', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      engine: 'google',
      q: query,
      num: 10
    })
  });

  const data = await response.json();
  return {
    query,
    results: data.organic_results || []
  };
}

/**
 * Scraping Browser - headless browser for SPAs and JS-heavy sites
 * @param {string[]} urls - Array of URLs to scrape
 * @returns {Promise<Array<{url: string, text: string, status: number}>>}
 */
export async function scrapingBrowser(urls) {
  await sleep(2300); // Simulate browser launch + navigation

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    // Mock mode
    return urls.map(url => {
      let text = '';

      if (url.includes('linkedin.com')) {
        text = `
          Example Company | LinkedIn

          About: Enterprise software and cloud solutions company
          Website: example.com
          Industry: Computer Software
          Company size: 501-1,000 employees
          Headquarters: San Francisco, California
          Type: Privately Held
          Founded: 2015
          Specialties: Cloud Computing, Enterprise Software, SaaS, Data Analytics

          Overview:
          Example Company provides innovative enterprise solutions that help businesses transform digitally.
          Our platform serves 5,000+ customers globally with best-in-class reliability and security.

          Recent Posts:
          - Excited to announce our Series D funding round!
          - Join us at TechConf 2026 next month
          - We're hiring across engineering, sales, and customer success

          Employees: 850+ on LinkedIn
        `.trim();
      } else if (url.includes('crunchbase.com')) {
        text = `
          Example Company - Crunchbase Company Profile

          Overview:
          Example Company is an enterprise software provider specializing in cloud infrastructure and analytics.

          Funding: $425M total raised
          - Series D: $250M (Apr 2026)
          - Series C: $100M (May 2024)
          - Series B: $50M (Aug 2022)
          - Series A: $25M (Jan 2021)

          Investors: Sequoia Capital, Andreessen Horowitz, Accel, Kleiner Perkins

          Founders:
          - Jane Smith (CEO)
          - John Doe (CTO)

          Headquarters: San Francisco, CA
          Employees: 800-1000

          Categories: Enterprise Software, Cloud Computing, SaaS, B2B

          Recent News:
          - Acquired DataViz Corp for $30M (Mar 2026)
          - Launched AI-powered analytics suite (Feb 2026)
        `.trim();
      } else {
        text = 'Generic page content for ' + url;
      }

      return { url, text, status: 200 };
    });
  }

  // Real BD Scraping Browser via Playwright CDP
  const { chromium } = await import('playwright-core');
  const wsEndpoint = `wss://brd-customer-${BD_CUSTOMER_ID}:${BD_API_KEY}@brd.superproxy.io:9222`;
  const browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 30000 });
  const results = [];
  for (const url of urls) {
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const text = await page.evaluate(() => document.body.innerText);
      results.push({ url, text, status: 200 });
    } catch (err) {
      results.push({ url, text: '', status: 500, error: err.message });
    } finally {
      await page.close();
    }
  }
  await browser.close();
  return results;
}

/**
 * Web Scraper API - structured data extraction
 * @param {string} url - Company website URL
 * @returns {Promise<{url: string, company: Object}>}
 */
export async function webScraperApi(url) {
  await sleep(700); // Simulate API latency

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    // Mock mode
    const domain = new URL(url).hostname.replace('www.', '');
    const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);

    return {
      url,
      company: {
        name: `${companyName} Inc.`,
        founded: 2015,
        employees: '500-1000',
        headquarters: 'San Francisco, CA',
        description: `${companyName} is a leading provider of enterprise software solutions, serving over 5,000 customers worldwide with innovative cloud-based platforms and professional services.`,
        funding: {
          total: '$425M',
          lastRound: 'Series D',
          lastRoundAmount: '$250M',
          lastRoundDate: '2026-04-22',
          investors: ['Sequoia Capital', 'Andreessen Horowitz', 'Accel']
        },
        industries: ['Enterprise Software', 'Cloud Computing', 'SaaS'],
        website: url,
        socialMedia: {
          linkedin: `https://linkedin.com/company/${domain.split('.')[0]}`,
          twitter: `https://twitter.com/${domain.split('.')[0]}`
        }
      }
    };
  }

  // Real implementation: use Web Unlocker on company About page
  const aboutUrl = url.replace(/\/$/, '') + '/about';
  const [homeResp, aboutResp] = await Promise.allSettled([
    fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${BD_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: 'unlocker', url, format: 'raw' })
    }),
    fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${BD_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: 'unlocker', url: aboutUrl, format: 'raw' })
    })
  ]);
  const homeText = homeResp.status === 'fulfilled' ? await homeResp.value.text() : '';
  const aboutText = aboutResp.status === 'fulfilled' ? await aboutResp.value.text() : '';
  return {
    url,
    company: {
      homepage: homeText.substring(0, 3000),
      about: aboutText.substring(0, 3000),
      scraped: true
    }
  };
}
