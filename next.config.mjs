/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // evidence and working-paper uploads go through server actions
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
  // pdfkit reads its font files from its own folder at run time, so it can't be bundled (generated letters and reports)
  serverExternalPackages: ["pdfkit"],
};
export default nextConfig;
