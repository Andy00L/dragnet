/** @type {import('next').NextConfig} */
const nextConfig = {
  // @dragnet/sdk and @dragnet/crypto are shipped as TypeScript source (main:
  // src/index.ts), so Next must transpile them alongside the app rather than
  // expecting a prebuilt dist.
  transpilePackages: ["@dragnet/sdk", "@dragnet/crypto"],
};

export default nextConfig;
