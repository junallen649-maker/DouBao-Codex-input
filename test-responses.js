async function testResponses() {
  console.log('Testing POST /v1/responses ...');
  const resp = await fetch('http://127.0.0.1:8000/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer any-token'
    },
    body: JSON.stringify({
      model: 'gpt-5.6-terra',
      input: [{ role: 'user', content: '你是谁？请简短回答一句话。' }],
      stream: true
    })
  });

  console.log('Status:', resp.status);
  console.log('Headers:', resp.headers.get('content-type'));

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let count = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    count++;
    const chunk = decoder.decode(value, { stream: true });
    console.log(`[Chunk ${count}]:\n${chunk.trim()}`);
  }

  console.log('Stream ended successfully.');
}

testResponses().catch(console.error);
