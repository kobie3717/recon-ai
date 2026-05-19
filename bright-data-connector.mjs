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
  await sleep(400); // Simulate network latency

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

  if (!response.ok) throw new Error(`BD Web Unlocker ${response.status}`);
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
  await sleep(300); // Simulate network latency

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

  if (!response.ok) throw new Error(`BD SERP API ${response.status}`);
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
  await sleep(600); // Simulate browser launch + navigation

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
  if (!BD_CUSTOMER_ID) {
    throw new Error('BD_CUSTOMER_ID env var required for Scraping Browser (set in Railway environment)');
  }
  const { chromium } = await import('playwright-core');
  const wsEndpoint = `wss://brd-customer-${BD_CUSTOMER_ID}:${BD_API_KEY}@brd.superproxy.io:9222`;
  const browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 30000 });
  const results = [];
  try {
    for (const url of urls) {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const text = await page.evaluate(() => document.body.innerText);
        results.push({ url, text, status: 200 });
      } catch (err) {
        results.push({ url, text: '', status: 500 });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return results;
}

/**
 * Web Scraper API - structured data extraction
 * @param {string} url - Company website URL
 * @returns {Promise<{url: string, company: Object}>}
 */
export async function webScraperApi(url) {
  await sleep(200); // Simulate API latency

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
  const homeText = homeResp.status === 'fulfilled' && homeResp.value.ok ? await homeResp.value.text() : '';
  const aboutText = aboutResp.status === 'fulfilled' && aboutResp.value.ok ? await aboutResp.value.text() : '';
  return {
    url,
    company: {
      homepage: homeText.substring(0, 3000),
      about: aboutText.substring(0, 3000),
      scraped: true
    }
  };
}

/**
 * Crawl API - crawl up to 15 pages from a domain and return as markdown
 * @param {string} domain - Target domain (e.g. "stripe.com")
 * @returns {Promise<{domain: string, pages: Array, pageCount: number, totalChars: number}>}
 */
export async function crawlApi(domain) {
  await sleep(2800);

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    // Mock mode - return 5 plausible pages
    const mockPages = [
      {
        url: `https://${domain}`,
        title: 'Home - Industry-Leading Platform',
        text: 'Welcome to our enterprise platform. We help businesses transform with cutting-edge technology. Trusted by over 5,000 companies worldwide. Our mission is to deliver innovative solutions that drive measurable results and accelerate digital transformation.'
      },
      {
        url: `https://${domain}/about`,
        title: 'About Us - Our Story',
        text: 'Founded in 2018 by industry veterans from Google and Stripe. Our team of 850+ employees across 12 offices is dedicated to solving complex enterprise challenges. Backed by Sequoia Capital and Andreessen Horowitz. We believe in transparency, innovation, and customer-first culture.'
      },
      {
        url: `https://${domain}/pricing`,
        title: 'Pricing - Choose Your Plan',
        text: 'Starter Plan: $299/month - Perfect for growing teams up to 50 users. Includes core features and email support. Professional Plan: $999/month - For mid-market teams up to 500 users. Advanced analytics and priority support. Enterprise Plan: Custom pricing - Unlimited users, dedicated account manager, SLA guarantees, custom integrations, and white-glove onboarding.'
      },
      {
        url: `https://${domain}/careers`,
        title: 'Careers - Join Our Team',
        text: 'We are hiring talented people to join our mission. Currently 12 open roles in Engineering (Backend, Frontend, ML), Product Management, Sales, and Customer Success. We offer competitive compensation, equity, comprehensive benefits, remote-friendly culture, and unlimited PTO. Offices in San Francisco, New York, London, and Berlin.'
      },
      {
        url: `https://${domain}/blog`,
        title: 'Blog - Latest Updates',
        text: 'Recent posts: Announcing our Series D funding round ($250M). How we scaled to 99.99% uptime with multi-region architecture. Interview with our CEO on the future of enterprise software. Customer story: How Fortune 500 company saved $2M annually. Engineering deep dive: Our migration to Kubernetes and service mesh.'
      }
    ];

    const totalChars = mockPages.reduce((sum, p) => sum + p.text.length, 0);

    return {
      domain,
      pages: mockPages,
      pageCount: mockPages.length,
      totalChars
    };
  }

  // Real BD Crawl API
  const response = await fetch('https://api.brightdata.com/crawler/v1/crawl', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: `https://${domain}`,
      max_pages: 15,
      format: 'markdown'
    })
  });

  const data = await response.json();
  const pages = data.pages || [];
  const totalChars = pages.reduce((sum, p) => sum + (p.text || '').length, 0);

  return {
    domain,
    pages,
    pageCount: pages.length,
    totalChars
  };
}

