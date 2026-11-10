import assert from 'node:assert/strict';
import handler from '../api/ai-image-to-image.js';

function call({ method = 'POST', headers = {}, body = {} } = {}) {
  const req = Object.assign((async function* () {})(), {
    method, headers: { host: 'localhost:3000', ...headers }, body
  });
  return new Promise(resolve => {
    const res = {
      code: 200, headers: {}, payload: null,
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.code = code; return this; },
      json(payload) { this.payload = payload; resolve(this); }
    };
    handler(req, res);
  });
}

const image = 'data:image/png;base64,' + Buffer.from('fake-png-bytes').toString('base64');
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

try {
  delete process.env.AI_IMAGE_API_URL;
  delete process.env.AI_IMAGE_API_KEY;
  delete process.env.AI_IMAGE_MODEL;
  assert.equal((await call()).code, 503, 'unconfigured provider should return 503');

  assert.equal((await call({ headers: { 'sec-fetch-site': 'cross-site' } })).code, 403,
    'cross-site browser requests should be blocked');

  process.env.AI_IMAGE_API_URL = 'https://provider.example/v1/images/edits';
  process.env.AI_IMAGE_API_KEY = 'test-secret';
  process.env.AI_IMAGE_MODEL = 'test-image-model';

  assert.equal((await call({ body: { image: 'not-an-image', prompt: 'sky' } })).code, 400,
    'invalid image data should be rejected');
  assert.equal((await call({ body: { image, prompt: '' } })).code, 400,
    'empty prompt should be rejected');

  let sentAuth = '';
  globalThis.fetch = async (_url, options) => {
    sentAuth = options.headers.Authorization;
    assert.ok(options.body instanceof FormData, 'provider request should use multipart form data');
    return {
      ok: true, status: 200,
      json: async () => ({ data: [{ b64_json: Buffer.from('generated-image').toString('base64') }] })
    };
  };
  const success = await call({ body: { image, prompt: 'soft morning sky' } });
  assert.equal(success.code, 200);
  assert.equal(success.payload.size, '2048x1024');
  assert.match(success.payload.image, /^data:image\/png;base64,/);
  assert.equal(sentAuth, 'Bearer test-secret');
  console.log('AI image API tests passed');
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}
