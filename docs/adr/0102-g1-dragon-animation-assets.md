# ADR 0102 — Tài nguyên hoạt ảnh rồng G1: flipbook tư thế + track transform

Trạng thái: **Chấp nhận** (24/11/2026, tác giả xác nhận cả 5 quyết định). Bổ sung ADR 0005, ADR 0101. Không đổi gene, anatomy, kinh tế, GameState; không thêm FSM/Behavior Engine.
Số hiệu: trước đây là ADR 0009 (trùng ADR 0009 của Game Engine). Đổi sang dải 01xx dành cho Art (`docs/adr/README.md`).

## Bối cảnh
- `docs/g0/ART_DIRECTION.md` yêu cầu idle 2–3 s, walk 0.8–1.2 s, eat 0.6 s, pet 1 s, nhấp nháy 3–5 s bằng RNG cosmetic; Canvas 2D cache sprite; không bay cho Emberling.
- Nhiệm vụ B yêu cầu 11 trạng thái, chỉ triển khai hoạt ảnh phù hợp vận động trong catalog sinh học.

## Quyết định
1. Clip = flipbook khung SVG đầy đủ (không bóng) + track transform quanh điểm neo + cue hiệu ứng. Dữ liệu ở `src/assets/animations/dragonAnimations.ts`; hàm lấy mẫu thuần, không đọc đồng hồ/RNG.
2. Clip có trường `requires` (walk/swim/fly); `resolveDragonClip` trả `null` khi `SPECIES_BIOLOGY.locomotion` không có khả năng đó. Chỉ Droplet bơi; chỉ Zephyr bay và hạ cánh; không loài đất nào bay.
3. Mỗi tư thế sinh đủ 4 biến thể Aether (không compositing Aether lúc chạy), giữ bất biến lớp kiểu hình của ADR 0101.
4. Emberling: không sửa file G0; khung dẫn xuất chỉ thay mắt/miệng; tư thế thiếu dùng fallback + track bù đến G3.
5. Hiệu ứng chấn thương là băng giả tưởng + lá chăm sóc, đánh dấu `informational` để giữ khi giảm chuyển động; không máu me.

## Tác giả xác nhận (24/11/2026)
1. ✅ **Phong cách**: duyệt tư thế, nhịp và phương pháp flipbook + transform làm prototype G1; giữ nguyên thời lượng 11 clip. Chất lượng thương mại và tư thế còn thiếu của Emberling hoàn thiện ở G3.
2. ✅ **Zephyr Baby** giữ độ cao tập bay 18 px; chỉ tập bay ngắn 1–2 s trong sinh cảnh hiện tại rồi hạ cánh; không dùng để di chuyển liên vùng; không bay khi có hạn chế sức khỏe. Ghi thành dữ liệu `flightRules.baby` trên clip `fly` (`flightRuleFor`); Behavior Engine thực thi.
3. ✅ **Độ cao bay** Baby/Juvenile/Adult = 18/40/56 px viewBox. Renderer nhân hệ số hiển thị, **không nhân stageScale lần hai** vào altitude. Bảo đảm bóng, hitbox, hạ cánh liên tục (`descend` + `altitudeAt`), giới hạn vùng vận động và không cắt sprite ở biên màn hình (`clipExtents`).
4. ✅ **Sproutling burrow** đưa vào lộ trình G2 (đề xuất clip 1.800 ms, hiệu ứng bụi đất, tư thế đào riêng); giữ `burrow` trong catalog; G1 không làm cơ chế hang hay tài nguyên.
5. ✅ **Dung lượng**: chấp nhận 444 khung SVG (~2,9 MB) cho G1; giữ SVG dựng sẵn, tải theo nhu cầu (mỗi SVG là file riêng, `?no-inline`, không nhúng vào bundle JS) và cache; chưa làm Aether compositing lúc chạy. Đánh giá lại khi mở rộng 16 loài, kiểu hình di truyền và tối ưu G3.

## Hệ quả
- Renderer chỉ cần `drawImage` + `setTransform`; FSM chọn trạng thái hợp lệ bằng `availableStates` và tôn trọng `flightRules`.
- Hợp đồng tích hợp cho Game/World Engine: `docs/art/DRAGON_ANIMATION.md` mục "Hợp đồng tích hợp".
- Thêm loài mới = thêm tư thế vào trình sinh; clip dùng lại.
