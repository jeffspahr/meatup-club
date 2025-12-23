/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloudflare Pages compatibility
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
