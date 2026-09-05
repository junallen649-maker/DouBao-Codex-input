import { BrowserContext } from 'playwright-core';

export interface ParsedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export class CookieManager {
  /**
   * Parse a raw Cookie header string into individual cookie objects
   */
  static parseCookieString(rawCookie: string, domain = '.doubao.com'): ParsedCookie[] {
    if (!rawCookie || !rawCookie.trim()) {
      return [];
    }

    const cookies: ParsedCookie[] = [];
    const pairs = rawCookie.split(';');

    for (const pair of pairs) {
      const trimmed = pair.trim();
      if (!trimmed) continue;

      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;

      const name = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();

      if (name && value) {
        cookies.push({
          name,
          value,
          domain,
          path: '/',
          secure: true,
          sameSite: 'None'
        });
      }
    }

    return cookies;
  }

  /**
   * Inject cookie string into Playwright BrowserContext
   */
  static async injectCookies(context: BrowserContext, rawCookie: string): Promise<number> {
    const cookies = this.parseCookieString(rawCookie);
    if (cookies.length === 0) return 0;

    await context.addCookies(cookies);
    return cookies.length;
  }

  /**
   * Check if necessary session cookies exist
   */
  static hasValidSession(cookies: { name: string; value: string }[]): boolean {
    const names = new Set(cookies.map(c => c.name));
    return names.has('sessionid') || names.has('sessionid_ss');
  }
}
