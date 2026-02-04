import { PUBLIC_ENABLE_SSR } from '$env/static/public';

export const ssr = PUBLIC_ENABLE_SSR === 'true';
