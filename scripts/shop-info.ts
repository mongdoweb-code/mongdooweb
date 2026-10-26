// ข้อมูลรับเงินและค่าจำลองจากเจ้าของร้าน — ใช้ทั้งตอน seed ฐานข้อมูลใหม่ และเติมให้ฐานข้อมูลเดิม (scripts/fill-shop-info.ts)
// ค่าที่ระบุว่า "จำลอง" ยังรอเจ้าของร้านยืนยัน แก้ได้ที่หลังบ้าน › ตั้งค่าร้าน
export const HOLDER = "นายทรงศักดิ์ ขันทอง";

export const SHOP_PAYMENT = {
  promptpayId: "0859577561",
  promptpayName: HOLDER,
  bankAccounts: [
    { bank: "KBANK", account: "4982105000", holder: HOLDER },
    { bank: "SCB", account: "0852358798", holder: HOLDER },
  ],
};

// ค่าจำลอง: เก็บเงินปลายทาง (ปิดไว้จนกว่าเจ้าของร้านเปิดเอง) + ค่าส่งพื้นที่ห่างไกล (เกาะ/อำเภอที่ขนส่งคิดเพิ่ม)
export const SHOP_MOCK_SHIPPING = {
  codEnabled: false,
  codFeeSatang: 3000, // ฿30
  codMaxSatang: 1000000, // ไม่เกิน ฿10,000
  remoteFeeSatang: 5000, // ฿50
  remoteZips: ["84280", "84310", "84320", "84330", "84360", "81150", "81210", "82160", "23170", "20120", "83000", "83100", "83110", "83120", "83130", "83150", "91000", "91110"],
};
