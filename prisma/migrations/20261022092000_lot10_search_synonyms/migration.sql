-- ล็อต 10: ชุดคำพ้องเริ่มต้นสำหรับค้นหา (U15/A11) — ใส่ครั้งเดียวตอน migrate, แอดมินแก้/ลบได้ที่ /admin/search
-- (ชุดเดียวกับ DEFAULT_SYNONYMS ใน src/lib/search.ts) ไม่มีการเปลี่ยนโครงสร้างตาราง
INSERT INTO "SearchSynonym" ("id", "words", "createdAt") VALUES
  ('syn_default_01', ARRAY['ใต้น้ำ', 'ไฟใต้น้ำ', 'underwater']::TEXT[], CURRENT_TIMESTAMP + interval '0 millisecond'),
  ('syn_default_02', ARRAY['สระ', 'สระว่ายน้ำ', 'ไฟสระ', 'pool', 'swimming pool']::TEXT[], CURRENT_TIMESTAMP + interval '1 millisecond'),
  ('syn_default_03', ARRAY['น้ำพุ', 'ไฟน้ำพุ', 'fountain']::TEXT[], CURRENT_TIMESTAMP + interval '2 millisecond'),
  ('syn_default_04', ARRAY['สวน', 'ไฟสวน', 'ไฟสนาม', 'garden']::TEXT[], CURRENT_TIMESTAMP + interval '3 millisecond'),
  ('syn_default_05', ARRAY['บ่อปลา', 'บ่อน้ำ', 'pond']::TEXT[], CURRENT_TIMESTAMP + interval '4 millisecond'),
  ('syn_default_06', ARRAY['rgb', 'เปลี่ยนสี', 'หลายสี']::TEXT[], CURRENT_TIMESTAMP + interval '5 millisecond'),
  ('syn_default_07', ARRAY['แสงขาว', 'สีขาว', 'white', 'daylight', 'เดย์ไลท์']::TEXT[], CURRENT_TIMESTAMP + interval '6 millisecond'),
  ('syn_default_08', ARRAY['วอร์ม', 'วอร์มไวท์', 'warm', 'warm white', 'ww', 'แสงส้ม']::TEXT[], CURRENT_TIMESTAMP + interval '7 millisecond'),
  ('syn_default_09', ARRAY['หม้อแปลง', 'อะแดปเตอร์', 'adapter', 'power supply', 'พาวเวอร์ซัพพลาย', 'transformer', 'switching']::TEXT[], CURRENT_TIMESTAMP + interval '8 millisecond'),
  ('syn_default_10', ARRAY['ไฟเส้น', 'strip', 'led strip', 'ไฟริบบิ้น']::TEXT[], CURRENT_TIMESTAMP + interval '9 millisecond'),
  ('syn_default_11', ARRAY['รีโมท', 'รีโมต', 'remote', 'controller', 'คอนโทรลเลอร์']::TEXT[], CURRENT_TIMESTAMP + interval '10 millisecond'),
  ('syn_default_12', ARRAY['สปอร์ตไลท์', 'spotlight', 'floodlight', 'flood light', 'ฟลัดไลท์']::TEXT[], CURRENT_TIMESTAMP + interval '11 millisecond'),
  ('syn_default_13', ARRAY['ดาวน์ไลท์', 'downlight']::TEXT[], CURRENT_TIMESTAMP + interval '12 millisecond'),
  ('syn_default_14', ARRAY['ฝังพื้น', 'ไฟฝังพื้น', 'uplight', 'in ground']::TEXT[], CURRENT_TIMESTAMP + interval '13 millisecond'),
  ('syn_default_15', ARRAY['ท่อหด', 'heat shrink']::TEXT[], CURRENT_TIMESTAMP + interval '14 millisecond'),
  ('syn_default_16', ARRAY['ไฟส่องตึก', 'ไฟส่องอาคาร', 'wall washer', 'วอลวอชเชอร์']::TEXT[], CURRENT_TIMESTAMP + interval '15 millisecond'),
  ('syn_default_17', ARRAY['กันน้ำ', 'waterproof']::TEXT[], CURRENT_TIMESTAMP + interval '16 millisecond')
ON CONFLICT ("id") DO NOTHING;
