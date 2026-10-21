import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // หน้าร้านใช้ <a> ธรรมดา (โหลดหน้าใหม่ทุกครั้ง) เพราะ public/js/shell.js และ home.js ที่ย้ายจากต้นแบบ
  // ทำงานตอนโหลดหน้าเท่านั้น — เปลี่ยนเป็น <Link> ได้หลังแยกเป็น React component
  {
    files: ["src/app/(shop)/**"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
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
    // สำเนาโค้ดชั่วคราวของ agent (git worktree)
    ".claude/**",
    "playwright-report/**",
    "test-results/**",
    "docs/**",
    "public/**",
    "generated/**",
  ]),
]);

export default eslintConfig;
