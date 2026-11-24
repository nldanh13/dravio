# ADR 0006 — Persistence, backup, import/export, migration (G1 PR2)

Trạng thái: Chấp nhận cho G1 PR2; sửa đổi 25/11/2026 theo ADR 0007 (Dravio Save Schema v1, bỏ migration save tiền thân). Nguồn: GDD 3.1 trang 18 (save, autosave, backup), Phụ lục C.1–C.3; `docs/g0/AI_HANDOFF.md` mục G1 PR2; ADR 0003, 0004.

## Quyết định

1. **Dravio Save Schema v1** (`src/persistence/schema.ts`, `SCHEMA_VERSION = 1`): envelope `{ format: "dravio-save", schemaVersion: 1, contentVersion, savedAtMs, revision, checksum, state }`; `state.schemaVersion` phải trùng envelope. `checksum` = SHA-256 (hex, Web Crypto) của JSON chuẩn hóa (khóa sắp xếp, bỏ `undefined`) của `state`. Checksum phát hiện file hỏng/bị sửa tay, **không phải chữ ký**: ai cũng tính lại được, nên import vẫn bị lọc (mục 6).
2. **Không lưu dữ liệu tạm.** `food.drops` và `food.lastSpawnAtMs` bị xóa khi lưu (ADR 0004 #10). Tọa độ frame, kiểu hình, stage, tốc độ vàng vốn không có trong `GameState`.
3. **Kho IndexedDB** (`src/persistence/store.ts`): database `dravio`, object store `saves`, 3 khóa `main`, `backup1`, `backup2`, giá trị là chuỗi JSON envelope. Mỗi lần lưu xoay `main → backup1 → backup2` và ghi `main` mới **trong một transaction readwrite** (`durability: "strict"`), nên không có trạng thái nửa vời. Nếu IndexedDB không mở được (chế độ riêng tư, bị chặn), dùng kho bộ nhớ và UI cảnh báo rõ "không bền, hãy xuất file".
4. **Đọc save** (`SaveManager.load`): thử `main → backup1 → backup2`; mỗi slot phải qua JSON, checksum, đúng `schemaVersion`, `validateGameState`. Slot hỏng được báo trong UI (slot + lý do). Mọi slot đều hỏng → `unrecoverable`: **không tự ghi đè**; người chơi chọn nhập file hoặc "bắt đầu lại", khi đó save hỏng bị đẩy xuống `backup1`.
5. **Save từ bản mới hơn** (`schemaVersion` lớn hơn bản đang chạy, trừ số dành riêng ở mục 10): dừng ngay, không fallback sang backup, khóa ghi cho cả phiên, kể cả `force`. Tránh việc quay về bản cũ làm mất tiến trình của bản mới.
6. **Import không bao giờ nhập entitlement/Verified** (GDD trang 18, 32; AI_HANDOFF): sau khi kiểm, state đi qua danh sách trắng khóa `GameState` và khóa `DragonInstance`; `registryRef` và mọi khóa lạ (`entitlements`, `purchases`, `verified`…) bị bỏ và được đếm trong bản xem trước. Import hai bước: `prepareImport` (không đổi kho, trả xem trước: thời điểm lưu, vàng, số rồng/loài, migrate từ đâu, số điều chỉnh) → người chơi xác nhận → save hiện tại được ghi trước (thành `backup1`), rồi save nhập thành `main`. File > 5 MB bị từ chối.
7. **Autosave** mỗi 30 s (timer tiêm được) và flush khi `visibilitychange → hidden` hoặc `pagehide`. Bỏ qua nếu `saveId` + `revision` không đổi. Các lần lưu được xếp hàng tuần tự trong `SaveManager`. Lưu lỗi không làm hỏng state, UI báo và lần autosave sau thử lại. Trong lúc thay save bằng file import, tick và autosave tạm dừng để không ghi đè save mới.
8. **Một người ghi**: Web Locks API, khóa `dravio-save-writer` (`ifAvailable`) giữ suốt vòng đời tab. Tab không lấy được khóa chỉ xem: không chạy thời gian, không lưu, không import. Trình duyệt không có Web Locks → tab tự coi là người ghi và UI khuyên không mở nhiều tab (Chromium/Edge/Firefox/Safari hiện đại đều có Web Locks). `GameSession` được tạo ngoài React để StrictMode không mở hai phiên.
9. **Thời gian khi mở lại.** Sau khi load, engine chạy `advanceTime` mode `offline` (75 %, chặn 24 h, high-water mark, ADR 0004) rồi mới chạy online mỗi giây. Lớp `platform` là nơi duy nhất đọc đồng hồ hệ thống (`systemClock`) và `crypto.randomUUID()` (requestId, saveId); engine vẫn chỉ nhận `Clock`/`Rng` tiêm vào.
10. **Migration theo `schemaVersion`** (`src/persistence/migrations.ts`, ADR 0007):
    - Checksum được kiểm trên state đúng như đã ghi, rồi mới migrate, rồi `validateGameState`.
    - `MIGRATION_STEPS` là danh sách bước thuần `{ from, to, run }`; ở v1 danh sách rỗng. Thiếu bước → `unsupported-version`; bước ném lỗi → `migration-failed`; save không bao giờ bị sửa khi migrate thất bại.
    - Trước khi ghi bản đã migrate, save gốc được giữ nguyên văn trong khóa `archive:schema-<N>` của cùng object store, ghi trong cùng transaction với lần lưu đầu tiên và không bao giờ bị xoay hay ghi đè.
    - Bản phát triển chưa phát hành (commit `3f466a6`) đã ghi `schemaVersion: 3` với state giống hệt v1; số 3 được coi là bí danh của v1 và **dành riêng**, schema tương lai đi 1 → 2 → 4.
    - Không có save tiền thân nào cần chuyển đổi; object không có envelope Dravio bị từ chối (`bad-format`), không đoán.

## Lịch sử sửa đổi
- 24/11/2026 (PR #5): bản đầu có migration v1 → v2 → v3 từ save tiền thân giả định và đọc một khóa localStorage cũ.
- 25/11/2026 (ADR 0009): Schema hiện tại là v2; bước `1 → 2` thêm `discoveries`, save gốc lưu trong `archive:schema-1`.
- 25/11/2026 (ADR 0007): tác giả đính chính rằng không có bản phát hành hay save tiền thân; phần đó bị gỡ, schema chính thức đầu tiên là Dravio Save Schema v1. Nội dung cũ còn trong lịch sử Git.

## Giả định cần xác nhận
- Không còn giả định về định dạng save bên ngoài. Bước migration đầu tiên (v1 → v2) phải kèm fixture save v1 thật do Dravio ghi.

## Kiểm chứng
- `tests/unit/persistence.test.ts` (29 test): checksum, phát hiện sửa/hỏng/phiên bản mới, khung migration (bước tuần tự, thiếu bước, bước lỗi, bí danh schema 3), save gốc được giữ trong archive sau nhiều lần xoay, xoay 2 backup, fallback, chặn ghi, one writer, import lọc entitlement, autosave.
- Chromium thật (Playwright 1.63, Chromium 158.0.8127.36 headless, Linux x64, trên bản build `vite preview`), chạy lại 25/11/2026: 15/15 kiểm tra đạt — tạo save mới vào IndexedDB, autosave sau 30 s (đồng hồ giả của Playwright) xoay backup, tab thứ hai chỉ xem và không ghi, ẩn tab flush, export có checksum đúng, main hỏng → khôi phục backup1, import có xem trước và lọc `entitlements`/`registryRef`, file bị sửa bị từ chối, save bản mới không bị ghi đè, save phát triển schema 3 được giữ nguyên văn trong `archive:schema-3` và nâng lên schema 1, không dùng localStorage.
- **Windows + Chromium trên thiết bị thật: chưa kiểm thử.** Kết quả trên là Chromium headless trên Linux, không thay thế kiểm thử thiết bị theo QA_BUDGET.md.

## Ngoài phạm vi PR2
- Nhận bonus offline (`claimOfflineBonus`, PR5), đồng bộ cloud/Connect (P1), entitlement thật (G5+).
- Lưu nhiều profile/slot do người chơi chọn.
