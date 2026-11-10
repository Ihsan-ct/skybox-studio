import { guard } from './_guard.js';
import { requireUser } from './_session.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 25000;

function json(res, status, body) {
  res.status(status).json(body);
}

async function readBody(req, limit) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request terlalu besar.'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function decodeImage(value) {
  if (typeof value !== 'string') throw new Error('Gambar sumber tidak ditemukan.');
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Format gambar harus PNG, JPEG, atau WebP.');
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('Ukuran gambar maksimal 8 MB.'), { status: 413 });
  return { data, mime: match[1] };
}

function safeMessage(value) {
  return String(value || 'Provider AI gagal memproses gambar.').replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (!requireUser(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method tidak didukung.' });
  }

  const endpoint = process.env.AI_IMAGE_API_URL;
  const apiKey = process.env.AI_IMAGE_API_KEY;
  const model = process.env.AI_IMAGE_MODEL;
  if (!endpoint || !apiKey || !model) {
    return json(res, 503, {
      error: 'AI belum dikonfigurasi. Atur AI_IMAGE_API_URL, AI_IMAGE_API_KEY, dan AI_IMAGE_MODEL di environment server.'
    });
  }

  let input;
  try {
    input = await readBody(req, MAX_IMAGE_BYTES * 2);
  } catch (error) {
    return json(res, error.status || 400, { error: error.status === 413 ? error.message : 'Body JSON tidak valid.' });
  }

  let source;
  try {
    source = decodeImage(input.image);
  } catch (error) {
    return json(res, error.status || 400, { error: error.message });
  }

  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (!prompt || prompt.length > 4000) return json(res, 400, { error: 'Prompt wajib diisi (maksimal 4.000 karakter).' });

  let target;
  try {
    target = new URL(endpoint);
    if (!['https:', 'http:'].includes(target.protocol)) throw new Error('protocol');
  } catch (_) {
    return json(res, 500, { error: 'AI_IMAGE_API_URL harus berupa URL endpoint HTTPS yang valid.' });
  }

  try {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt + ' Create a seamless 360-degree equirectangular sky panorama. Output must be exactly 2:1 aspect ratio, 2048x1024 pixels. Preserve the main visual subject and composition of the input while extending the environment naturally in every direction. No text, watermark, borders, or frame.');
    form.append('size', '2048x1024');
    form.append('response_format', 'b64_json');
    form.append('image', new Blob([source.data], { type: source.mime }), 'source-image');

    const response = await fetch(target.toString(), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload.error?.message || payload.message || ('HTTP ' + response.status);
      return json(res, response.status >= 400 && response.status < 500 ? response.status : 502, {
        error: 'Provider AI: ' + safeMessage(detail)
      });
    }

    let imageData = payload.data?.[0]?.b64_json || payload.image || payload.output?.[0];
    if (typeof imageData === 'string' && /^https?:\/\//i.test(imageData)) {
      const imageResponse = await fetch(imageData, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!imageResponse.ok) throw new Error('Gagal mengambil hasil gambar dari provider.');
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      if (!buffer.length || buffer.length > MAX_OUTPUT_BYTES) throw new Error('Hasil gambar melebihi batas 12 MB.');
      const type = imageResponse.headers.get('content-type') || 'image/png';
      if (!/^image\/(png|jpeg|webp)$/i.test(type)) throw new Error('Provider mengembalikan format gambar yang tidak didukung.');
      imageData = 'data:' + type.split(';')[0] + ';base64,' + buffer.toString('base64');
    } else if (typeof imageData === 'string' && !imageData.startsWith('data:')) {
      imageData = 'data:image/png;base64,' + imageData;
    }

    if (typeof imageData !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData)) {
      throw new Error('Format respons provider tidak dikenali. Endpoint harus mengembalikan data[0].b64_json atau data[0].url.');
    }
    if (Buffer.byteLength(imageData, 'utf8') > MAX_OUTPUT_BYTES * 1.5) throw new Error('Hasil gambar melebihi batas ukuran.');
    return json(res, 200, { image: imageData, model, size: '2048x1024' });
  } catch (error) {
    return json(res, 502, { error: 'Gagal memproses gambar AI: ' + safeMessage(error.message) });
  }
}
