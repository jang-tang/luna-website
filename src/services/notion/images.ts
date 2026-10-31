import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import sharp, { type Sharp } from 'sharp';
import type { ImageVariant } from './collections';

/**
 * Notion 이미지 다운로드 → 리사이즈 → WebP 변환.
 * Notion 호스팅 파일 URL 은 약 1시간 뒤 만료되므로 화면에서 직접 참조할 수 없다.
 * 동기화 시점에 내려받아 DB(media 테이블)에 저장하고 우리 도메인(/media/:id.webp)에서 장기 캐시로 제공한다.
 */

export const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

export type ProcessedImage = {
  id: string;
  contentType: 'image/webp';
  width: number;
  height: number;
  data: Buffer;
};

export class ImageError extends Error {}

/** 사설망/로컬 주소로의 요청 차단 (외부 URL 이미지 속성을 통한 SSRF 방지) */
export function assertPublicHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ImageError('unsupported protocol');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const privateHost =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    (isIP(host) === 4 && /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) ||
    (isIP(host) === 6 && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')));
  if (privateHost) throw new ImageError('private address not allowed');
  return url;
}

export async function downloadImage(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  let url = assertPublicHttpUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    // 리다이렉트도 매 단계 주소를 검증한다 (최대 3회)
    let res = await fetchImpl(url, { signal: controller.signal, redirect: 'manual' });
    for (let hop = 0; res.status >= 300 && res.status < 400 && res.headers.get('location'); hop++) {
      if (hop >= 3) throw new ImageError('too many redirects');
      url = assertPublicHttpUrl(new URL(res.headers.get('location')!, url).toString());
      res = await fetchImpl(url, { signal: controller.signal, redirect: 'manual' });
    }
    if (!res.ok || !res.body) throw new ImageError(`download failed (${res.status})`);
    const declared = Number(res.headers.get('content-length'));
    if (declared > MAX_DOWNLOAD_BYTES) throw new ImageError('file too large');
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw new ImageError('file too large');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    if (controller.signal.aborted) throw new ImageError('download timeout');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function processImage(input: Buffer, variant: ImageVariant): Promise<ProcessedImage> {
  let pipeline: Sharp;
  try {
    // limitInputPixels: 압축 폭탄 방지 (약 1억 픽셀)
    pipeline = sharp(input, { limitInputPixels: 100_000_000, failOn: 'error' }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) throw new ImageError('not an image');
  } catch (err) {
    if (err instanceof ImageError) throw err;
    throw new ImageError('unsupported image format');
  }
  const { data, info } = await pipeline
    .resize({ width: variant.width, height: variant.height, fit: variant.fit, withoutEnlargement: true })
    .webp({ quality: variant.quality, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  return {
    id: createHash('sha256').update(data).digest('hex').slice(0, 32),
    contentType: 'image/webp',
    width: info.width,
    height: info.height,
    data,
  };
}
