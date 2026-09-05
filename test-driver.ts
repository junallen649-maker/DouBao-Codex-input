import { DoubaoBrowserDriver } from './src/services/doubao/browser-driver.js';

async function main() {
  const driver = DoubaoBrowserDriver.getInstance();
  console.log('Testing driver...');
  await driver.init();

  await driver.chatCompletion({
    model: 'doubao-pro',
    prompt: '你好，回复一句测试',
    onChunk: (text, convId) => {
      console.log('[onChunk]', text, 'convId:', convId);
    },
    onReasoning: (reasoning) => {
      console.log('[onReasoning]', reasoning);
    },
    onFinish: (convId) => {
      console.log('[onFinish] convId:', convId);
      process.exit(0);
    },
    onError: (err) => {
      console.error('[onError]', err);
      process.exit(1);
    }
  });
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
