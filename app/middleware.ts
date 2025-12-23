export { auth as middleware } from '@/auth';

// Protect all routes under /dashboard
export const config = {
  matcher: ['/dashboard/:path*'],
};
