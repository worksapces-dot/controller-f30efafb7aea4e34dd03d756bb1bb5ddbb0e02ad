/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'instagram.ftas1-2.fna.fbcdn.net'
      },
      {
        protocol: 'https',
        hostname: '*.cdninstagram.com'
      },
      {
        protocol: 'https',
        hostname: 'scontent.cdninstagram.com'
      },
      {
        protocol: 'https',
        hostname: '*.fbcdn.net'
      },
    ],
  },
}

export default nextConfig
