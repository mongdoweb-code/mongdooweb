// ฟอนต์ที่ตั้งจากหลังร้าน (src/lib/typography.ts): ลิงก์ Google Fonts เฉพาะฟอนต์ที่เลือก + CSS — ไม่ได้ตั้ง = ไม่แสดงอะไร (หน้าตาเดิม)
export function TypographyStyle({ css, url }: { css: string; url: string | null }) {
  if (!css) return null;
  return (
    <>
      {url && <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />}
      {url && <link rel="stylesheet" href={url} precedence="default" />}
      <style data-typography>{css}</style>
    </>
  );
}
