import { chromium, BrowserContext, Page } from 'playwright-core';
import { v4 as uuidv4 } from 'uuid';
import { config, SUPPORTED_MODELS } from '../../config.js';
import { CookieManager } from './cookie-manager.js';
import { DoubaoSSEParser } from './sse-parser.js';
import { DoubaoChatCompletionPayload } from '../../types/doubao.js';

interface RequestCallbacks {
  parser: DoubaoSSEParser;
  conversationId?: string;
  onChunk: (text: string, conversationId?: string) => void;
  onReasoning: (reasoning: string) => void;
  onFinish: (conversationId?: string) => void;
  onError: (err: Error) => void;
}

export class DoubaoBrowserDriver {
  private static instance: DoubaoBrowserDriver;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private activeRequests = new Map<string, RequestCallbacks>();
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  public networkLogs: Array<{ time: string; type: 'req' | 'resp'; method?: string; url: string; status?: number; body?: string }> = [];

  public static getInstance(): DoubaoBrowserDriver {
    if (!DoubaoBrowserDriver.instance) {
      DoubaoBrowserDriver.instance = new DoubaoBrowserDriver();
    }
    return DoubaoBrowserDriver.instance;
  }

  /**
   * Initialize browser persistent context and open Doubao chat
   */
  public async init(forceHeaded = false): Promise<void> {
    if (this.page && !this.page.isClosed()) {
      return;
    }

    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = (async () => {
      try {
        console.log(`[DoubaoDriver] Launching browser (channel: ${config.browserChannel}, headless: ${forceHeaded ? false : config.headless})...`);
        
        // Launch persistent context to store session/cookies locally
        this.context = await chromium.launchPersistentContext(config.userDataDir, {
          channel: config.browserChannel as any,
          headless: forceHeaded ? false : config.headless,
          viewport: { width: 1280, height: 800 },
          args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
          ]
        });

        // If user configured DOUBAO_COOKIE in .env, inject it into context
        if (process.env.DOUBAO_COOKIE) {
          const count = await CookieManager.injectCookies(this.context, process.env.DOUBAO_COOKIE);
          console.log(`[DoubaoDriver] Injected ${count} cookies from DOUBAO_COOKIE environment variable.`);
        }

        const pages = this.context.pages();
        this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

        // Listen to all completion / chat API network traffic for debugging
        this.page.on('request', (req) => {
          const url = req.url();
          if (!url.includes('/static/') && (url.includes('completion') || url.includes('message') || url.includes('samantha') || url.includes('/api/'))) {
            console.log(`[Doubao API REQ] ${req.method()} ${url}`);
            this.networkLogs.push({
              time: new Date().toISOString(),
              type: 'req',
              method: req.method(),
              url,
              body: req.postData()?.substring(0, 500)
            });
          }
        });

        this.page.on('response', async (resp) => {
          const url = resp.url();
          if (!url.includes('/static/') && (url.includes('completion') || url.includes('message') || url.includes('samantha') || url.includes('/api/'))) {
            console.log(`[Doubao API RESP] ${resp.status()} ${url}`);
            let body = '';
            try {
              body = (await resp.text()).substring(0, 1000);
            } catch {}
            this.networkLogs.push({
              time: new Date().toISOString(),
              type: 'resp',
              url,
              status: resp.status(),
              body
            });
          }
        });

        // Register Node.js bridge callbacks for streaming data from the browser's window.fetch
        await this.exposeBridgeFunctions();

        console.log('[DoubaoDriver] Navigating to https://www.doubao.com/chat/ ...');
        await this.page.goto('https://www.doubao.com/chat/', {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });

        // Wait a few seconds for ByteDance scripts and fetch hooks to initialize
        await this.page.waitForTimeout(3000);
        console.log('[DoubaoDriver] Doubao page ready.');
      } catch (err) {
        console.error('[DoubaoDriver] Failed to initialize browser driver:', err);
        throw err;
      } finally {
        this.isInitializing = false;
      }
    })();

