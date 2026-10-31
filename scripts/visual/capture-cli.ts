/**
 * 화면 캡처 CLI.  node --import tsx scripts/visual/capture-cli.ts <baseUrl> <outDir> [--legacy]
 * (npm/npx 경유 실행 시 이 환경에서 headless 브라우저가 스크린샷 중 종료되는 현상이 있어 node 로 직접 실행한다)
 */
import { capture } from './capture';

const [baseUrl, outDir, flag] = process.argv.slice(2);
if (!baseUrl || !outDir) {
  console.error('usage: node --import tsx scripts/visual/capture-cli.ts <baseUrl> <outDir> [--legacy]');
  process.exit(1);
}
capture(baseUrl.replace(/\/$/, ''), outDir, flag === '--legacy' ? 'legacy' : 'next')
  .then((summary) => console.log(JSON.stringify(summary, null, 1)))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
