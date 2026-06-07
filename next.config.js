/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export', // Commented out for development - uncomment for Firebase deployment
  reactStrictMode: true,
  swcMinify: true,
  images: {
    unoptimized: true,
    domains: ['lh3.googleusercontent.com'],
  },
  webpack: (config, { isServer }) => {
    // Fixes npm packages that depend on `fs` module
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
}

module.exports = nextConfig