import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permitir accesos desde la red local
  allowedDevOrigins: ['192.168.1.131'],
};

export default nextConfig;
