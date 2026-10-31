import { eq } from 'drizzle-orm';
import { getDb } from '@/services/database/client';
import { media } from '@/services/database/schema';

/**
 * 동기화된 이미지 제공. id 는 변환 결과의 해시라 내용이 바뀌면 URL 도 바뀐다 → 1년 immutable 캐시.
 * 응답은 Next.js 캐시에도 저장되어(첫 요청 이후) DB 를 다시 조회하지 않는다.
 */
export const dynamicParams = true;
export const revalidate = false;

export function generateStaticParams() {
  return [];
}

const FILE_PATTERN = /^([0-9a-f]{32})\.webp$/;

export async function GET(_request: Request, ctx: RouteContext<'/media/[file]'>) {
  const { file } = await ctx.params;
  const match = FILE_PATTERN.exec(file);
  if (!match) return new Response('Not found', { status: 404 });
  const rows = await getDb()
    .select({ data: media.data, contentType: media.contentType })
    .from(media)
    .where(eq(media.id, match[1]!))
    .limit(1);
  const row = rows[0];
  if (!row) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(new Uint8Array(row.data), {
    headers: {
      'Content-Type': row.contentType,
      'Content-Length': String(row.data.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${match[1]}"`,
    },
  });
}