/**
 * Discover API - find subdomains, related domains, and web properties (FREE)
 * @param {string} domain - Target domain (e.g. "stripe.com")
 * @returns {Promise<{domain: string, subdomains: string[], relatedDomains: string[], webProperties: Array, totalFound: number}>}
 */
export async function discoverApi(domain) {
  await sleep(1200);

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    // Mock mode - realistic discovery data
    const baseSlug = domain.split('.')[0];
    const tld = domain.split('.').slice(1).join('.');

    const mockSubdomains = [
      `api.${domain}`,
      `docs.${domain}`,
      `app.${domain}`,
      `status.${domain}`,
      `cdn.${domain}`,
      `blog.${domain}`,
      `dev.${domain}`,
      `staging.${domain}`
    ];

    const mockRelatedDomains = [
      `${baseSlug}.io`,
      `${baseSlug}.co`,
      `get${baseSlug}.com`
    ];

    const mockWebProperties = [
      { type: 'Twitter', url: `https://twitter.com/${baseSlug}`, platform: 'twitter', followers: '45K' },
      { type: 'GitHub', url: `https://github.com/${baseSlug}`, platform: 'github', repos: 34 },
      { type: 'LinkedIn', url: `https://linkedin.com/company/${baseSlug}`, platform: 'linkedin', followers: '12K' },
      { type: 'YouTube', url: `https://youtube.com/@${baseSlug}`, platform: 'youtube', subscribers: '8.2K' },
      { type: 'Facebook', url: `https://facebook.com/${baseSlug}`, platform: 'facebook', followers: '22K' }
    ];

    return {
      domain,
      subdomains: mockSubdomains,
      relatedDomains: mockRelatedDomains,
      webProperties: mockWebProperties,
      totalFound: mockSubdomains.length + mockRelatedDomains.length + mockWebProperties.length
    };
  }

  // Real BD Discover API
  const response = await fetch('https://api.brightdata.com/discover/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: domain,
      type: 'domain_discovery'
    })
  });

  const data = await response.json();

  return {
    domain,
    subdomains: data.subdomains || [],
    relatedDomains: data.related_domains || [],
    webProperties: data.web_properties || [],
    totalFound: (data.subdomains?.length || 0) + (data.related_domains?.length || 0) + (data.web_properties?.length || 0)
  };
}

/**
 * LinkedIn Scraper API - company profile data
 * @param {string} companySlug - LinkedIn company slug (e.g. "stripe")
 * @returns {Promise<{companySlug: string, name: string, employees: string, followers: string, founded: string, hq: string, description: string, specialties: string[], recentPosts: Array, topRoles: string[]}>}
 */
