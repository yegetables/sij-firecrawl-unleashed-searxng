import express, { Request, Response } from 'express';
import type {
  Browser,
  BrowserContext,
  Route,
  Request as PlaywrightRequest,
  Page,
} from 'playwright-core';
import dotenv from 'dotenv';
// import { getError } from './helpers/get_error';
import { getError } from './helpers/get_error.js';
import { lookup } from 'dns/promises';
import IPAddr from 'ipaddr.js';
import { Server, RequestError } from 'proxy-chain';

dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

app.use(express.json());

const BLOCK_MEDIA =
  (process.env.BLOCK_MEDIA || 'False').toUpperCase() === 'TRUE';
const MAX_CONCURRENT_PAGES = Math.max(
  1,
  Number.parseInt(process.env.MAX_CONCURRENT_PAGES ?? '10', 10) || 10,
);
const ALLOW_LOCAL_WEBHOOKS =
  (process.env.ALLOW_LOCAL_WEBHOOKS || 'False').toUpperCase() === 'TRUE';

const PROXY_SERVER = process.env.PROXY_SERVER || null;
const PROXY_USERNAME = process.env.PROXY_USERNAME || null;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || null;

class InsecureConnectionError extends Error {
  constructor(
    public readonly blockedUrl: string,
    reason: string,
  ) {
    super(`Blocked insecure target URL "${blockedUrl}": ${reason}`);
    this.name = 'InsecureConnectionError';
  }
}

const isInternalHost = async (hostname: string): Promise<boolean> => {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return true;

  let addresses: string[];
  if (IPAddr.isValid(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      return true;
    }
  }
  return (
    addresses.length === 0 ||
    addresses.some((a) => IPAddr.parse(a).range() !== 'unicast')
  );
};

const assertSafeTargetUrl = async (urlString: string): Promise<void> => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new InsecureConnectionError(urlString, 'URL is invalid');
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new InsecureConnectionError(
      urlString,
      `unsupported protocol "${parsedUrl.protocol}"`,
    );
  }
  if (!ALLOW_LOCAL_WEBHOOKS && (await isInternalHost(parsedUrl.hostname))) {
    throw new InsecureConnectionError(
      urlString,
      'resolves to a private/internal address',
    );
  }
};

const buildUpstreamProxyUrl = (): string | undefined => {
  if (!PROXY_SERVER) return undefined;
  const server = PROXY_SERVER.includes('://')
    ? PROXY_SERVER
    : `http://${PROXY_SERVER}`;
  const url = new URL(server);
  if (PROXY_USERNAME) url.username = PROXY_USERNAME;
  if (PROXY_PASSWORD) url.password = PROXY_PASSWORD;
  return url.toString();
};

const startSSRFProxy = async (): Promise<number> => {
  const server = new Server({
    port: 0,
    host: '127.0.0.1',
    prepareRequestFunction: async ({ hostname }) => {
      if (!ALLOW_LOCAL_WEBHOOKS && (await isInternalHost(hostname))) {
        throw new RequestError(
          'Blocked: target resolves to a private/internal address',
          403,
        );
      }
      return { upstreamProxyUrl: buildUpstreamProxyUrl() };
    },
  });
  await server.listen();
  return server.port;
};

let ssrfProxyPort: number;

type ContextSecurityState = {
  blockedNavigationRequestUrl: string | null;
};
class Semaphore {
  private permits: number;
  private queue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.queue.length > 0) {
      const nextResolve = this.queue.shift();
      if (nextResolve) {
        this.permits--;
        nextResolve();
      }
    }
  }

  getAvailablePermits(): number {
    return this.permits;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}
const pageSemaphore = new Semaphore(MAX_CONCURRENT_PAGES);

const AD_SERVING_DOMAINS = [
  'doubleclick.net',
  'adservice.google.com',
  'googlesyndication.com',
  'googletagservices.com',
  'googletagmanager.com',
  'google-analytics.com',
  'adsystem.com',
  'adservice.com',
  'adnxs.com',
  'ads-twitter.com',
  'facebook.net',
  'fbcdn.net',
  'amazon-adsystem.com',
];

interface UrlModel {
  url: string;
  wait_after_load?: number;
  timeout?: number;
  headers?: { [key: string]: string };
  check_selector?: string;
  skip_tls_verification?: boolean;
}

let browser: Browser;

const initializeBrowser = async () => {
  const { launch } = await import('cloakbrowser');
  browser = await launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    proxy: `http://127.0.0.1:${ssrfProxyPort}`,
  });
};

