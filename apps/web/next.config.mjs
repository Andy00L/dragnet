/** @type {import('next').NextConfig} */
const nextConfig = {
  // @dragnet/sdk, @dragnet/crypto, and @dragnet/scanner ship as TypeScript source
  // (main: src/index.ts), so Next must transpile them alongside the app rather
  // than expecting a prebuilt dist.
  transpilePackages: ["@dragnet/sdk", "@dragnet/crypto", "@dragnet/scanner"],
};

export default nextConfig;
