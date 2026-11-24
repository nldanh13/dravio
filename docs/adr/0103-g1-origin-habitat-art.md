# ADR 0103 — Tài nguyên môi trường Khởi Nguyên (G1 Art)

Trạng thái: **Đề xuất — chờ tác giả duyệt**. Bổ sung ADR 0005, 0101, 0102. Dựa trên ADR 0008/0009 của Game Engine (zone, mở khóa). Không đổi GameState, kinh tế, gene, sinh học, luật mở khóa hay sức chứa.

## Bối cảnh
- Nhiệm vụ C: ba microhabitat `origin_meadow`, `origin_pondbank`, `origin_warm_rocks`, mỗi nơi có background, ground, foreground, thảm thực vật, đá và vật thể, vị trí nghỉ, vị trí tương tác, hiệu ứng, trạng thái chưa khám phá; cùng một vùng địa lý; tách lớp cho renderer.
- `docs/g0/ART_DIRECTION.md`: bối cảnh đồng cỏ + bờ hồ + đá ấm, ánh sáng ngày/hoàng hôn/đêm, reduced motion.
- Game Engine: `HABITAT_PROFILES.perch = true` cho cả ba; mở đá ấm/bờ hồ bằng khám phá (ADR 0009); world graph đặt cửa ngõ Ocean ở bờ hồ, Sky ở đồng cỏ (ADR 0010, branch đang mở).

## Quyết định (đề xuất)
1. Một vùng Tây → Đông (bờ hồ | đồng cỏ | đá ấm), địa hình tính theo toạ độ toàn cục để ba cảnh ghép liền mép; khung 960×540.
2. Mỗi cảnh 5 lớp parallax (sky, far, mid, ground, foreground) + vật thể rời y-sort cùng rồng + dữ liệu vùng/spot/emitter trong `src/assets/habitats/origin/manifest.ts`.
3. Tỉ lệ rồng trong cảnh `DRAGON_SCENE_SCALE = 0.55` (Adult ≈ 132 px cảnh).
4. Spot là dữ liệu minh họa có `requires` theo vận động; perch chỉ cho loài bay, có `sortY`.
5. Ánh sáng ngày/hoàng hôn/đêm bằng hai lớp multiply (nền mạnh, cảnh nhẹ) để rồng vẫn đọc được ban đêm.
6. Chưa khám phá: khử bão hòa + sương + biển khám phá không chữ; biểu tượng ánh xạ từ `HABITAT_UNLOCK_RULES` (thermal/aquatic/generic).
7. Gợi ý thị giác cửa ngõ world graph (lạch/cửa sông ở bờ hồ, đảo trời trên đồng cỏ) chỉ là hình ảnh.

## Cần tác giả quyết định
1. Duyệt phong cách và bố cục ba sinh cảnh (xem `docs/art/origin-habitats-preview.html`).
2. Thứ tự địa lý Tây → Đông bờ hồ | đồng cỏ | đá ấm có phù hợp bản đồ dự kiến không?
3. Tỉ lệ rồng 0.55 (Adult ≈ 1/7 chiều rộng cảnh) có hợp không?
4. Giữ gợi ý cửa sông/đảo trời trong G1 (khi Ocean/Sky còn khóa) hay ẩn tới G2?
5. Đồng cỏ mở mặc định: có cần trạng thái "chưa khám phá" cho đồng cỏ (màn mở đầu) không, hay bỏ biển generic?

## Hệ quả
- Renderer của AI 1 dựng cảnh bằng manifest; luật đặt rồng/mở khóa vẫn ở engine.
- Thêm thời tiết/thiên tai (G2) = thêm lớp/emitter, không đổi cấu trúc.
