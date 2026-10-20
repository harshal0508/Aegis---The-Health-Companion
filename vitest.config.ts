import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load environment variables from .env and .env.local without VITE_ prefix restriction
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, val] of Object.entries(env)) {
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }

  // Fallbacks for Supabase environment keys
  if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (!process.env.SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }

  const isRlsTest = process.argv.some((arg) => arg.includes("rls"));

  return {
    test: {
      // RLS tests hit a real Supabase instance — no mocking
      environment: "node",
      globals: true,
      // Each test file runs in its own worker to avoid auth state bleed
      pool: "forks",
      poolOptions: {
        forks: {
          singleFork: false,
        },
      },
      // 30s timeout — Supabase cold-start can be slow
      testTimeout: 30000,
      hookTimeout: 30000,
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        ...(!isRlsTest ? ["**/tests/rls/**"] : []),
      ],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
