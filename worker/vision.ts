/**
 * Shared helpers for the Workers AI vision endpoints (photo logging,
 * recipe scanning).
 *
 * Model: Mistral Small 3.1 - capable at vision, Apache-2.0 licensed (no
 * usage gate, unlike Meta's llama-3.2-vision which excludes EU users).
 */

import type { Env } from './index';

const VISION_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

/** Base64-encode an ArrayBuffer in chunks (a large spread into
 *  String.fromCharCode would overflow the stack). */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Pull the JSON object out of a model response that may carry prose. */
export function extractJson(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Run the vision model on an image + prompt; return its parsed JSON. */
export async function runVisionJson(
  env: Env,
  image: ArrayBuffer,
  prompt: string,
): Promise<unknown> {
  const out = (await env.AI.run(VISION_MODEL, {
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${toBase64(image)}` },
          },
        ],
      },
    ],
  })) as { response?: string };
  return extractJson(out.response);
}
