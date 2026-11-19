import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The sandbox preview is served from *.e2b.app; allow it during development.
  allowedDevOrigins: ['*.e2b.app'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
