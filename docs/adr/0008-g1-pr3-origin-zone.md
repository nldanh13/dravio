# ADR 0008 — Zone Khởi Nguyên, bố trí và ngân sách sản xuất (G1 PR3)

Trạng thái: Chấp nhận cho G1 PR3. Nguồn: GDD 3.1 trang 4–5 (tiến trình, môi trường và sức chứa), Phụ lục C.3 (`moveDragon`, `setProductionSlot`); ADR 0003; `docs/g0/PACK_README.md`; `docs/g0/AI_HANDOFF.md` mục PR3.

## Quyết định
1. **Suitability sống ở engine.** Hàm thuần `suitability` chuyển từ `src/data/g0Biology.ts` sang `src/engine/world/habitat.ts` theo AI_HANDOFF; `g0Biology.ts` re-export để giữ API cũ. Dữ liệu sinh học vẫn chỉ một nguồn. Ngưỡng: ≥ 80 phù hợp, 50–79 cần cải thiện (được bố trí, UI cảnh báo), < 50 không được bố trí.
2. **Zone Khởi Nguyên**: 3 microhabitat `origin_meadow`, `origin_pondbank`, `origin_warm_rocks`; 5 chỗ vật lý cho cả zone. Microhabitat không cộng thêm chỗ. Ocean/Sky vẫn khóa ở G1.
3. **Mở microhabitat**: save mới chỉ mở đồng cỏ. Bờ hồ và đá ấm mở "qua hướng dẫn/khám phá" (PACK_README). GDD không định giá vàng nên PR3 **không** tạo lệnh mua; chỉ có hàm engine `grantHabitatUnlock` (có test) để PR5 tutorial/nhiệm vụ gọi. Không phải lệnh người chơi.
4. **`moveDragon`** tới microhabitat (`zone` + `habitatId`) hoặc kho an toàn (`storage`). Thứ tự kiểm: rồng rảnh (không released, care, shelter, không bận) → zone mở → microhabitat mở và thuộc zone → suitability ≥ 50 → không phải chỗ hiện tại → còn chỗ (rồng đang trong cùng zone không tính chính nó). Kho an toàn không giới hạn trong PR3 (GDD chưa nêu sức chứa kho).
5. **`setProductionSlot`**: chọn chỉ khi rồng ở sinh cảnh đã mở và hợp lệ; ngân sách toàn cục `5 + 2 × islandCapacityLevel`, tối đa 25. Bỏ chọn luôn được phép. Rồng chuyển vào kho tự rời ngân sách (event `productionChanged`). Rồng ngoài ngân sách vẫn lớn.
6. **Quyết toán trước khi đổi**: hai lệnh trên kiểm điều kiện trên state hiện tại (lệnh lỗi không đổi gì), rồi chạy `advanceTime` online tới thời điểm lệnh, rồi mới đổi chỗ/ngân sách, để vàng trước đó tính theo vị trí cũ.
7. **Lỗi mới** (có i18n VI/EN): `zone-full`, `habitat-unsuitable`, `already-there`, `not-placed`, `production-budget-full`. **Event mới**: `dragonMoved`, `productionChanged`, `habitatUnlocked`.
8. **Schema không đổi**: vẫn Dravio Save Schema v1; `unlockedHabitatIds`, `productionDragonIds`, `location.habitatId` đã có từ PR1.

## Ngoài phạm vi PR3
- Lệnh mua nâng cấp sức chứa (`buyUpgrade`) — ngân sách đã đọc cấp hiện có; mua nâng cấp thuộc phần kinh tế.
- Tự chuyển vào nơi trú khi nguy hiểm (thiên tai, PR6/G2), graph di chuyển Origin↔Ocean/Sky (G2), renderer 2.5D (PR4), nhiệm vụ mở bờ hồ/đá ấm (PR5).

## Kiểm chứng
- `tests/unit/zones.test.ts` (19 test): bố cục zone, mở microhabitat, ngưỡng suitability, 4 loài Common G1 có chỗ phù hợp ở Origin, `placementOptions`, các lỗi chuyển chỗ không đổi state, zone đầy, rồng bận/care/shelter/released, vàng dừng đúng lúc vào kho hoặc tắt sản xuất, ngân sách toàn cục qua 2 zone và theo cấp, idempotency, lệnh sai hình dạng.
- Chromium 158 headless (Linux, Playwright, bản build `vite preview`): 8/8 kiểm tra UI zone đạt (hiển thị 3 sinh cảnh + kho, chỗ/ngân sách, bật/tắt sản xuất, chuyển vào kho và về đồng cỏ, không cuộn ngang ở 360 px); 15/15 kiểm tra lưu game của PR2 vẫn đạt. **Windows + Chromium trên thiết bị thật: chưa kiểm thử.**
