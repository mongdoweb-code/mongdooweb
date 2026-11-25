// ช่วงวันที่ในตัวกรองของหน้าหลังบ้าน: อ่านรูปแบบปี (พ.ศ./ค.ศ.) จากตั้งค่าร้าน แล้วแสดงด้วย DateRange (client)
import { getSettings } from "@/lib/settings";
import { DateRange } from "./DateRange";

export async function DateRangeFilter(props: Omit<React.ComponentProps<typeof DateRange>, "era">) {
  const s = await getSettings();
  return <DateRange {...props} era={s.dateEra} />;
}
