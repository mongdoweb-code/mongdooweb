"use server";
// แจ้งเคลม ขั้นที่ 1: ตรวจเลขที่คำสั่งซื้อ + เบอร์โทร แล้วคืนรายการสินค้าและสิทธิ์ (ประกัน 1 ปี / คืนภายใน 7 วัน)
import { ClaimError, claimLookup } from "@/lib/claims";
import { clientIp, overLimit } from "@/lib/rate-limit";

export type ClaimLookupState = {
  error?: string;
  orderNo?: string;
  phone?: string;
  order?: Awaited<ReturnType<typeof claimLookup>>;
};

export async function lookupClaimOrder(_prev: ClaimLookupState, formData: FormData): Promise<ClaimLookupState> {
  const orderNo = String(formData.get("orderNo") ?? "").trim().toUpperCase().slice(0, 40);
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 20);
  if (!orderNo || phone.replace(/\D/g, "").length < 9) return { error: "กรอกเลขที่คำสั่งซื้อ และเบอร์โทรที่ใช้สั่งซื้อให้ครบ", orderNo, phone };
  if (overLimit(`claim-lookup:${await clientIp()}`, 15, 10 * 60e3))
    return { error: "ค้นหาบ่อยเกินไป กรุณารอสักครู่ หรือติดต่อร้านทาง LINE", orderNo, phone };
  try {
    return { orderNo, phone, order: await claimLookup(orderNo, phone) };
  } catch (e) {
    if (e instanceof ClaimError) return { error: e.message, orderNo, phone };
    throw e;
  }
}
