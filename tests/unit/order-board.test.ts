// หน้าจัดเรียงสินค้าหน้าร้าน: ย้าย / ปักหมุด / เรียงอัตโนมัติ / นับชิ้นที่ย้าย (src/lib/order-board.ts)
import assert from "node:assert/strict";
import { autoSort, boardPayload, dropIndex, moveEdge, moveIds, movedIds, pinnedFirst, setPinned } from "../../src/lib/order-board";

type It = { id: string; pinned: boolean; name: string; sku: string; price: number; sold: number; created: number; catOrder: number; out: boolean };
const mk = (id: string, o: Partial<It> = {}): It => ({ id, pinned: false, name: id, sku: id, price: 0, sold: 0, created: 0, catOrder: 0, out: false, ...o });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join(",");
const base = [mk("P", { pinned: true }), mk("a"), mk("b"), mk("c"), mk("d"), mk("e")];

assert.equal(ids(pinnedFirst([mk("a"), mk("P", { pinned: true })])), "P,a");
assert.equal(ids(moveIds(base, ["d"], 1)), "P,d,a,b,c,e", "ย้ายไปลำดับ 2");
assert.equal(ids(moveIds(base, ["d"], 0)), "P,d,a,b,c,e", "ไม่ขึ้นเหนือชิ้นปักหมุด");
assert.equal(ids(moveIds(base, ["b", "d"], 99)), "P,a,c,e,b,d", "หลายชิ้น ไปท้าย คงลำดับที่เห็น");
assert.equal(ids(moveIds(base, ["x"], 0)), ids(base), "id ไม่มี = ไม่เปลี่ยน");
assert.equal(dropIndex(base, ["a"], "c", true), 3);
assert.equal(ids(moveIds(base, ["a"], dropIndex(base, ["a"], "c", true))), "P,b,c,a,d,e", "ลาก a ไปวางหลัง c");
assert.equal(ids(moveIds(base, ["e"], dropIndex(base, ["e"], "b", false))), "P,a,e,b,c,d", "ลาก e ไปวางก่อน b");
assert.equal(ids(moveEdge(base, ["e"], "top")), "P,e,a,b,c,d", "บนสุด = ใต้ชิ้นปักหมุด");
assert.equal(ids(moveEdge(base, ["a"], "bottom")), "P,b,c,d,e,a");
const pinned = setPinned(base, ["c"], true);
assert.equal(ids(pinned), "P,c,a,b,d,e");
assert.ok(pinned.find((x) => x.id === "c")!.pinned);
assert.equal(ids(setPinned(pinned, ["P"], false)), "c,P,a,b,d,e", "เลิกปักหมุด = ต้นกลุ่มไม่ปักหมุด");
assert.deepEqual(boardPayload(pinned), { ids: ["P", "c", "a", "b", "d", "e"], pinned: ["P", "c"] });

const shop = [mk("P", { pinned: true, sold: 0 }), mk("a", { sold: 5, price: 300, created: 1, catOrder: 2, out: true, name: "ไฟ ข" }), mk("b", { sold: 9, price: 100, created: 3, catOrder: 1, name: "ไฟ ก" }), mk("c", { sold: 5, price: 200, created: 2, catOrder: 1, name: "ไฟ ค" })];
assert.equal(ids(autoSort(shop, "best")), "P,b,a,c", "ขายดี · เสมอ = ลำดับเดิม · ปักหมุดบนสุด");
assert.equal(ids(autoSort(shop, "new")), "P,b,c,a");
assert.equal(ids(autoSort(shop, "price-asc")), "P,b,c,a");
assert.equal(ids(autoSort(shop, "price-desc")), "P,a,c,b");
assert.equal(ids(autoSort(shop, "cat")), "P,b,c,a");
assert.equal(ids(autoSort(shop, "name")), "P,b,a,c");
assert.equal(ids(autoSort(shop, "stock")), "P,b,c,a");

// นับชิ้นที่ย้าย: ย้าย 1 ชิ้นไปบนสุด = 1 (ไม่ใช่ทุกชิ้นที่เลื่อนตาม)
assert.deepEqual([...movedIds(base, moveEdge(base, ["e"], "top"))], ["e"]);
assert.equal(movedIds(base, base).size, 0);
assert.deepEqual([...movedIds(base, setPinned(base, ["c"], true))], ["c"]);
const many = Array.from({ length: 200 }, (_, i) => mk(`x${i}`));
assert.equal(movedIds(many, moveIds(many, ["x150", "x7"], 3)).size, 2);
assert.equal(movedIds(many, [...many].reverse()).size, 199);
console.log("order-board: ok");
