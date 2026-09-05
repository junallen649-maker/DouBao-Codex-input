import { chromium } from 'playwright-core';
import { config } from '../config.js';
import { CookieManager } from '../services/doubao/cookie-manager.js';

async function main() {
  console.log('=======================================================');
  console.log('   豆包网页版快捷登录助手 (Doubao Login Assistant)     ');
  console.log('=======================================================');
  console.log(`正在使用本地浏览器 (${config.browserChannel}) 打开豆包网页版...`);
  console.log(`登录信息将持久化保存在目录: ${config.userDataDir}\n`);

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    channel: config.browserChannel as any,
    headless: false, // Always visible for user interaction
    viewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  console.log('正在打开豆包官网 (https://www.doubao.com/chat/) ...');
  await page.goto('https://www.doubao.com/chat/', {
    waitUntil: 'domcontentloaded'
  });

  console.log('👉 请在弹出的浏览器窗口中完成登录（支持微信扫码、手机验证码或抖音登录）。');
  console.log('⏳ 正在监听登录状态，完成后将自动保存并退出...\n');

  // Poll for login status every 2 seconds
  const checkInterval = setInterval(async () => {
    try {
      const cookies = await context.cookies(['https://www.doubao.com']);
      if (CookieManager.hasValidSession(cookies)) {
        clearInterval(checkInterval);

        console.log('\n=======================================================');
        console.log('🎉 检测到登录成功！');
        console.log(`✅ 凭证已完整保存至本地持久化目录: ${config.userDataDir}`);
        
        // Print cookie string summary
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.log(`\n🔑 您的 Cookie 摘要 (可选择填入 .env 的 DOUBAO_COOKIE):`);
        console.log(cookieStr.substring(0, 100) + '... (已省略)');
        console.log('=======================================================');
        console.log('现在您可以随时关闭该窗口，并运行 "npm run dev" 启动 API 代理服务！\n');

        setTimeout(async () => {
          await context.close();
          process.exit(0);
        }, 3000);
      }
    } catch {
      // Ignore polling errors
    }
  }, 2000);
}

main().catch(err => {
  console.error('登录助手启动失败:', err);
  process.exit(1);
});
