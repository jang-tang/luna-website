import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import sharp, { type OutputInfo, type Sharp } from 'sharp';
import type { ImageVariant } from './collections';

/**
 * Notion 이미지 다운로드 → 리사이즈 → WebP 변환.
 * Notion 호스팅 파일 URL 은 약 1시간 뒤 만료되므로 화면에서 직접 참조할 수 없다.
 * 동기화 시점에 내려받아 DB(media 테이블)에 저장하고 우리 도메인(/media/:id.webp)에서 장기 캐시로 제공한다.
 */

// 노션에 원본 그대로 올라간 고해상도 사진(30MB 안팎 PNG)이 있어 여유 있게 잡되, 비정상적으로 큰 파일은 막는다
export const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

export type ProcessedImage = {
  id: string;
  contentType: 'image/webp';
  width: number;
  height: number;
  data: Buffer;
};

export class ImageError extends Error {
  /** true 면 같은 파일로 다시 시도해도 결과가 같다 (형식 미지원·크기 초과·차단된 주소 등) */
  readonly permanent: boolean;

  constructor(message: string, options: { permanent?: boolean } = {}) {
    super(message);
    this.permanent = options.permanent ?? false;
  }
}

const permanent = { permanent: true } as const;

/** 사설망·루프백·링크로컬·메타데이터 주소인지 (IPv4 / IPv6, IPv4-mapped 포함) */
export function isPrivateAddress(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(addr) === 4) {
    return /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.)/.test(addr);
  }
  if (isIP(addr) === 6) return addr === '::' || addr === '::1' || /^(fc|fd|fe8|fe9|fea|feb)/.test(addr);
  return false;
}

/** 사설망/로컬 주소로의 요청 차단 (외부 URL 이미지 속성을 통한 SSRF 방지) — 문자열 단계 검사 */
export function assertPublicHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ImageError('unsupported protocol', permanent);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local') || isPrivateAddress(host)) {
    throw new ImageError('private address not allowed', permanent);
  }
  return url;
}

/** 도메인이 실제로 어떤 IP 로 풀리는지 확인해, 내부망으로 향하는 도메인(DNS 리바인딩 등)을 차단 */
async function assertResolvesPublic(url: URL, resolve: typeof lookup) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return;
  const addresses = await resolve(host, { all: true }).catch(() => {
    throw new ImageError('dns lookup failed');
  });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw new ImageError('private address not allowed', permanent);
}

export async function downloadImage(rawUrl: string, fetchImpl: typeof fetch = fetch, resolve: typeof lookup = lookup): Promise<Buffer> {
  let url = assertPublicHttpUrl(rawUrl);
  await assertResolvesPublic(url, resolve);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    // 리다이렉트도 매 단계 주소를 검증한다 (최대 3회)
    let res = await fetchImpl(url, { signal: controller.signal, redirect: 'manual' });
    for (let hop = 0; res.status >= 300 && res.status < 400 && res.headers.get('location'); hop++) {
      if (hop >= 3) throw new ImageError('too many redirects');
      url = assertPublicHttpUrl(new URL(res.headers.get('location')!, url).toString());
      await assertResolvesPublic(url, resolve);
      res = await fetchImpl(url, { signal: controller.signal, redirect: 'manual' });
    }
    if (!res.ok || !res.body) throw new ImageError(`download failed (${res.status})`);
    const declared = Number(res.headers.get('content-length'));
    if (declared > MAX_DOWNLOAD_BYTES) throw new ImageError('file too large', permanent);
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw new ImageError('file too large', permanent);
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
    if (!meta.width || !meta.height) throw new ImageError('not an image', permanent);
  } catch (err) {
    if (err instanceof ImageError) throw err;
    throw new ImageError('unsupported image format', permanent);
  }
  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await pipeline
      .resize({ width: variant.width, height: variant.height, fit: variant.fit, withoutEnlargement: true })
      .webp({ quality: variant.quality, effort: 5 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    // 예: 아이폰 HEIC(HEVC) — 메타데이터는 읽히지만 sharp 기본 빌드로는 디코딩할 수 없다
    throw new ImageError('unsupported image format (JPG/PNG/WebP 로 다시 올려 주세요)', permanent);
  }
  const { data, info } = output;
  return {
    id: createHash('sha256').update(data).digest('hex').slice(0, 32),
    contentType: 'image/webp',
    width: info.width,
    height: info.height,
    data,
  };
}