const createContext = async (
  skipTlsVerification: boolean = false,
  userAgentOverride?: string,
): Promise<{
  context: BrowserContext;
  securityState: ContextSecurityState;
}> => {
  const viewport = { width: 1280, height: 800 };
  const securityState: ContextSecurityState = {
    blockedNavigationRequestUrl: null,
  };

  const contextOptions: any = {
    viewport,
    ignoreHTTPSErrors: skipTlsVerification,
    serviceWorkers: 'block',
  };

  // Only set a custom UA if the caller explicitly provided one.
  // Do NOT randomize — CloakBrowser's binary presents a coherent fingerprint;
  // overlaying a random UA breaks that coherence and is a detection vector.
  if (userAgentOverride) {
    contextOptions.userAgent = userAgentOverride;
  }

  // Proxy is set at the browser (launch) level, not per-context.
  // All contexts inherit the SSRF proxy from launch().

  const newContext = await browser.newContext(contextOptions);

  if (BLOCK_MEDIA) {
    await newContext.route(
      '**/*.{png,jpg,jpeg,gif,svg,mp3,mp4,avi,flac,ogg,wav,webm}',
      async (route: Route, request: PlaywrightRequest) => {
        await route.abort();
      },
    );
  }

  await newContext.route(
    '**/*',
    async (route: Route, request: PlaywrightRequest) => {
      const requestUrlString = request.url();
      try {
        await assertSafeTargetUrl(requestUrlString);
      } catch (error) {
        if (error instanceof InsecureConnectionError) {
          if (request.isNavigationRequest()) {
            securityState.blockedNavigationRequestUrl = requestUrlString;
          }
          console.warn(`Blocked request: ${requestUrlString}`);
          return route.abort('blockedbyclient');
        }
        throw error;
      }

      const hostname = new URL(requestUrlString).hostname.toLowerCase();

      if (AD_SERVING_DOMAINS.some((domain) => hostname.includes(domain))) {
        console.log(hostname);
        return route.abort();
      }
      return route.continue();
    },
  );

  return { context: newContext, securityState };
};

const shutdownBrowser = async () => {
  if (browser) {
    await browser.close();
  }
};

const isValidUrl = (urlString: string): boolean => {
  try {
    new URL(urlString);
    return true;
  } catch (_) {
    return false;
  }
};

const scrapePage = async (
  page: Page,
  url: string,
  waitUntil: 'load' | 'networkidle',
  waitAfterLoad: number,
  timeout: number,
  checkSelector: string | undefined,
  securityState: ContextSecurityState,
) => {
  console.log(
    `Navigating to ${url} with waitUntil: ${waitUntil} and timeout: ${timeout}ms`,
  );
  let response;
  try {
    response = await page.goto(url, { waitUntil, timeout });
  } catch (error) {
    if (securityState.blockedNavigationRequestUrl) {
      throw new InsecureConnectionError(
        securityState.blockedNavigationRequestUrl,
        'navigation to private/internal resource is not allowed',
      );
    }
    throw error;
  }

  if (waitAfterLoad > 0) {
    // Use native setTimeout instead of page.waitForTimeout().
    // CloakBrowser docs: page.waitForTimeout() sends CDP protocol
    // commands that reCAPTCHA detects. Native sleep is invisible.
    await new Promise((r) => setTimeout(r, waitAfterLoad));
  }

  if (checkSelector) {
    try {
      await page.waitForSelector(checkSelector, { timeout });
    } catch (error) {
      throw new Error('Required selector not found');
    }
  }

  let headers = null,
    content = await page.content();
  let ct: string | undefined = undefined;
  if (response) {
    headers = await response.allHeaders();
    ct = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === 'content-type',
    )?.[1];
    if (
      ct &&
      (ct.toLowerCase().includes('application/json') ||
        ct.toLowerCase().includes('text/plain'))
    ) {
      content = (await response.body()).toString('utf8');
    }
  }

  return {
    content,
    status: response ? response.status() : null,
    headers,
    contentType: ct,
  };
};