export async function linkedinScraperApi(companySlug) {
  await sleep(1800);

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    // Mock mode - realistic LinkedIn company data
    const companyName = companySlug.charAt(0).toUpperCase() + companySlug.slice(1);

    return {
      companySlug,
      name: `${companyName} Inc.`,
      employees: '850',
      followers: '12,400',
      founded: '2018',
      hq: 'San Francisco, California',
      description: `${companyName} provides enterprise software solutions that help businesses transform digitally. Our platform serves thousands of customers globally with best-in-class reliability, security, and innovation.`,
      specialties: [
        'Enterprise Software',
        'Cloud Computing',
        'SaaS',
        'Data Analytics',
        'API Infrastructure',
        'Developer Tools'
      ],
      recentPosts: [
        { text: 'Excited to announce our Series D funding round! Thank you to our investors and customers for believing in our mission.', date: '2026-04-25', likes: 847 },
        { text: 'Join us at TechConf 2026 next month where our CEO will keynote on the future of enterprise software.', date: '2026-04-18', likes: 312 },
        { text: 'We are hiring! 12 open roles across Engineering, Product, Sales, and Customer Success. Check our careers page.', date: '2026-04-10', likes: 523 }
      ],
      topRoles: [
        'Software Engineer',
        'Senior Product Manager',
        'Enterprise Account Executive',
        'Customer Success Manager',
        'DevOps Engineer',
        'Data Scientist'
      ]
    };
  }

  // Real BD LinkedIn Scraper API
  const response = await fetch('https://api.brightdata.com/datasets/v3/snapshot', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      dataset_id: 'gd_l1viktl72bvl7bjuj0',
      params: [{
        url: `https://www.linkedin.com/company/${companySlug}`
      }]
    })
  });

  const data = await response.json();
  const company = data.results?.[0] || {};

  return {
    companySlug,
    name: company.name || '',
    employees: company.employees || '',
    followers: company.followers || '',
    founded: company.founded || '',
    hq: company.headquarters || '',
    description: company.description || '',
    specialties: company.specialties || [],
    recentPosts: company.recent_posts || [],
    topRoles: company.top_roles || []
  };
}

/**
 * Social Media Scraper - Twitter and Reddit presence
 * @param {string} companySlug - Company slug/handle
 * @param {string} domain - Domain for fallback searches
 * @returns {Promise<{companySlug: string, twitter: Object, reddit: Object}>}
 */
export async function socialMediaScraper(companySlug, domain) {
  await sleep(1500);

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    // Mock mode - realistic social media data
    return {
      companySlug,
      twitter: {
        handle: `@${companySlug}`,
        followers: '45,200',
        recentMentions: [
          { text: `Just migrated our entire infrastructure to ${companySlug}. Best decision we made this year. Performance is incredible!`, date: '2026-05-18', sentiment: 'positive', likes: 234 },
          { text: `${companySlug} support team is top-notch. Had an issue resolved in under 30 minutes. This is how you do enterprise software.`, date: '2026-05-15', sentiment: 'positive', likes: 156 },
          { text: `Pricing on ${companySlug} is a bit steep for our team size, but the features are solid. Wish they had a better mid-tier option.`, date: '2026-05-12', sentiment: 'neutral', likes: 89 }
        ],
        sentimentBreakdown: {
          positive: 68,
          neutral: 24,
          negative: 8
        }
      },
      reddit: {
        subreddit: `r/${companySlug}`,
        subscribers: '3,200',
        recentPosts: [
          { title: `How we achieved 99.99% uptime with ${companySlug} - our 2-year journey`, score: 142, comments: 34 },
          { title: `${companySlug} vs [competitor] - detailed comparison for enterprise teams`, score: 98, comments: 56 },
          { title: `Feature request: would love to see better Slack integration`, score: 67, comments: 23 }
        ]
      }
    };
  }

  // Real BD Social Media Scraper API
  const response = await fetch('https://api.brightdata.com/datasets/v3/snapshot', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      dataset_id: 'gd_lwxkxvnf1cynvib3no',
      params: [{
        keyword: companySlug,
        platform: 'twitter'
      }]
    })
  });

  const data = await response.json();
  const twitterData = data.results?.twitter || {};
  const redditData = data.results?.reddit || {};

  return {
    companySlug,
    twitter: {
      handle: twitterData.handle || `@${companySlug}`,
      followers: twitterData.followers || '',
      recentMentions: twitterData.recent_mentions || [],
      sentimentBreakdown: twitterData.sentiment_breakdown || {}
    },
    reddit: {
      subreddit: redditData.subreddit || '',
      subscribers: redditData.subscribers || '',
      recentPosts: redditData.recent_posts || []
    }
  };
}
