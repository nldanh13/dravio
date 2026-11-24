# ADR 0006 — Persistence, backup, import/export, migration (G1 PR2)

Trạng thái: Chấp nhận cho G1 PR2. Nguồn: GDD 3.1 trang 18 (save, autosave, backup), trang 32 (migration Tendorya → Dravio), Phụ lục C.1–C.3; `docs/g0/AI_HANDOFF.md` mục G1 PR2; ADR 0003, 0004.

## Quyết định

1. **Định dạng file v3** (`src/persistence/schema.ts`): envelope `{ format: "dravio-save", schemaVersion: 3, contentVersion, savedAtMs, revision, checksum, state }`. `checksum` = SHA-256 (hex, Web Crypto) của JSON chuẩn hóa (khóa sắp xếp, bỏ `undefined`) của `state`. Checksum phát hiện file hỏng/bị sửa tay, **không phải chữ ký**: ai cũng tính lại được, nên import vẫn bị lọc (mục 6).
2. **Không lưu dữ liệu tạm.** `food.drops` và `food.lastSpawnAtMs` bị xóa khi lưu (ADR 0004 #10). Tọa độ frame, kiểu hình, stage, tốc độ vàng vốn không có trong `GameState`.
3. **Kho IndexedDB** (`src/persistence/store.ts`): database `dravio`, object store `saves`, 3 khóa `main`, `backup1`, `backup2`, giá trị là chuỗi JSON envelope. Mỗi lần lưu xoay `main → backup1 → backup2` và ghi `main` mới **trong một transaction readwrite** (`durability: "strict"`), nên không có trạng thái nửa vời. Nếu IndexedDB không mở được (chế độ riêng tư, bị chặn), dùng kho bộ nhớ và UI cảnh báo rõ "không bền, hãy xuất file".
4. **Đọc save** (`SaveManager.load`): thử `main → backup1 → backup2`; mỗi slot phải qua JSON, checksum, đúng `schemaVersion`, `validateGameState`. Slot hỏng được báo trong UI (slot + lý do). Mọi slot đều hỏng → `unrecoverable`: **không tự ghi đè**; người chơi chọn nhập file hoặc "bắt đầu lại", khi đó save hỏng bị đẩy xuống `backup1`.
5. **Save từ bản mới hơn** (`schemaVersion > 3`): dừng ngay, không fallback sang backup, khóa ghi cho cả phiên, kể cả `force`. Tránh việc quay về bản cũ làm mất tiến trình của bản mới.
6. **Import không bao giờ nhập entitlement/Verified** (GDD trang 18, 32; AI_HANDOFF): sau khi kiểm, state đi qua danh sách trắng khóa `GameState` và khóa `DragonInstance`; `registryRef` và mọi khóa lạ (`entitlements`, `purchases`, `verified`…) bị bỏ và được đếm trong bản xem trước. Import hai bước: `prepareImport` (không đổi kho, trả xem trước: thời điểm lưu, vàng, số rồng/loài, migrate từ đâu, số điều chỉnh) → người chơi xác nhận → save hiện tại được ghi trước (thành `backup1`), rồi save nhập thành `main`. File > 5 MB bị từ chối.
7. **Autosave** mỗi 30 s (timer tiêm được) và flush khi `visibilitychange → hidden` hoặc `pagehide`. Bỏ qua nếu `saveId` + `revision` không đổi. Các lần lưu được xếp hàng tuần tự trong `SaveManager`. Lưu lỗi không làm hỏng state, UI báo và lần autosave sau thử lại. Trong lúc thay save bằng file import, tick và autosave tạm dừng để không ghi đè save mới.
8. **Một người ghi**: Web Locks API, khóa `dravio-save-writer` (`ifAvailable`) giữ suốt vòng đời tab. Tab không lấy được khóa chỉ xem: không chạy thời gian, không lưu, không import. Trình duyệt không có Web Locks → tab tự coi là người ghi và UI khuyên không mở nhiều tab (Chromium/Edge/Firefox/Safari hiện đại đều có Web Locks). `GameSession` được tạo ngoài React để StrictMode không mở hai phiên.
9. **Thời gian khi mở lại.** Sau khi load, engine chạy `advanceTime` mode `offline` (75 %, chặn 24 h, high-water mark, ADR 0004) rồi mới chạy online mỗi giây. Lớp `platform` là nơi duy nhất đọc đồng hồ hệ thống (`systemClock`) và `crypto.randomUUID()` (requestId, saveId); engine vẫn chỉ nhận `Clock`/`Rng` tiêm vào.
10. **Migration v1 → v2 → v3** (`src/persistence/migrations.ts`):
    - Nguồn save cũ: `localStorage["tendorya_save_v2"]`, chỉ đọc khi IndexedDB trống; **không xóa** nguồn cũ.
    - v1 → v2: `xp` (giây) → `xpMs` (mili-giây).
    - v2 → v3: giữ UID, `speciesId`, biến thể, tên (chuẩn hóa theo luật đặt tên; tên sai bị bỏ có cảnh báo), khóa. Genotype founder từ UID + `contentVersion`, tính cách từ hash UID (tất định), `ancestry: "unknown"`, thế hệ 1, không có `registryRef`/Verified.
    - `island` → Origin ở microhabitat đã mở mà loài sống được (G1 chỉ mở `origin_meadow`) nếu còn chỗ (5); ngược lại vào kho an toàn (không sản xuất), có cảnh báo. `storage` giữ nguyên.
    - Vàng G → microG làm tròn xuống. Nâng cấp vượt trần bị chặn ở trần, có cảnh báo. XP chặn ở mức Adult. Pity ngoài 0–199 về 0.
    - Loài không có trong catalog, UID trùng, số không hợp lệ → **từ chối migrate**, không đoán.

## Giả định cần xác nhận
- Repo không có file save Tendorya v1/v2 thật. Hình dạng `LegacySaveV1/V2` dựng từ mô tả GDD trang 32 (location `island`/`storage`, `xp`/`xpMs`, key save v2). Trước khi phát hành phải chạy migration trên save thật; nếu khác, sửa `migrations.ts` + test, không sửa engine.
- Save cũ không có `hatchedAt` → dùng `lastSavedAt`; không có tính cách → hash UID.

## Kiểm chứng
- `tests/unit/persistence.test.ts` (29 test): checksum, phát hiện sửa/hỏng/phiên bản mới, migration (tất định, chặn dữ liệu sai, tràn sức chứa), xoay 2 backup, fallback, chặn ghi, one writer, import lọc entitlement, autosave.
- Chromium thật (Playwright 1.63, Chromium 158.0.8127.36 headless, Linux x64, trên bản build `vite preview`): 14/14 kiểm tra đạt — tạo save mới vào IndexedDB, autosave sau 30 s (đồng hồ giả của Playwright) xoay backup, tab thứ hai chỉ xem và không ghi, ẩn tab flush, export có checksum đúng, main hỏng → khôi phục backup1, import có xem trước và lọc `entitlements`/`registryRef`, file bị sửa bị từ chối, save bản mới không bị ghi đè, save Tendorya v2 trong localStorage được migrate và nhận thu nhập offline. Đây là Chromium headless trên Linux trong môi trường CI, **chưa phải** Windows + Chromium thật (QA_BUDGET.md).

## Ngoài phạm vi PR2
- Nhận bonus offline (`claimOfflineBonus`, PR5), đồng bộ cloud/Connect (P1), entitlement thật (G5+).
- Lưu nhiều profile/slot do người chơi chọn.