app.get('/health', async (req: Request, res: Response) => {
  try {
    if (!browser) {
      await initializeBrowser();
    }

    const { context: testContext } = await createContext();
    const testPage = await testContext.newPage();
    await testPage.close();
    await testContext.close();

    res.status(200).json({
      status: 'healthy',
      maxConcurrentPages: MAX_CONCURRENT_PAGES,
      activePages: MAX_CONCURRENT_PAGES - pageSemaphore.getAvailablePermits(),
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

app.post('/scrape', async (req: Request, res: Response) => {
  const {
    url,
    wait_after_load = 0,
    timeout = 15000,
    headers,
    check_selector,
    skip_tls_verification = false,
  }: UrlModel = req.body;

  console.log(`================= Scrape Request =================`);
  console.log(`URL: ${url}`);
  console.log(`Wait After Load: ${wait_after_load}`);
  console.log(`Timeout: ${timeout}`);
  console.log(`Headers: ${headers ? JSON.stringify(headers) : 'None'}`);
  console.log(`Check Selector: ${check_selector ? check_selector : 'None'}`);
  console.log(`Skip TLS Verification: ${skip_tls_verification}`);
  console.log(`==================================================`);

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    await assertSafeTargetUrl(url);
  } catch (error) {
    if (error instanceof InsecureConnectionError) {
      return res.json({
        content: '',
        pageStatusCode: 403,
        pageError: error.message,
      });
    }
    throw error;
  }

  if (!PROXY_SERVER) {
    console.warn(
      '⚠️ WARNING: No proxy server provided. Your IP address may be blocked.',
    );
  }

  if (!browser) {
    await initializeBrowser();
  }

  await pageSemaphore.acquire();

  let requestContext: BrowserContext | null = null;
  let securityState: ContextSecurityState | null = null;
  let page: Page | null = null;

  try {
    const userAgentOverride = headers
      ? Object.entries(headers).find(
          ([k]) => k.toLowerCase() === 'user-agent',
        )?.[1]
      : undefined;

    const contextBundle = await createContext(
      skip_tls_verification,
      userAgentOverride,
    );
    requestContext = contextBundle.context;
    securityState = contextBundle.securityState;
    page = await requestContext.newPage();

    if (headers) {
      const cookieHeader = Object.entries(headers).find(
        ([k]) => k.toLowerCase() === 'cookie',
      )?.[1];
      if (cookieHeader) {
        let cookieDomain: string | undefined;
        try {
          const host = new URL(url).hostname;
          const labels = host.split('.');
          cookieDomain = labels.length > 2 ? labels.slice(-2).join('.') : host;
        } catch {
          cookieDomain = undefined;
        }
        type SeedCookie = {
          name: string;
          value: string;
          url?: string;
          domain?: string;
          path?: string;
        };
        const cookies = cookieHeader
          .split(';')
          .map((pair) => pair.trim())
          .filter(Boolean)
          .map((pair): SeedCookie | null => {
            const eq = pair.indexOf('=');
            if (eq === -1) return null;
            const name = pair.slice(0, eq).trim();
            const value = pair.slice(eq + 1).trim();
            return cookieDomain
              ? { name, value, domain: `.${cookieDomain}`, path: '/' }
              : { name, value, url };
          })
          .filter((c): c is SeedCookie => c !== null);
        if (cookies.length > 0) {
          try {
            await requestContext.addCookies(cookies);
          } catch (error) {
            console.warn('Failed to seed cookies from Cookie header:', error);
          }
        }
      }

      const filteredHeaders = Object.fromEntries(
        Object.entries(headers).filter(([k]) => {
          const lower = k.toLowerCase();
          return lower !== 'user-agent' && lower !== 'cookie';
        }),
      );
      if (Object.keys(filteredHeaders).length > 0) {
        await page.setExtraHTTPHeaders(filteredHeaders);
      }
    }

    const result = await scrapePage(
      page,
      url,
      'load',
      wait_after_load,
      timeout,
      check_selector,
      securityState,
    );
    const pageError =
      result.status !== 200 ? getError(result.status) : undefined;

    if (!pageError) {
      console.log(`✅ Scrape successful!`);
    } else {
      console.log(
        `🚨 Scrape failed with status code: ${result.status} ${pageError}`,
      );
    }

    res.json({
      content: result.content,
      pageStatusCode: result.status,
      contentType: result.contentType,
      ...(pageError && { pageError }),
    });
  } catch (error) {
    if (error instanceof InsecureConnectionError) {
      return res.json({
        content: '',
        pageStatusCode: 403,
        pageError: error.message,
      });
    }
    console.error('Scrape error:', error);
    res
      .status(500)
      .json({ error: 'An error occurred while fetching the page.' });
  } finally {
    if (page) await page.close();
    if (requestContext) await requestContext.close();
    pageSemaphore.release();
  }
});

const start = async () => {
  ssrfProxyPort = await startSSRFProxy();
  await initializeBrowser();
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
};
start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

if (require.main === module) {
  process.on('SIGINT', () => {
    shutdownBrowser().then(() => {
      console.log('Browser closed');
      process.exit(0);
    });
  });
}