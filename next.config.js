/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Add environment variables to be accessible in the browser
  env: {
    MODEL_DATA: process.env.MODEL_DATA || '{}',
    STATIC_DATA_PLACEHOLDER: 'WILL_BE_REPLACED_AT_BUILD_TIME'
  }
}

module.exports = nextConfig