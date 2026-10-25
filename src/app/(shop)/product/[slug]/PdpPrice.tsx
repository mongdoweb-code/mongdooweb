"use client";
// ราคาบนหน้าสินค้า (U3/U10): ราคาปัจจุบัน + ราคาปกติขีดฆ่า + นับถอยหลังเมื่อโปรใกล้หมด (< 7 วัน) + ตารางราคาขายส่ง
// คำนวณตามเวลาจริงของเครื่องลูกค้า — หมดเวลาลดแล้วกลับเป็นราคาปกติทันที (ราคาที่คิดเงินจริงคำนวณที่ server เสมอ)
import { percentOff, unitForQty, viewPrice, type SaleInfo, type TierInfo } from "@/lib/pricing";
import { formatBaht } from "../../_components/format";
import { countdownText, useNow } from "../../_components/PriceBits";

type Props = { price: number; compareAt: number | null; sale: SaleInfo | null; tiers: TierInfo; unit: string };

const WEEK = 7 * 86400e3;

function Countdown({ endsAt }: { endsAt: number }) {
  const now = useNow(1000);
  if (now == null || endsAt - now > WEEK || endsAt <= now) return null;
  return (
    <p className="pdp-countdown" role="timer" aria-live="off">
      <span className="lbl">โปรนี้เหลือเวลาอีก</span> <b>{countdownText(endsAt - now)}</b>
    </p>
  );
}

function View({ p, now }: { p: Props; now: number | null }) {
  const v = viewPrice(p, now);
  const off = v.compareAt ? percentOff(v.price, v.compareAt) : 0;
  const tiers = p.tiers.filter(([, t]) => t < v.price);
  return (
    <>
      <div className="pdp-price">
        {v.price > 0 ? formatBaht(v.price) : "สอบถามราคา"}
        {v.compareAt && (
          <s>
            <span className="sr-only">ราคาปกติ </span>
            {formatBaht(v.compareAt)}
          </s>
        )}
        {v.on && off > 0 && <span className="pdp-off">ลด {off}%</span>}
      </div>
      {v.on && v.endsAt && <Countdown endsAt={v.endsAt} />}
      {v.price > 0 && tiers.length > 0 && (
        <table className="tier-table">
          <caption>ราคาขายส่ง ยิ่งซื้อมากยิ่งถูก</caption>
          <thead>
            <tr>
              <th scope="col">จำนวน</th>
              <th scope="col">ราคาต่อ{p.unit}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {tiers[0][0] > 2 ? `1–${tiers[0][0] - 1}` : "1"} {p.unit}
              </td>
              <td>{formatBaht(v.price)}</td>
            </tr>
            {tiers.map(([min, t]) => (
              <tr key={min}>
                <td>
                  ซื้อ {min} {p.unit}ขึ้นไป
                </td>
                <td>
                  <b>{formatBaht(unitForQty(v.price, p.tiers, min))}</b>/{p.unit}
                  <span className="tier-save"> (ประหยัด {percentOff(t, v.price)}%)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Live({ p }: { p: Props }) {
  return <View p={p} now={useNow()} />;
}

export function PdpPrice(p: Props) {
  return p.sale ? <Live p={p} /> : <View p={p} now={null} />;
}