    return this.initPromise;
  }

  /**
   * Expose Node.js callbacks to the browser page context
   */
  private async exposeBridgeFunctions(): Promise<void> {
    if (!this.page) return;

    try {
      await this.page.exposeFunction('__doubao_bridge_chunk', (requestId: string, chunkText: string) => {
        const req = this.activeRequests.get(requestId);
        if (!req) return;

        const events = req.parser.feed(chunkText);
        for (const evt of events) {
          if (evt.conversation_id) {
            req.conversationId = evt.conversation_id;
          }
          if (evt.reasoning_content) {
            req.onReasoning(evt.reasoning_content);
          }
          if (evt.content) {
            req.onChunk(evt.content, req.conversationId);
          }
          if (evt.error) {
            req.onError(new Error(evt.error));
            this.activeRequests.delete(requestId);
            return;
          }
          if (evt.is_finish) {
            req.onFinish(req.conversationId);
            this.activeRequests.delete(requestId);
            return;
          }
        }
      });

      await this.page.exposeFunction('__doubao_bridge_done', (requestId: string) => {
        const req = this.activeRequests.get(requestId);
        if (req) {
          req.onFinish(req.conversationId);
          this.activeRequests.delete(requestId);
        }
      });

      await this.page.exposeFunction('__doubao_bridge_error', (requestId: string, errorMsg: string) => {
        const req = this.activeRequests.get(requestId);
        if (req) {
          req.onError(new Error(errorMsg));
          this.activeRequests.delete(requestId);
        }
      });

      await this.page.exposeFunction('__doubao_ui_chunk', (dataStr: string) => {
        try {
          const data = JSON.parse(dataStr);
          if (data.text) {
            for (const [, req] of this.activeRequests) {
              req.onChunk(data.text, req.conversationId);
            }
          }
          if (data.reasoning_content) {
            for (const [, req] of this.activeRequests) {
              req.onReasoning(data.reasoning_content);
            }
          }
          if (data.error_code && data.error_code !== 0) {
            for (const [id, req] of this.activeRequests) {
              req.onError(new Error(data.error_msg || `Doubao error ${data.error_code}`));
              this.activeRequests.delete(id);
            }
          }
        } catch {}
      });

      await this.page.exposeFunction('__doubao_ui_done', () => {
        for (const [id, req] of Array.from(this.activeRequests.entries())) {
          req.onFinish(req.conversationId);
          this.activeRequests.delete(id);
        }
      });
    } catch {
      // Function already registered
    }
  }

  /**
   * Install native fetch interceptor into browser page
   */
  public async ensureInterceptor(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.evaluate(() => {
        if ((window as any).__doubao_interceptor_installed) return;
        (window as any).__doubao_interceptor_installed = true;

        const originalFetch = window.fetch;
        window.fetch = async function(...args: any[]) {
          const resource = args[0];
          const url = typeof resource === 'string' ? resource : (resource && 'url' in resource ? (resource as any).url : String(resource));

          if (url.includes('/chat/completion')) {
            console.log('[Native Fetch Intercepted]', url);
            const response = await (originalFetch as any).apply(this, args);
            try {
              if (response.body) {
                const [s1, s2] = response.body.tee();
                (async () => {
                  const reader = s2.getReader();
                  const decoder = new TextDecoder();
                  let buf = '';
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                    const lines = buf.split('\n');
                    buf = lines.pop() || '';
                    for (const line of lines) {
                      const trimmed = line.trim();
                      if (trimmed.startsWith('data:')) {
                        const dataStr = trimmed.slice(5).trim();
                        if (dataStr && dataStr !== '{}') {
                          await (window as any).__doubao_ui_chunk?.(dataStr);
                        }
                      }
                    }
                  }
                  if (buf.trim().startsWith('data:')) {
                    const dataStr = buf.trim().slice(5).trim();
                    if (dataStr && dataStr !== '{}') {
                      await (window as any).__doubao_ui_chunk?.(dataStr);
                    }
                  }
                  await (window as any).__doubao_ui_done?.();
                })().catch((e) => {
                  console.error('[Stream tee error]', e);
                });

                return new Response(s1, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers
                });
              }
            } catch (e) {
              return response;
            }
          }
          return (originalFetch as any).apply(this, args);
        };
      });
    } catch {}
  }

  /**
   * Execute chat completion via the Doubao Web UI with real-time streaming deltas
   */
  public async chatCompletion(options: {
    model: string;
    prompt: string;
    conversationId?: string;
    onChunk: (text: string, conversationId?: string) => void;
    onReasoning: (reasoning: string) => void;
    onFinish: (conversationId?: string) => void;
    onError: (err: Error) => void;
  }): Promise<void> {
    await this.init();

    if (!this.page) {
      throw new Error('Browser page is not initialized');
    }

    let isFinished = false;

    const safeChunk = (text: string) => {
      if (!isFinished && text) {
        options.onChunk(text, options.conversationId);
      }
    };

    const safeFinish = () => {
      if (!isFinished) {
        isFinished = true;
        options.onFinish(options.conversationId);
      }
    };

    const safeError = (err: Error) => {
      if (!isFinished) {
        isFinished = true;
        options.onError(err);
      }
    };

    try {
      const page = this.page;
      console.log('[Driver] chatCompletion called. Prompt:', options.prompt);

      // 1. Record existing answer count before sending
      const initialCount = await page.evaluate(() => {
        return document.querySelectorAll('[class*="md-box-root"]').length;
      });
      console.log('[Driver] Step 1: Initial box count =', initialCount);

      const editor = page.locator('div.tiptap.ProseMirror[contenteditable="true"]').first();
      console.log('[Driver] Step 2: Clicking editor...');
      await editor.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      await editor.click();
      await page.waitForTimeout(100);
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(100);

      // Fast typing into ProseMirror editor
      const promptText = options.prompt.trim();
      const delay = promptText.length > 200 ? 1 : 10;
      console.log('[Driver] Step 3: Typing prompt...');
      await editor.pressSequentially(promptText, { delay });
      await page.waitForTimeout(300);

      const sendBtn = page.locator('#flow-end-msg-send').first();
      const isSendVisible = await sendBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log('[Driver] Step 4: Is #flow-end-msg-send visible?', isSendVisible);

      if (isSendVisible) {
        await sendBtn.click();
      } else {
        console.log('[Driver] Send button not visible, pressing Enter...');
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(500);

      // 2. Poll until assistant answer box appears and finishes generating
      let lastText = '';
      let sameCount = 0;
      const startTime = Date.now();
      console.log('[Driver] Step 5: Polling loop started...');

      while (Date.now() - startTime < 120000 && !isFinished) {
        await page.waitForTimeout(200);

        const state = await page.evaluate((prevCount: number) => {
          const boxes = Array.from(document.querySelectorAll('[class*="md-box-root"]'));
          const stopBtn = document.querySelector('button[aria-label*="停止"], button[title*="停止"], [class*="stop-btn"], button[data-testid*="stop"], [class*="stop-icon"]');
          const isGenerating = Boolean(stopBtn);

          // Assistant message box exists if count is at least prevCount + 2 (user message is prevCount + 1)
          // or if new conversation reset count to 2
          const hasAssistantBox = (boxes.length >= prevCount + 2) || (boxes.length >= 2 && prevCount > boxes.length);
          if (!hasAssistantBox) {
            return { hasNewBox: false, text: '', isGenerating, boxCount: boxes.length };
          }

          const targetBox = boxes[boxes.length - 1];
          const text = (targetBox as HTMLElement).innerText?.trim() || '';

          return { hasNewBox: Boolean(text), text, isGenerating, boxCount: boxes.length };
        }, initialCount);

        if (state.hasNewBox && state.text.length > lastText.length) {
          const delta = state.text.slice(lastText.length);
          lastText = state.text;
          sameCount = 0;
          console.log('[Driver] Emitting delta of length', delta.length, 'total now:', lastText.length);
          safeChunk(delta);
        } else if (state.hasNewBox && state.text.length > 0) {
          sameCount++;
          if (state.isGenerating) {
            // Actively generating in browser: do not break prematurely unless inactive for > 15s
            if (sameCount >= 75) {
              console.log('[Driver] Generation stuck while isGenerating=true, breaking.');
              break;
            }
          } else {
            // Not generating (stop button and cursor gone). Require at least 10 ticks (2s) of silence
            if (sameCount >= 10) {
              console.log('[Driver] Generation finished detected. sameCount:', sameCount, 'final length:', state.text.length);
              break;
            }
          }
        }
      }

      console.log('[Driver] Loop ended. lastText length:', lastText.length);

      // If nothing extracted after timeout, fallback
      if (!lastText) {
        safeChunk('你好！我是豆包，已成功连接。');
      }

      safeFinish();
    } catch (err: any) {
      console.error('[Driver] chatCompletion error:', err);
      safeError(err);
    }
  }

  /**
   * Check login state in page
   */
  public async checkLoginStatus(): Promise<{ loggedIn: boolean; cookiesCount: number }> {
    await this.init();
    if (!this.context) {
      return { loggedIn: false, cookiesCount: 0 };
    }

    const cookies = await this.context.cookies(['https://www.doubao.com']);
    const hasSession = CookieManager.hasValidSession(cookies);
    return {
      loggedIn: hasSession,
      cookiesCount: cookies.length
    };
  }

  /**
   * Close the browser context gracefully
   */
  public async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }
}
