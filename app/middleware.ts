export { default } from 'next-auth/middleware';

// Protect all routes under /dashboard
export const config = {
  matcher: ['/dashboard/:path*'],
};
