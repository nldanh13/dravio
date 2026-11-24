# ADR 0009 — Mở khóa sinh cảnh Khởi Nguyên; Dravio Save Schema v2

Trạng thái: Chấp nhận 25/11/2026 theo quyết định của tác giả (bổ sung G1 PR3). Thay ADR 0008 mục 3. Nguồn: tin nhắn tác giả 25/11/2026; GDD 3.1 trang 4–5; PACK_README G0.

## Quyết định của tác giả
1. Origin có 3 microhabitat: `origin_meadow` mở mặc định; `origin_warm_rocks` mở khi hoàn thành khám phá nhu cầu nhiệt độ của Emberling; `origin_pondbank` mở khi hoàn thành khám phá môi trường thủy sinh.
2. Mở khóa miễn phí, không trừ vàng.
3. Ba sinh cảnh dùng chung 5 chỗ của Origin; mở khóa không tăng capacity hay ngân sách sản xuất.
4. Chuỗi hướng dẫn đề xuất (tích hợp ở G1 PR5): TUT_01 quan sát Emberling · TUT_02 cho ăn đúng thức ăn · TUT_03 xem hồ sơ sinh học · TUT_04 khám phá đá ấm, mở `origin_warm_rocks` · TUT_05 mở gói Starter có Sproutling · TUT_06 khảo sát bờ hồ, mở `origin_pondbank` · TUT_07 rồng đầu tiên trưởng thành · TUT_08 hoàn thành hướng dẫn ba sinh cảnh.
5. Không thêm phần thưởng vàng ngoài GDD.
6. Không cần sở hữu Droplet để mở bờ hồ. Bỏ qua hướng dẫn không làm mất khả năng mở.
7. PR3 làm lệnh mở khóa, kiểm điều kiện, domain event, trạng thái lưu. UI production không được tự khai báo hoàn thành nhiệm vụ.
8. Chuỗi nhiệm vụ đầy đủ ở G1 PR5, không làm trước G2.

## Cách triển khai
- **Điều kiện là "khám phá", không phải bước tutorial** (`src/data/habitatUnlocks.ts`): `DISC_EMBERLING_THERMAL` → `origin_warm_rocks`, `DISC_AQUATIC_HABITAT` → `origin_pondbank`. TUT_04/TUT_06 ghi nhận các khám phá này; PR5 phải có đường khám phá tương đương ngoài hướng dẫn để người bỏ hướng dẫn vẫn mở được (mục 6).
- **Trạng thái lưu**: `GameState.discoveries: DiscoveryId[]` (sắp xếp, không trùng, chỉ ID đã biết; validate runtime từ chối ID lạ/trùng).
- **Dravio Save Schema v2**: thêm `discoveries`. Bước migration chính thức đầu tiên `1 → 2` thêm `discoveries: []`, không đổi gì khác; từ chối state v1 đã có `discoveries`. Fixture `tests/fixtures/save-schema-v1.json` là save thật do code `main@34d42ec` (Schema v1) ghi; test kiểm mọi trường v1 được giữ, vàng/rồng/zone không đổi và bản gốc được lưu nguyên văn trong `archive:schema-1`. Bí danh 3 → 1 (ADR 0007) chạy tiếp bước 1 → 2.
- **Lệnh `unlockHabitat { habitatId }`** (người chơi bấm khi đủ điều kiện): kiểm theo thứ tự ID có luật (`unknown-habitat`) → zone mở (`zone-locked`) → chưa mở (`habitat-already-unlocked`) → đã có khám phá (`unlock-requirement-missing`). Thành công: thêm vào `unlockedHabitatIds` theo thứ tự zone, event `habitatUnlocked`; vàng, capacity, ngân sách, vị trí rồng không đổi; không cần quyết toán thời gian.
- **`recordDiscovery`** là hàm engine, **không phải lệnh**: command bus từ chối mọi kiểu lệnh tự khai báo hoàn thành (`recordDiscovery`, `completeTutorial`, `grantHabitatUnlock` → `invalid-command`). PR5 gọi hàm này sau khi engine tự kiểm điều kiện nhiệm vụ. Event `discoveryRecorded`.
- **Công cụ DEV**: `GameSession.devRecordDiscovery` và khung "Công cụ phát triển" chỉ chạy khi `import.meta.env.DEV`. Bản build production: thân hàm rỗng, khung không render, `recordDiscovery` bị loại khỏi bundle (đã kiểm bằng grep trên `dist/`). Test dùng fixture gọi trực tiếp hàm engine.

## Kiểm chứng
- `tests/unit/zones.test.ts`: luật mở khóa, ID sai, mở trùng, chưa đủ điều kiện, sai khám phá, zone khóa, miễn phí và không đổi capacity/ngân sách, bờ hồ không cần Droplet, thứ tự mở, không có lệnh tự khai báo, trạng thái cho UI, save → load giữ khám phá, validate từ chối ID lạ/trùng, chuyển sinh cảnh sau khi mở với vàng tính đúng, suitability Droplet, sức chứa.
- `tests/unit/persistence.test.ts`: schema hiện tại là 2, migration 1 → 2 trên fixture v1 thật, archive bản gốc, bí danh 3.
- Chromium 158 headless (Linux, Playwright): bản production không có công cụ DEV, hiện điều kiện mở và không có nút mở khi chưa đủ điều kiện, save mới là schema 2; bản dev server ghi nhận khám phá → mở đá ấm miễn phí → chuyển Emberling sang, vẫn 1/5 chỗ. **Windows + Chromium trên thiết bị thật: chưa kiểm thử.**
