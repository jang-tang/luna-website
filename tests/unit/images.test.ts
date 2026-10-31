import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { IMAGE_VARIANTS } from '@/services/notion/collections';
import { downloadImage, ImageError, processImage } from '@/services/notion/images';

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 82, g: 75, b: 155, alpha: 1 } } }).png().toBuffer();

describe('이미지 처리', () => {
  it('멤버 사진은 280x280 WebP(cover) 로 변환되고, 같은 입력은 같은 id', async () => {
    const input = await png(1200, 900);
    const a = await processImage(input, IMAGE_VARIANTS.members);
    const b = await processImage(input, IMAGE_VARIANTS.members);
    expect(a.contentType).toBe('image/webp');
    expect([a.width, a.height]).toEqual([280, 280]);
    expect(a.id).toBe(b.id);
    expect((await sharp(a.data).metadata()).format).toBe('webp');
  });

  it('작은 이미지는 확대하지 않고, 프로젝트 이미지는 비율을 유지(inside)', async () => {
    const small = await processImage(await png(100, 50), IMAGE_VARIANTS.projects);
    expect([small.width, small.height]).toEqual([100, 50]);
    const wide = await processImage(await png(1000, 500), IMAGE_VARIANTS.projects);
    expect([wide.width, wide.height]).toEqual([280, 140]);
  });

  it('이미지가 아닌 데이터는 ImageError', async () => {
    await expect(processImage(Buffer.from('<html>not an image</html>'), IMAGE_VARIANTS.members)).rejects.toBeInstanceOf(ImageError);
  });

  it('다운로드: 사설망으로의 리다이렉트를 차단하고 크기 제한을 적용', async () => {
    const redirectFetch = (async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } })) as unknown as typeof fetch;
    await expect(downloadImage('https://example.com/a.png', redirectFetch)).rejects.toBeInstanceOf(ImageError);

    const hugeFetch = (async () => new Response('x', { status: 200, headers: { 'content-length': String(100 * 1024 * 1024) } })) as unknown as typeof fetch;
    await expect(downloadImage('https://example.com/a.png', hugeFetch)).rejects.toThrow('file too large');

    const okFetch = (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch;
    expect([...(await downloadImage('https://example.com/a.png', okFetch))]).toEqual([1, 2, 3]);
  });
});
