# ADR 0009 — Tài nguyên hoạt ảnh rồng G1: flipbook tư thế + track transform

Trạng thái: **Đề xuất — chờ tác giả duyệt**. Bổ sung ADR 0005, ADR 0008. Không đổi ID loài, gene, kinh tế; không thêm FSM/Behavior Engine.

## Bối cảnh
- `docs/g0/ART_DIRECTION.md` yêu cầu idle 2–3 s, walk 0.8–1.2 s, eat 0.6 s, pet 1 s, nhấp nháy 3–5 s bằng RNG cosmetic; Canvas 2D cache sprite; không bay cho Emberling.
- Nhiệm vụ B yêu cầu 11 trạng thái, chỉ triển khai hoạt ảnh phù hợp vận động trong catalog sinh học.

## Quyết định (đề xuất)
1. Clip = flipbook khung SVG đầy đủ (không bóng) + track transform quanh điểm neo + cue hiệu ứng. Dữ liệu ở `src/assets/animations/dragonAnimations.ts`; hàm lấy mẫu thuần, không đọc đồng hồ/RNG.
2. Clip có trường `requires` (walk/swim/fly); `resolveDragonClip` trả `null` khi `SPECIES_BIOLOGY.locomotion` không có khả năng đó. Kết quả: chỉ Droplet bơi; chỉ Zephyr bay và hạ cánh; không loài đất nào bay.
3. Mỗi tư thế sinh đủ 4 biến thể Aether (không compositing Aether lúc chạy), giữ bất biến lớp kiểu hình của ADR 0008.
4. Emberling: không sửa file G0; khung dẫn xuất chỉ thay mắt/miệng; tư thế thiếu dùng fallback + track bù đến G3.
5. Hiệu ứng chấn thương là băng giả tưởng + lá chăm sóc, được đánh dấu `informational` để giữ khi giảm chuyển động; không máu me.

## Cần tác giả quyết định
- Duyệt phong cách tư thế và nhịp hoạt ảnh (xem `docs/art/dragon-animations-preview.html`).
- Zephyr Baby bay thấp (18 px, kiểu "vỗ cánh tập bay") — catalog không giới hạn theo stage. Giữ, hay cấm Baby bay?
- Độ cao bay Juvenile 40 / Adult 56 px (viewBox) có phù hợp bố cục zone không?
- Sproutling có `burrow` nhưng không thuộc 11 trạng thái yêu cầu: có cần clip đào hang không?
- 444 khung ≈ 2.9 MB: chấp nhận, hay chuyển sang compositing Aether lúc chạy để giảm dung lượng?

## Hệ quả
- Renderer chỉ cần `drawImage` + `setTransform`; FSM chọn trạng thái hợp lệ bằng `availableStates`.
- Thêm loài mới = thêm tư thế vào trình sinh; clip dùng lại.
