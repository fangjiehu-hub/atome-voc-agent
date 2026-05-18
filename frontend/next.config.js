/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    // BACKEND_URL is server-side only (runtime env), pointing at the backend
    // inside the docker network or Fly's internal hostname. Falls back to the
    // public NEXT_PUBLIC_API_URL (client-facing). For local docker-compose,
    // set BACKEND_URL=http://backend:8000.
    const backendUrl = process.env.BACKEND_URL
      || process.env.NEXT_PUBLIC_API_URL
      || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      // Root URL serves the imported Claude Design prototype (static, mock data).
      // The Next.js page-tsx redirect only works for client-side navigation,
      // so we wire it at the framework level for direct HTTP hits too.
      {
        source: '/',
        destination: '/design/atome-voc.html',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
