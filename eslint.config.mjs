import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ต้นแบบ HTML, ชุดทดสอบ Python และ Prisma client ที่ generate อัตโนมัติ
    "prototype/**",
    "tests/**",
    "docs/**",
    "generated/**",
  ]),
]);

export default eslintConfig;
