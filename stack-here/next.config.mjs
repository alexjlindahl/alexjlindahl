/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "pg"],
  outputFileTracingIncludes: {
    "/s/[id]/card.png": ["./assets/fonts/*"],
  },
};
export default nextConfig;
