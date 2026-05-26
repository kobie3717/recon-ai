/**
 * Bright Data API Connector
 * Env-driven zone names + honest error propagation
 */

// Read env lazily — module-level const captured undefined because dotenv.config()
// runs AFTER ESM imports resolve their top-level code.
const getKey = () => process.env.BD_API_KEY;
const getCustomerId = () => process.env.BD_CUSTOMER_ID;

// Zone names from env with sensible BD defaults
const getZoneUnlocker = () => process.env.BD_ZONE_UNLOCKER || 'web_unlocker1';
const getZoneSerp = () => process.env.BD_ZONE_SERP || 'serp_api1';
const getZoneBrowser = () => process.env.BD_ZONE_BROWSER || 'scraping_browser1';
const getZoneScraper = () => process.env.BD_ZONE_SCRAPER || 'web_scraper1';
// Scraping Browser uses zone-specific password (NOT API key) for WSS
const getZoneBrowserPassword = () => process.env.BD_ZONE_BROWSER_PASSWORD || process.env.BD_API_KEY;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Web Unlocker - fetch raw HTML/text from any URL
 * @param {string} url - Target URL
 * @returns {Promise<{url: string, text: string, status: number, chars: number}>}
 */
export async function webUnlocker(url) {
  await sleep(400); // Simulate network latency

  if (!getKey()) {
    throw new Error('BD_API_KEY not configured — set in .env');
  }

  // Real BD Web Unlocker API
  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      zone: getZoneUnlocker(),
      url,
      format: 'raw'
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`BD Web Unlocker zone="${getZoneUnlocker()}" status=${response.status} body="${errorBody.slice(0, 200)}"`);
  }
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

  if (!getKey()) {
    throw new Error('BD_API_KEY not configured — set in .env');
  }

  // Real BD SERP API — uses /request endpoint with google search URL
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&brd_json=1`;
  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      zone: getZoneSerp(),
      url: searchUrl,
      format: 'raw'
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`BD SERP API zone="${getZoneSerp()}" status=${response.status} body="${errorBody.slice(0, 200)}"`);
  }
  const body = await response.text();
  // brd_json=1 returns Google's structured JSON in BD's wrapper; fallback to parsing HTML titles
  let results = [];
  try {
    const parsed = JSON.parse(body);
    results = parsed.organic || parsed.organic_results || parsed.results || [];
  } catch {
    // Parse HTML — extract <h3> titles + link hrefs
    const titles = [...body.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map(m => m[1]).slice(0, 10);
    const links = [...body.matchAll(/<a href="\/url\?q=([^&"]+)/g)].map(m => decodeURIComponent(m[1])).slice(0, 10);
    results = titles.map((title, i) => ({ title, link: links[i] || '', position: i + 1 }));
  }
  return { query, results };
}

/**
 * Scraping Browser - headless browser for SPAs and JS-heavy sites
 * @param {string[]} urls - Array of URLs to scrape
 * @returns {Promise<Array<{url: string, text: string, status: number}>>}
 */
export async function scrapingBrowser(urls) {
  await sleep(600); // Simulate browser launch + navigation

  if (!getKey()) {
    throw new Error('BD_API_KEY not configured — set in .env');
  }

  // Real BD Scraping Browser via Playwright CDP
  if (!getCustomerId()) {
    throw new Error('BD_CUSTOMER_ID env var required for Scraping Browser (set in Railway environment)');
  }
  const { chromium } = await import('playwright-core');
  const wsEndpoint = `wss://brd-customer-${getCustomerId()}-zone-${getZoneBrowser()}:${getZoneBrowserPassword()}@brd.superproxy.io:9222`;

  let browser;
  try {
    browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 30000 });
  } catch (err) {
    throw new Error(`BD Scraping Browser zone="${getZoneBrowser()}" connection failed: ${err.message.slice(0, 200)}`);
  }

  const results = [];
  try {
    for (const url of urls) {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const text = await page.evaluate(() => document.body.innerText);
        results.push({ url, text, status: 200 });
      } catch (err) {
        throw new Error(`BD Scraping Browser zone="${getZoneBrowser()}" failed to load ${url}: ${err.message.slice(0, 200)}`);
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

  if (!getKey()) {
    throw new Error('BD_API_KEY not configured — set in .env');
  }

  // Real implementation: use Web Unlocker on company About page
  const aboutUrl = url.replace(/\/$/, '') + '/about';
  const [homeResp, aboutResp] = await Promise.allSettled([
    fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: getZoneScraper(), url, format: 'raw' })
    }),
    fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: getZoneScraper(), url: aboutUrl, format: 'raw' })
    })
  ]);

  let homeText = '';
  let aboutText = '';

  if (homeResp.status === 'fulfilled' && homeResp.value.ok) {
    homeText = await homeResp.value.text();
  } else if (homeResp.status === 'fulfilled') {
    const errorBody = await homeResp.value.text();
    throw new Error(`BD Web Scraper API zone="${getZoneScraper()}" homepage status=${homeResp.value.status} body="${errorBody.slice(0, 200)}"`);
  } else {
    throw new Error(`BD Web Scraper API zone="${getZoneScraper()}" homepage failed: ${homeResp.reason?.message || 'unknown error'}`);
  }

  if (aboutResp.status === 'fulfilled' && aboutResp.value.ok) {
    aboutText = await aboutResp.value.text();
  } else if (aboutResp.status === 'fulfilled') {
    const errorBody = await aboutResp.value.text();
    throw new Error(`BD Web Scraper API zone="${getZoneScraper()}" about page status=${aboutResp.value.status} body="${errorBody.slice(0, 200)}"`);
  } else {
    throw new Error(`BD Web Scraper API zone="${getZoneScraper()}" about page failed: ${aboutResp.reason?.message || 'unknown error'}`);
  }

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

  if (!getKey() || getKey() === 'STUB') {
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
      'Authorization': `Bearer ${getKey()}`,
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
 * Discover API (NEW for hackathon) - intent-ranked web discovery (FREE tier)
 * Async, two-step: fire task, poll for results
 * @param {string} query - Search query (e.g. "Stripe payments company news 2026")
 * @param {string} intent - Intent description (e.g. "find recent news and official pages about Stripe")
 * @param {number} numResults - Number of results (default 10)
 * @returns {Promise<{query: string, intent: string, results: Array, duration_seconds: number}>}
 */
export async function discoverApi(query, intent, numResults = 10) {
  if (!getKey() || getKey() === 'STUB') {
    // Mock mode - realistic intent-ranked discovery results
    await sleep(4000);
    const domain = query.split(' ')[0];
    const mockResults = [
      {
        link: `https://${domain}/newsroom`,
        title: `${domain} Newsroom - Latest Updates`,
        description: `Official press releases and company news from ${domain}. Recent expansion announcements and product launches.`,
        relevance_score: 0.92
      },
      {
        link: `https://techcrunch.com/2026/05/${domain}-funding`,
        title: `${domain} raises Series D funding round`,
        description: `TechCrunch exclusive: ${domain} closes $250M Series D led by Sequoia Capital, bringing total funding to $500M+`,
        relevance_score: 0.87
      },
      {
        link: `https://${domain}/about`,
        title: `About ${domain} - Company Overview`,
        description: `Learn about ${domain}'s mission, team, and products. Founded in 2018 with offices across the US and Europe.`,
        relevance_score: 0.85
      },
      {
        link: `https://www.forbes.com/companies/${domain}`,
        title: `${domain} Profile - Forbes`,
        description: `Financial metrics, leadership team, and competitive analysis of ${domain}. Company valuation estimates and market position.`,
        relevance_score: 0.81
      },
      {
        link: `https://${domain}/blog/2026-product-roadmap`,
        title: `2026 Product Roadmap - ${domain} Blog`,
        description: `Exciting new features coming to ${domain} in 2026. AI-powered analytics, enhanced integrations, and global expansion.`,
        relevance_score: 0.78
      },
      {
        link: `https://venturebeat.com/${domain}-competitor-analysis`,
        title: `How ${domain} stacks up against competitors`,
        description: `Comparative analysis of ${domain} vs major players in the space. Market share, pricing, and feature comparison.`,
        relevance_score: 0.74
      },
      {
        link: `https://linkedin.com/company/${domain}`,
        title: `${domain} on LinkedIn`,
        description: `Follow ${domain} for company updates, job postings, and industry insights. 850+ employees and growing.`,
        relevance_score: 0.71
      },
      {
        link: `https://g2.com/products/${domain}/reviews`,
        title: `${domain} Reviews & Ratings - G2`,
        description: `Read verified customer reviews of ${domain}. 4.7/5 stars based on 2,300+ reviews. See what users love and areas for improvement.`,
        relevance_score: 0.68
      },
      {
        link: `https://crunchbase.com/organization/${domain}`,
        title: `${domain} - Crunchbase Company Profile`,
        description: `Complete funding history, acquisition details, investors, and leadership team information for ${domain}.`,
        relevance_score: 0.65
      },
      {
        link: `https://github.com/${domain}`,
        title: `${domain} on GitHub`,
        description: `Open source projects and developer resources from ${domain}. 34 public repositories with 15K+ stars combined.`,
        relevance_score: 0.61
      }
    ];
    return {
      query,
      intent,
      results: mockResults.slice(0, numResults),
      duration_seconds: 3.8
    };
  }

  // Real BD Discover API - Step 1: fire task
  const fireResp = await fetch('https://api.brightdata.com/discover', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, num_results: numResults, intent })
  });

  if (!fireResp.ok) {
    const body = await fireResp.text();
    throw new Error(`BD Discover API status=${fireResp.status} body="${body.slice(0, 200)}"`);
  }

  const { task_id } = await fireResp.json();
  if (!task_id) throw new Error('BD Discover API no task_id in response');

  // Step 2: poll up to 15s
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    await sleep(1000);
    const pollResp = await fetch(`https://api.brightdata.com/discover?task_id=${task_id}`, {
      headers: { 'Authorization': `Bearer ${getKey()}` }
    });
    if (!pollResp.ok) continue;
    const data = await pollResp.json();
    if (data.status === 'done') {
      const results = (data.results || []).sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
      return {
        query,
        intent,
        results,
        duration_seconds: data.duration_seconds
      };
    }
    if (data.status === 'error' || data.status === 'failed') {
      throw new Error(`BD Discover API task failed: ${JSON.stringify(data).slice(0, 200)}`);
    }
  }
  throw new Error(`BD Discover API timeout after 15s (task_id=${task_id})`);
}

