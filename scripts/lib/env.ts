/**
 * CLI 스크립트용 환경변수 로더. Next.js 와 같은 우선순위로 .env.local → .env 를 읽는다.
 * (이미 설정된 process.env 값은 덮어쓰지 않는다)
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
