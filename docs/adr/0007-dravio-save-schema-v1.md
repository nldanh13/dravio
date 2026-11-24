# ADR 0007 — Dravio là tên duy nhất; Dravio Save Schema v1

Trạng thái: Chấp nhận 25/11/2026 theo đính chính của tác giả. Sửa đổi ADR 0006 mục 1, 5, 10. Nguồn: tin nhắn của tác giả ngày 25/11/2026; GDD 3.1 trang 18, 32 (đã cập nhật).

## Bối cảnh
GDD 3.1 có nhắc một tên dự án cũ trong giai đoạn thiết kế, một khóa save `..._save_v2` và một chuỗi migration v1 → v2 → v3. PR #5 đã dựng migration cho các định dạng đó dựa trên giả định. Tác giả xác nhận: tên cũ chỉ dùng khi thiết kế, **không có bản phát hành, không có dữ liệu người chơi hay file save nào cần tương thích**.

## Quyết định
1. **Dravio là tên duy nhất** trong mã nguồn, giao diện, cấu hình, package (`dravio`), storage (IndexedDB `dravio`/`saves`, Web Lock `dravio-save-writer`) và tài liệu đang có hiệu lực. Tên cũ chỉ còn trong lịch sử Git và mục "Lịch sử sửa đổi" của ADR 0006 / ADR này.
2. **Gỡ migration save tiền thân**: bỏ kiểu `LegacySaveV1/V2`, `migrateLegacy`, việc đọc khóa localStorage cũ và thông báo UI tương ứng. File không có envelope Dravio bị từ chối là `bad-format`.
3. **Dravio Save Schema v1** là phiên bản dữ liệu chính thức đầu tiên (`SCHEMA_VERSION = 1`). Cấu trúc `GameState` không đổi so với PR #5; chỉ số phiên bản đổi.
4. **Bảo toàn save phát triển đã có.** Bản build `main@3f466a6` (PR #5, chưa phát hành) đã có thể ghi save `schemaVersion: 3` vào IndexedDB của máy phát triển. Các save đó có state giống hệt v1 nên:
   - Số 3 là bí danh chưa phát hành của v1 (`PRE_RELEASE_SCHEMA_ALIASES`), được **dành riêng**: schema tương lai đi 1 → 2 → 4, không dùng lại 3.
   - Khi đọc, checksum được kiểm trên dữ liệu gốc, rồi state được gán `schemaVersion: 1` và validate đầy đủ.
   - Văn bản gốc được giữ nguyên trong `archive:schema-3` (ghi một lần, không bị xoay hay ghi đè) trước khi bản v1 thay main.
5. **Giữ nguyên** khung migration theo `schemaVersion` (bước thuần, tuần tự, có test), 2 backup xoay trong một transaction, checksum SHA-256, validate runtime, khôi phục khi hỏng, khóa chế độ chỉ đọc với save từ bản mới hơn, một người ghi.
6. **Windows + Chromium**: vẫn chưa kiểm thử trên thiết bị thật; chỉ báo đạt khi đã chạy trên máy thật và ghi cấu hình.

## Hệ quả
- Bước migration đầu tiên trong tương lai (v1 → v2) phải kèm fixture save v1 do Dravio ghi, test round-trip và kiểm archive.
- GDD 3.1 được sửa tại chỗ (trang 1, 18, 19, Phụ lục C.1, bảng đối chiếu quy tắc cũ); bản trước còn trong lịch sử Git.
