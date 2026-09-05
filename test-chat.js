async function test() {
  const resp = await fetch('http://127.0.0.1:8000/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sk-doubao-proxy-123456'
    },
    body: JSON.stringify({
      model: 'doubao-pro',
      messages: [{ role: 'user', content: '你好' }],
      stream: false
    })
  });

  console.log('Status:', resp.status);
  const text = await resp.text();
  console.log('Body:', text);
}

test().catch(console.error);
