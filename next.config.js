/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Add environment variables to be accessible in the browser
  env: {
    MODEL_DATA: process.env.MODEL_DATA || '{}'
  }
}

module.exports = nextConfig