/**
 * Legacy Discover API - find subdomains, related domains, and web properties (FREE)
 * NOTE: Renamed to domainDiscoveryApi to avoid conflict with new Discover API
 * @param {string} domain - Target domain (e.g. "stripe.com")
 * @returns {Promise<{domain: string, subdomains: string[], relatedDomains: string[], webProperties: Array, totalFound: number}>}
 */
export async function domainDiscoveryApi(domain) {
  await sleep(1200);

  if (!getKey() || getKey() === 'STUB') {
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

  // Real BD Domain Discovery API
  const response = await fetch('https://api.brightdata.com/discover/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getKey()}`,
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

  if (!getKey() || getKey() === 'STUB') {
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
      'Authorization': `Bearer ${getKey()}`,
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

  if (!getKey() || getKey() === 'STUB') {
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
      'Authorization': `Bearer ${getKey()}`,
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

/**
 * Data Firehose - stream real-time web mentions
 * @param {string} domain - Target domain
 * @param {function} onEvent - Callback for each event: { source, url, title, snippet, sentiment, timestamp }
 * @param {number} durationMs - Max stream duration (default 30000ms)
 * @returns {function} stopFn - Call to cancel the stream
 */
export function dataFirehose(domain, onEvent, durationMs = 30000) {
  if (!getKey() || getKey() === 'STUB') {
    // Mock mode - emit 8 simulated events over ~15 seconds
    const mockEvents = [
      { source: 'reddit', url: `https://reddit.com/r/technology/comments/abc123/${domain.replace(/\./g, '_')}_discussion`, title: `Discussion: ${domain} new features`, snippet: `Just tried the new dashboard from ${domain}. Really impressed with the speed improvements and UI refinements. Anyone else using it?`, sentiment: 'positive', timestamp: new Date().toISOString() },
      { source: 'twitter', url: 'https://twitter.com/techuser/status/123456789', title: 'Tweet mention', snippet: `Migrated to ${domain} last week. Best decision for our team. The API docs are actually readable!`, sentiment: 'positive', timestamp: new Date().toISOString() },
      { source: 'news', url: 'https://techcrunch.com/2026/05/article', title: `${domain} announces partnership`, snippet: `${domain} today announced a strategic partnership with a major cloud provider, expanding its enterprise offerings and market reach.`, sentiment: 'neutral', timestamp: new Date().toISOString() },
      { source: 'blog', url: `https://devblog.example.com/review-${domain}`, title: `Review: ${domain} in production`, snippet: `After 6 months in production with ${domain}, here are our thoughts. Performance is solid, though pricing could be more transparent.`, sentiment: 'neutral', timestamp: new Date().toISOString() },
      { source: 'reddit', url: `https://reddit.com/r/devops/comments/def456/${domain}_outage`, title: `${domain} experiencing issues?`, snippet: `Anyone else seeing slow response times from ${domain} API? Been getting 500s for the past hour.`, sentiment: 'negative', timestamp: new Date().toISOString() },
      { source: 'twitter', url: 'https://twitter.com/developer/status/987654321', title: 'Tweet mention', snippet: `The new ${domain} SDK makes integration so much easier. Cut our implementation time in half.`, sentiment: 'positive', timestamp: new Date().toISOString() },
      { source: 'news', url: 'https://venturebeat.com/2026/05/funding-news', title: `${domain} raises Series C`, snippet: `Enterprise software company ${domain} has closed a $100M Series C round led by top-tier VCs, signaling strong market traction.`, sentiment: 'positive', timestamp: new Date().toISOString() },
      { source: 'blog', url: `https://engineering.company.com/${domain}-migration`, title: `Migrating to ${domain}: lessons learned`, snippet: `Our team migrated from legacy infrastructure to ${domain}. Here's what went well and what surprised us during the transition.`, sentiment: 'neutral', timestamp: new Date().toISOString() }
    ];

    let eventIndex = 0;
    let stopped = false;

    const interval = setInterval(() => {
      if (stopped || eventIndex >= mockEvents.length) {
        clearInterval(interval);
        return;
      }
      const event = { ...mockEvents[eventIndex], timestamp: new Date().toISOString() };
      onEvent(event);
      eventIndex++;
    }, 1800);

    // Auto-stop after duration
    const timeout = setTimeout(() => {
      stopped = true;
      clearInterval(interval);
    }, durationMs);

    return () => {
      stopped = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }

  // Real BD Data Firehose API
  let stopped = false;
  let controller = new AbortController();

  (async () => {
    try {
      const response = await fetch('https://api.brightdata.com/firehose/v1/stream', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getKey()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: domain,
          max_duration_ms: durationMs
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        console.error(`[dataFirehose] BD API error: ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim() || stopped) continue;
          try {
            const event = JSON.parse(line);
            onEvent({
              source: event.source || 'unknown',
              url: event.url || '',
              title: event.title || '',
              snippet: event.snippet || event.text || '',
              sentiment: event.sentiment || 'neutral',
              timestamp: event.timestamp || new Date().toISOString()
            });
          } catch (err) {
            console.error('[dataFirehose] Failed to parse event:', err);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[dataFirehose] Stream error:', err);
      }
    }
  })();

  return () => {
    stopped = true;
    controller.abort();
  };
}

/**
 * Crawl Site - multi-page markdown scraping via BD MCP scrape_batch
 * @param {string} domain - Target domain (e.g. "stripe.com")
 * @returns {Promise<{domain: string, pages: Array, count: number}>}
 */
export async function crawlSite(domain) {
  if (!getKey()) throw new Error('BD_API_KEY not configured — set in .env');

  // Strategic URL paths — cap at 8 to stay under 10-URL limit + leave headroom
  const CRAWL_PATHS = ['/', '/pricing', '/about', '/customers', '/careers', '/blog', '/contact', '/security'];

  // Lazy import so connector module isn't tightly coupled to MCP client
  const { mcpScrapeBatch } = await import('./bd-mcp-client.mjs');

  const base = `https://${domain}`;
  const urls = CRAWL_PATHS.map(p => base + p);

  const result = await mcpScrapeBatch(urls);

  return {
    domain,
    pages: result.pages,
    count: result.count
  };
}

/**
 * Deep Lookup API - web-scale indexed intelligence (BETA)
 * @param {string} domain - Target domain
 * @param {string[]} queries - Array of query strings
 * @returns {Promise<{domain: string, results: Array, totalSources: number, processingTime: number}>}
 */
export async function deepLookup(domain, queries = []) {
  await sleep(3500); // Simulate deep web analysis

  if (!getKey() || getKey() === 'STUB') {
    // Mock mode - realistic deep lookup intelligence
    const mockQueries = queries.length > 0 ? queries : [
      'What are their main revenue streams?',
      'Who are their biggest customers?',
      'What are their competitive weaknesses?',
      'What technology stack do they use?',
      'What are recent strategic moves?'
    ];

    const mockResults = mockQueries.map((query, idx) => {
      const confidences = [0.92, 0.87, 0.73, 0.95, 0.81];
      const answers = [
        `Primary revenue from enterprise SaaS subscriptions ($80M ARR), followed by professional services (25%) and API usage fees (15%). Growing marketplace revenue from third-party integrations.`,
        `Fortune 500 customers include major banks (JPMorgan, Goldman Sachs), tech companies (Adobe, Atlassian), and retailers (Target, Walmart). Strong presence in financial services sector.`,
        `Pricing complexity drives churn in mid-market. Limited international support (EMEA only). Customer onboarding takes 4-6 weeks vs competitors' 2 weeks. Technical documentation gaps noted in G2 reviews.`,
        `React/TypeScript frontend, Node.js/Go backend, PostgreSQL primary database, Redis caching, Kafka event streaming, AWS infrastructure with multi-region deployment, Kubernetes orchestration.`,
        `Series D funding ($250M, Apr 2026), acquired DataViz Corp ($30M, Mar 2026), launched AI analytics suite (Feb 2026), expanded European offices (Q1 2026), hired ex-Salesforce VP Sales (Jan 2026).`
      ];
      const sources = [
        [
          { url: `https://techcrunch.com/2026/04/${domain}-business-model`, snippet: 'Breaking down their $95M ARR across product lines and customer segments...' },
          { url: `https://saasmetrics.io/companies/${domain}`, snippet: 'Revenue composition shows 80% recurring, 20% services...' },
          { url: `https://investors.${domain}/earnings-call`, snippet: 'Q4 2025 earnings call transcript reveals revenue breakdown...' }
        ],
        [
          { url: `https://linkedin.com/company/${domain}/about`, snippet: 'Trusted by Fortune 500 companies including JPMorgan, Adobe, Target...' },
          { url: `https://www.${domain}/customers`, snippet: 'Case studies featuring Goldman Sachs, Atlassian, Walmart deployments...' },
          { url: `https://g2.com/products/${domain}/reviews`, snippet: 'Enterprise customers from banking, tech, and retail sectors...' }
        ],
        [
          { url: `https://g2.com/products/${domain}/reviews`, snippet: 'Users cite pricing complexity and onboarding challenges...' },
          { url: `https://trustradius.com/products/${domain}`, snippet: 'Average onboarding 4-6 weeks compared to competitors at 2 weeks...' },
          { url: `https://reddit.com/r/saas/comments/xyz/${domain}_review`, snippet: 'International support limited to EMEA, lacking APAC/LATAM presence...' }
        ],
        [
          { url: `https://github.com/${domain}`, snippet: 'OSS projects show React, TypeScript, Node.js, Go stack...' },
          { url: `https://stackshare.io/${domain}`, snippet: 'Tech stack: PostgreSQL, Redis, Kafka, AWS, Kubernetes...' },
          { url: `https://engineering.${domain}/blog/architecture`, snippet: 'Multi-region AWS deployment with k8s orchestration layer...' }
        ],
        [
          { url: `https://techcrunch.com/2026/04/${domain}-series-d`, snippet: 'Closes $250M Series D led by Sequoia and a16z...' },
          { url: `https://venturebeat.com/2026/03/${domain}-acquisition`, snippet: 'Acquires DataViz Corp for $30M to strengthen analytics...' },
          { url: `https://www.${domain}/blog/ai-analytics-launch`, snippet: 'Launches AI-powered predictive analytics suite in February...' }
        ]
      ];

      return {
        query: mockQueries[idx],
        answer: answers[idx] || `Analysis for "${query}" shows positive indicators based on web-scale data across 47 sources.`,
        sources: sources[idx] || [
          { url: `https://example.com/source1`, snippet: 'Relevant data point...' },
          { url: `https://example.com/source2`, snippet: 'Additional context...' },
          { url: `https://example.com/source3`, snippet: 'Supporting evidence...' }
        ],
        confidence: confidences[idx] || (0.7 + Math.random() * 0.25)
      };
    });

    return {
      domain,
      results: mockResults,
      totalSources: 47,
      processingTime: 3.2
    };
  }

  // Real BD Deep Lookup API
  const response = await fetch('https://api.brightdata.com/deep-lookup/v1/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      domain,
      queries,
      depth: 'comprehensive'
    })
  });

  if (!response.ok) throw new Error(`BD Deep Lookup ${response.status}`);
  const data = await response.json();

  return {
    domain: data.domain || domain,
    results: data.results || [],
    totalSources: data.totalSources || 0,
    processingTime: data.processingTime || 0
  };
}

/**
 * Custom error for dataset entitlement issues
 */
export class DatasetNotEntitledError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatasetNotEntitledError';
    this.code = 'NOT_ENTITLED';
  }
}

/**
 * Datasets API - query pre-collected datasets (LinkedIn Companies, Crunchbase, etc.)
 * Note: This is a paid BD product not included in trial accounts
 * @param {string} dataset_id - Dataset ID (e.g. 'gd_l1viktl72bvl7bjuj0' for LinkedIn Companies)
 * @param {string} filter_value - Value to filter by (e.g. domain like "stripe.com")
 * @param {string} filter_name - Field to filter on (default: 'company_url')
 * @param {number} recordsLimit - Max records to return (default: 1)
 * @returns {Promise<Array>} - Dataset rows
 */
export async function queryDataset(dataset_id, filter_value, filter_name = 'company_url', recordsLimit = 1) {
  if (!getKey() || getKey() === 'STUB') {
    // Mock mode - return plausible LinkedIn Company data
    await sleep(1500);
    if (dataset_id === 'gd_l1viktl72bvl7bjuj0') {
      return [{
        company_name: filter_value.replace(/\.(com|io|net)$/, '').charAt(0).toUpperCase() + filter_value.slice(1, filter_value.indexOf('.')),
        company_url: filter_value,
        employees: '850',
        employee_growth: '+12% YoY',
        industry: 'Computer Software',
        founded: '2018',
        headquarters: 'San Francisco, CA',
        funding_total: '$500M',
        revenue_range: '$50M-$100M'
      }];
    } else if (dataset_id === 'gd_l1vijqt9jfj7olije') {
      // Crunchbase Companies mock
      return [{
        company_name: filter_value.replace(/\.(com|io|net)$/, '').charAt(0).toUpperCase() + filter_value.slice(1, filter_value.indexOf('.')),
        domain: filter_value,
        total_funding_usd: 500000000,
        last_funding_type: 'Series D',
        last_funding_date: '2026-04-15',
        investors: 'Sequoia Capital, Andreessen Horowitz',
        valuation_usd: 2000000000
      }];
    }
    return [];
  }

  // Real BD Datasets API - try multiple endpoint patterns
  // Pattern 1: /datasets/v3/filter (documented endpoint)
  let response = await fetch('https://api.brightdata.com/datasets/v3/filter', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      dataset_id,
      filter: {
        operator: '=',
        name: filter_name,
        value: filter_value
      },
      records_limit: recordsLimit
    })
  });

  // If v3/filter doesn't work, try snapshot pattern (used in linkedinScraperApi)
  if (!response.ok && response.status === 404) {
    response = await fetch('https://api.brightdata.com/datasets/v3/snapshot', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getKey()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dataset_id,
        params: [{
          [filter_name]: filter_value
        }]
      })
    });
  }

  // Check if endpoint exists
  if (!response.ok && (response.status === 404 || response.status === 405)) {
    const body = await response.text();
    if (body.includes('Cannot POST') || body.includes('Cannot GET') || body.includes('Not found')) {
      throw new DatasetNotEntitledError('Datasets API not available on trial tier - requires paid subscription');
    }
  }

  // Check for entitlement/subscription errors
  if (!response.ok && (response.status === 402 || response.status === 403)) {
    const body = await response.text();
    throw new DatasetNotEntitledError(`Datasets API requires subscription (status ${response.status}): ${body.slice(0, 200)}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BD Datasets API status=${response.status} body="${body.slice(0, 200)}"`);
  }

  const data = await response.json();

  // Handle async snapshot pattern
  if (data.snapshot_id) {
    const snapshot_id = data.snapshot_id;
    const startedAt = Date.now();

    // Poll up to 15s
    while (Date.now() - startedAt < 15000) {
      await sleep(1000);
      const pollResp = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${snapshot_id}?format=json`, {
        headers: { 'Authorization': `Bearer ${getKey()}` }
      });

      if (!pollResp.ok) continue;

      const pollData = await pollResp.json();
      if (pollData.status === 'ready') {
        return pollData.rows || pollData.records || [];
      }
      if (pollData.status === 'error' || pollData.status === 'failed') {
        throw new Error(`BD Datasets snapshot failed: ${JSON.stringify(pollData).slice(0, 200)}`);
      }
    }
    throw new Error(`BD Datasets timeout after 15s (snapshot_id=${snapshot_id})`);
  }

  // Direct response with rows
  return data.rows || data.records || data.results || [];
}
