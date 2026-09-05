import express from 'express';
import cors from 'cors';
import { config, SUPPORTED_MODELS } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { modelsRouter } from './routes/models.js';
import { chatRouter } from './routes/chat.js';
import { responsesRouter } from './routes/responses.js';
import { DoubaoBrowserDriver } from './services/doubao/browser-driver.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const httpLogs: Array<{ time: string; method: string; url: string; headers: any; bodySnippet?: string; statusCode?: number; duration?: number }> = [];
const consoleLogs: Array<{ time: string; level: string; msg: string }> = [];

const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

function pushLog(level: string, args: any[]) {
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  consoleLogs.push({ time: new Date().toISOString(), level, msg });
  if (consoleLogs.length > 100) consoleLogs.shift();
}

console.log = (...args: any[]) => { pushLog('INFO', args); origLog(...args); };
console.warn = (...args: any[]) => { pushLog('WARN', args); origWarn(...args); };
console.error = (...args: any[]) => { pushLog('ERROR', args); origError(...args); };

// Endpoint to view console logs
app.get('/logs', (req, res) => {
  res.json({ count: consoleLogs.length, logs: consoleLogs.slice(-50) });
});

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  const logItem = {
    time: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
    bodySnippet: typeof req.body === 'object' ? JSON.stringify(req.body).slice(0, 500) : String(req.body).slice(0, 500)
  };
  httpLogs.push(logItem);
  if (httpLogs.length > 50) httpLogs.shift();

  res.on('finish', () => {
    const duration = Date.now() - start;
    (logItem as any).statusCode = res.statusCode;
    (logItem as any).duration = duration;
    console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Endpoint to view all recent incoming HTTP requests
app.get('/http-logs', (req, res) => {
  res.json({ count: httpLogs.length, logs: httpLogs });
});

// Health check endpoint (No auth needed)
app.get('/health', async (req, res) => {
  try {
    const driver = DoubaoBrowserDriver.getInstance();
    const status = await driver.checkLoginStatus();
    res.json({
      status: 'ok',
      service: 'doubao2api',
      ...status
    });
  } catch (err: any) {
    res.json({
      status: 'starting_or_error',
      service: 'doubao2api',
      error: err.message
    });
  }
});

// Auth status endpoint (No auth needed)
app.get('/auth/status', async (req, res) => {
  try {
    const driver = DoubaoBrowserDriver.getInstance();
    const status = await driver.checkLoginStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});



// Inspect verify methods on window
app.get('/verify-methods', async (req, res) => {
  try {
    const driver = DoubaoBrowserDriver.getInstance();
    const page = (driver as any).page;
    if (!page) return res.status(500).json({ error: 'No page' });

    const info = await page.evaluate(() => {
      const modals = Array.from(document.querySelectorAll('[class*="z-100"], [class*="modal"], [class*="dialog"], [class*="overlay"], [class*="mask"]')).map(el => ({
        tag: el.tagName,
        className: el.className,
        hidden: el.classList.contains('hidden'),
        innerHTML: el.innerHTML.slice(0, 300)
      }));
      return { modals };
    });

    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/test-extract', async (req, res) => {
  try {
    const driver = DoubaoBrowserDriver.getInstance();
    const page = (driver as any).page;
    if (!page) return res.status(500).json({ error: 'No page' });

    const result = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('.md-box-root, [class*="md-box-root"]'));
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], [class*="send"], [class*="stop"]')).map(b => ({
        id: b.id,
        className: b.className,
        ariaLabel: b.getAttribute('aria-label'),
        title: (b as HTMLElement).title,
        text: (b as HTMLElement).innerText?.trim()
      }));
      return {
        count: boxes.length,
        answers: boxes.map(b => (b as HTMLElement).innerText?.trim()),
        buttons: buttons.filter(b => b.id || b.ariaLabel || b.title || b.text)
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Debug tokens endpoint
app.get('/debug-tokens', async (req, res) => {
  try {
    const driver = DoubaoBrowserDriver.getInstance();
    const page = (driver as any).page;
    if (!page) {
      return res.status(500).json({ error: 'Page not ready' });
    }

    const tokens = await page.evaluate(() => {
      let deviceId = '';
      let webId = '';
      try {
        const samWeb = JSON.parse(localStorage.getItem('samantha_web_web_id') || '{}');
        deviceId = samWeb.web_id || '';
      } catch (e) {}
      try {
        const tea = JSON.parse(localStorage.getItem('__tea_cache_tokens_497858') || '{}');
        webId = tea.web_id || '';
      } catch (e) {}

      const cookies = document.cookie.split(';').map(c => c.trim());
      const csrf = cookies.find(c => c.startsWith('passport_csrf_token='))?.split('=')[1] || '';
      const fpVal = cookies.find(c => c.startsWith('s_v_web_id='))?.split('=')[1] || '';
      const msTok = cookies.find(c => c.startsWith('msToken='))?.split('=')[1] || '';

      return {
        deviceId,
        webId,
        csrf,
        fpVal,
        msTok
      };
    });

    // Now test a simple fetch in page context
    const testResult = await page.evaluate(async (toks: any) => {
      const queryParams: Record<string, string> = {
        aid: '497858',
        device_id: toks.deviceId,
        device_platform: 'web',
        doubao_device_platform: 'web',
        doubao_pc_version: '3.35.5',
        fp: toks.fpVal,
        language: 'zh',
        pc_version: '3.35.5',
        pkg_type: 'release_version',
        real_aid: '497858',
        region: 'SG',
        samantha_web: '1',
        sys_region: 'SG',
        tea_uuid: toks.webId || toks.deviceId,
        'use-olympus-account': '1',
        version_code: '20800',
        web_id: toks.webId || toks.deviceId,
        web_platform: 'browser',
        web_tab_id: 'test-tab-' + Date.now()
      };
      if (toks.msTok) queryParams.msToken = toks.msTok;

      const queryString = Object.keys(queryParams).sort().map(k => `${k}=${encodeURIComponent(queryParams[k])}`).join('&');

      let xBogus = '';
      try {
        if (typeof (window as any).bdms?.frontierSign === 'function') {
          const sig = (window as any).bdms.frontierSign(queryString);
          xBogus = typeof sig === 'string' ? sig : (sig?.['X-Bogus'] || sig?.a_bogus || '');
        }
      } catch (e) {}

      const finalQuery = xBogus ? `${queryString}&X-Bogus=${encodeURIComponent(xBogus)}` : queryString;
      const url = `/chat/completion?${finalQuery}`;

      const now = Date.now();
      const mUuid = 'msg_' + now;
      const payload = {
        client_meta: {
          local_conversation_id: 'local_' + now,
          conversation_id: '',
          bot_id: '7338286299411103781',
          last_section_id: '',
          last_message_index: null
        },
        messages: [{
          local_message_id: mUuid,
          content_block: [{
            block_type: 10000,
            content: { text_block: { text: '你好', icon_url: '', icon_url_dark: '', summary: '' }, pc_event_block: '' },
            block_id: mUuid,
            parent_id: '',
            meta_info: [],
            append_fields: []
          }],
          message_status: 0
        }],
        option: {
          send_message_scene: '',
          create_time_ms: now,
          collect_id: '',
          is_audio: false,
          answer_with_suggest: false,
          tts_switch: false,
          need_deep_think: 0,
          click_clear_context: false,
          from_suggest: false,
          is_regen: false,
          is_replace: false,
          disable_sse_cache: false,
          select_text_action: '',
          resend_for_regen: false,
          scene_type: 0,
          unique_key: mUuid,
          start_seq: 0,
          need_create_conversation: true,
          regen_query_id: [],
          edit_query_id: [],
          regen_instruction: '',
          no_replace_for_regen: false,
          message_from: 0,
          shared_app_name: '',
          shared_app_id: '',
          sse_recv_event_options: { support_chunk_delta: true },
          is_ai_playground: false,
          recovery_option: { is_recovery: false, req_create_time_sec: Math.floor(now / 1000), append_sse_event_scene: 0 },
          message_storage_type: 0
        },
        ext: {
          use_deep_think: '0',
          fp: toks.fpVal,
          collection_id: '',
          commerce_credit_config_enable: '0',
          sub_conv_firstmet_type: '1'
        }
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'agw-js-conv': 'str'
      };
      if (toks.csrf) headers['x-tt-passport-csrf-token'] = toks.csrf;

      try {
        const resp = await window.fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          credentials: 'include'
        });

        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let fullStreamText = '';
        let fullReasoning = '';
        let chunksCount = 0;
        let lastError = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunksCount++;
          const textChunk = decoder.decode(value, { stream: true });
          const lines = textChunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (!dataStr || dataStr === '{}') continue;
              try {
                const data = JSON.parse(dataStr);
                if (data.text) fullStreamText += data.text;
                if (data.error_code && data.error_code !== 0) {
                  lastError = data;
                }
              } catch {}
            }
          }
        }

        return {
          status: resp.status,
          chunksCount,
          fullStreamText,
          lastError
        };
      } catch (err: any) {
        return { error: err.message };
      }
    }, tokens);

    res.json({ tokens, testResult });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Restart browser endpoint (forces headed mode to allow visual interaction/verification)
app.get('/restart-browser', async (req, res) => {
  try {
    const driver = DoubaoBrowserDriver.getInstance();
    await driver.close();
    await driver.init(true);
    res.json({ success: true, message: 'Browser restarted in headed mode' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Screenshot & page debug endpoint
app.get('/screenshot', async (req, res) => {
  try {
    const driver = DoubaoBrowserDriver.getInstance();
    const page = (driver as any).page;
    if (!page) {
      return res.status(500).json({ error: 'Page not ready' });
    }
    const screenshotPath = 'C:\\Users\\JunJia\\.gemini\\antigravity-ide\\brain\\32f36f98-a5ab-4b8e-927e-2a8dc84a34e2\\doubao_current_debug.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const url = page.url();
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    res.json({ success: true, screenshotPath, url, title, bodyText });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Deep inspect endpoint
app.get('/inspect', async (req, res) => {
  try {
    const driver = DoubaoBrowserDriver.getInstance();
    const page = (driver as any).page;
    if (!page) {
      return res.status(500).json({ error: 'Page not ready' });
    }

    const frames = page.frames().map((f: any) => ({ name: f.name(), url: f.url() }));

    const info = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]')).map(el => ({
        tag: el.tagName,
        className: el.className,
        id: el.id,
        disabled: (el as any).disabled,
        text: (el as HTMLElement).innerText?.trim() || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        html: el.innerHTML.slice(0, 100)
      })).filter(b => b.html.includes('svg') || b.ariaLabel || b.text);

      const captchaIframe = Array.from(document.querySelectorAll('iframe')).map(f => f.src);
      return {
        webdriver: navigator.webdriver,
        captchaIframe,
        buttons
      };
    });

    res.json({
      frames,
      networkLogs: driver.networkLogs.slice(-20),
      ...info
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Test UI chat endpoint
app.get('/test-ui-chat', async (req, res) => {
  try {
    const driver = DoubaoBrowserDriver.getInstance();
    const page = (driver as any).page;
    if (!page) {
      return res.status(500).json({ error: 'Page not ready' });
    }

    const testPrompt = String(req.query.q || '请只回答：1+1等于几？');

    const editor = page.locator('div.tiptap.ProseMirror[contenteditable="true"]').first();
    await editor.click();
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    // Use pressSequentially or evaluate insert
    await editor.pressSequentially(testPrompt, { delay: 10 });
    await page.waitForTimeout(300);

    const sendBtn = page.locator('#flow-end-msg-send').first();
    await sendBtn.click();

    // Now monitor DOM for up to 10 seconds
    const timeline: any[] = [];
    const startTime = Date.now();
    while (Date.now() - startTime < 8000) {
      await page.waitForTimeout(400);
      const snap = await page.evaluate(() => {
        const mdBoxes = Array.from(document.querySelectorAll('.md-box-root, [class*="md-box-root"]')).map(b => (b as HTMLElement).innerText?.trim());
        const stopBtn = document.querySelector('[class*="stop"], [aria-label*="停止"], [title*="停止"]');
        const sendBtn = document.querySelector('#flow-end-msg-send');
        const isSendDisabled = sendBtn ? sendBtn.classList.contains('cursor-not-allowed') || sendBtn.className.includes('disabled') : true;

        return {
          t: Date.now(),
          boxCount: mdBoxes.length,
          lastBox: mdBoxes[mdBoxes.length - 1] || '',
          hasStopBtn: Boolean(stopBtn),
          isSendDisabled
        };
      });
      timeline.push(snap);
      // If we got an answer and stop button disappeared and send button is disabled (idle), done!
      if (timeline.length >= 3 && snap.lastBox && !snap.hasStopBtn && snap.isSendDisabled) {
        break;
      }
    }

    const screenshotPath = 'C:\\Users\\JunJia\\.gemini\\antigravity-ide\\brain\\32f36f98-a5ab-4b8e-927e-2a8dc84a34e2\\doubao_ui_chat_result.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });

    res.json({ success: true, prompt: testPrompt, timeline, screenshotPath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Root greeting
app.get('/', (req, res) => {
  res.json({
    service: 'Doubao to ChatGPT/OpenAI Reverse Proxy (Doubao2API)',
    version: '1.0.0',
    endpoints: {
      models: '/v1/models',
      chat: '/v1/chat/completions',
      health: '/health',
      status: '/auth/status'
    },
    supported_models: Object.keys(SUPPORTED_MODELS)
  });
});

// Mount /v1 API routes with Bearer authentication
app.use('/v1', authMiddleware, modelsRouter);
app.use('/v1', authMiddleware, chatRouter);
app.use('/v1', authMiddleware, responsesRouter);
app.use('/', authMiddleware, responsesRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Path '${req.path}' not found`,
      type: 'invalid_request_error',
      code: 'not_found'
    }
  });
});

// Start listening
const server = app.listen(config.port, config.host, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Doubao2API Proxy Server is running!`);
  console.log(`📡 URL: http://${config.host === '0.0.0.0' ? '127.0.0.1' : config.host}:${config.port}`);
  console.log(`🔑 API Key Auth: ${config.apiKey ? (config.apiKey === 'any' ? 'Enabled (Any key accepted)' : 'Enabled') : 'Disabled'}`);
  console.log(`🌐 Base URL for clients: http://127.0.0.1:${config.port}/v1`);
  console.log(`=======================================================`);

  // Optionally pre-warm browser driver in background
  DoubaoBrowserDriver.getInstance().init().catch(err => {
    console.warn('[DoubaoDriver] Pre-warm warning (will retry on first request):', err.message);
  });
});

// Prevent unexpected errors from crashing the server
process.on('uncaughtException', (err) => {
  console.warn('[Server] Prevented crash on uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[Server] Prevented crash on unhandled rejection:', reason?.message || reason);
});

// Graceful shutdown
const cleanup = async () => {
  console.log('\n[Doubao2API] Shutting down server...');
  server.close();
  await DoubaoBrowserDriver.getInstance().close();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
