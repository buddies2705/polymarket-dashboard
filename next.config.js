/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Fix for better-sqlite3
    if (isServer) {
      config.externals.push('better-sqlite3');
    }
    return config;
  },
  // Ensure environment variables are available in API routes
  env: {
    BITQUERY_OAUTH_TOKEN: process.env.BITQUERY_OAUTH_TOKEN || process.env.BITQUERY_API_KEY,
    BITQUERY_API_KEY: process.env.BITQUERY_API_KEY || process.env.BITQUERY_OAUTH_TOKEN,
    BITQUERY_ENDPOINT: process.env.BITQUERY_ENDPOINT,
  },
};

module.exports = nextConfig;
