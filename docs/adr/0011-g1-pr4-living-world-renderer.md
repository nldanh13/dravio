# ADR 0011 — Living World và Canvas renderer cho Khu Khởi Nguyên

Trạng thái: Chấp nhận 25/11/2026 (G1 PR4 phần B). Nguồn: yêu cầu tác giả "DRAVIO — G1 PR4" mục B–D; GDD 3.1 trang 7 (hành vi), 16 (đồ họa), 17 (vòng lặp); `docs/g0/ART_DIRECTION.md`. Phụ thuộc ADR 0010.

## Kiến trúc (`src/rendering/`)
- **`livingWorld.ts`** là TypeScript thuần, không DOM. Mỗi rồng đặt trong Khu Khởi Nguyên là một agent hiển thị.
  - **FSM:** idle · wander · seekFood · eat · rest · sleep · pet. Quyết định khoảng 1 Hz, jitter ±300 ms; steering bước cố định 20 Hz. GDD yêu cầu quyết định 0,5–2 Hz và steering 10–30 Hz.
  - **Lựa chọn hành vi:** theo tính cách (tỉ lệ đi dạo playful 0,7 / curious 0,6 / calm 0,35 / shy 0,3), năng lượng hiển thị (thấp thì nghỉ, rất thấp thì ngủ), và giờ hoạt động của loài so với ngày/đêm.
  - **Đêm:** giờ địa phương 20–6 khi `timeMode = auto`, hoặc theo cài đặt.
- **Di chuyển theo giải phẫu** (`anatomy.locomotion`):
  - chỉ loài có `fly` mới cất cánh, và phải hạ xuống đất để ăn, nghỉ, ngủ (GDD: "rồng bay cần nơi đậu");
  - chỉ loài có `swim` mới vào mặt hồ;
  - loài đi bộ bị mặt hồ chặn như vật cản.
- **Steering** (`steering.ts`): arrive, tránh vật cản phía trước, lực giữ trong microhabitat, tách nhau. Sau mỗi bước có ràng buộc cứng: luôn trong biên và ngoài vật cản cấm.
- **Thức ăn:**
  1. Người chơi chạm mặt đất của sinh cảnh đã mở → gửi lệnh `feed`.
  2. Viên thức ăn hiển thị đúng chỗ chạm.
  3. Rồng đúng chế độ ăn, hết cooldown 8 s và tới được chỗ đó sẽ đi tới.
  4. Khi chạm → gửi lệnh `consumeFood`. Engine kiểm toàn bộ luật và cộng XP/bond; renderer không tự cộng gì.
  5. Lệnh bị từ chối → rồng bỏ qua viên đó 8 s.
- **`canvasRenderer.ts`:**
  - Vòng lặp:
    - `requestAnimationFrame` giới hạn 30/60 FPS theo `settings.fpsLimit`, dt chặn 100 ms;
    - tách khỏi tick kinh tế 1 Hz của `GameSession`;
    - dừng hẳn khi tab ẩn; chạy lại không bù thời gian.
  - Hiển thị:
    - High-DPI với DPR tối đa 2; theo dõi kích thước bằng ResizeObserver và `resize`;
    - chiếu 2.5D xiên (`projection.ts`), sắp xếp vẽ theo chiều sâu.
  - Tương tác và trợ năng:
    - Pointer Events (chuột, cảm ứng, bút): chạm là nhấn rồi nhả trong 600 ms và di chuyển ≤ 10 px; kéo/cuộn không bị tính là chạm;
    - reduced motion: theo `prefers-reduced-motion` hoặc cài đặt; tắt chuyển động trang trí nhưng vẫn giữ ký hiệu trạng thái.
  - `dispose()` gỡ mọi listener, ResizeObserver, media query và frame đang chờ.
- **`ui/WorldView.tsx`:**
  - canvas, chọn loại thức ăn, danh sách rồng dạng nút (dùng được bằng bàn phím);
  - bảng thông tin rồng: loài, stage, biến thể, sinh cảnh, bond, chế độ ăn; nút vuốt ve (lệnh `pet`) và đổi tên (lệnh `renameDragon`); Esc để bỏ chọn;
  - React chỉ render khi snapshot phiên đổi; renderer đọc cài đặt qua ref;
  - đồng bộ world qua microtask để lệnh gửi từ trong mô phỏng không đồng bộ lồng nhau.
- **Asset:** `assetContract.ts` và `assetAdapter.ts`, hợp đồng cho AI 2 tại `docs/rendering/ASSET_CONTRACT.md`. Thiếu asset thì vẽ dấu hiệu "?", không vẽ art thay thế.

## Bất biến
- Toạ độ, vận tốc, năng lượng, trạng thái FSM **chỉ nằm trong bộ nhớ**, không vào `GameState` hay save. E2E kiểm save không có khóa toạ độ.
- Không đổi engine, kinh tế, di truyền, schema. Diff của PR không chạm `src/engine`, `src/data`, `src/persistence`.
- Không `Math.random`: RNG cosmetic có seed theo rồng (`createRng(hashSeed(...))`), tách khỏi RNG domain. Mô phỏng tất định theo seed và không phụ thuộc tốc độ khung hình; có test.

## Điểm cần tác giả quyết định
1. **Nền sinh cảnh tạm thời** (khối phẳng có ghi chú) trong lúc chờ AI 2. Phương án khác là ẩn canvas cho tới khi có asset.
2. **Màn hình hẹp:** cảnh rộng tối thiểu 640 px CSS và cuộn ngang trong khung. Ở 360 px, rồng Adult chỉ khoảng 40 px nếu thu cả cảnh. Có thể đổi sang xem từng sinh cảnh.
3. **Ngày/đêm** theo giờ địa phương 20–6 chỉ ảnh hưởng hành vi ngủ. Chưa có ánh sáng ngày/hoàng hôn/đêm vì cần asset.
4. **Năng lượng hiển thị** (nghỉ/ngủ) là trạng thái cosmetic, không phải nhu cầu sinh học trong save. GDD: "nhu cầu bị thiếu chỉ ảnh hưởng hành vi nhẹ".
5. **Phím Space để cho ăn** (GDD trang 16) chưa làm vì cần chọn điểm thả; hiện chỉ có Esc để bỏ chọn.

## Kiểm chứng
- **Unit:** `tests/unit/livingWorld.test.ts` (11) và `tests/unit/canvasRenderer.test.ts` (8).
- **E2E:** Chromium 158 headless (Linux x64, Playwright); số đo ghi trong PR.
- **Windows + Chromium trên thiết bị thật: chưa kiểm thử.**
