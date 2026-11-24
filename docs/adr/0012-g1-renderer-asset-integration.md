# ADR 0012 — Tích hợp mỹ thuật vào Canvas renderer (G1)

Trạng thái: **Chấp nhận** (24/11/2026, tác giả xác nhận 3 điểm kèm yêu cầu bổ sung). Bổ sung ADR 0011 (Living World + renderer), ADR 0101–0103 (mỹ thuật). Áp dụng các quyết định còn mở mà tác giả đã chốt khi bàn giao dự án (24/11/2026). Không đổi kinh tế, di truyền, ID loài hay schema save.

## Bối cảnh
- Renderer PR4 (ADR 0011) dùng mặt đất xiên 1200 × 520 đơn vị, thứ tự đồng cỏ · đá ấm · bờ hồ, vật cản hình tròn, nền khối màu tạm và biến đổi thủ tục trên ảnh tĩnh.
- Tài nguyên Art (ADR 0101–0103) là 3 cảnh nhìn ngang 960 × 540 có parallax (Tây → Đông: bờ hồ · đồng cỏ · đá ấm), 444 khung hoạt ảnh + clip, 13 hiệu ứng, vùng đi/mặt hồ/vật thể đo theo hình.
- `docs/rendering/ASSET_CONTRACT.md` (v1) cho phép: "Nếu nền vẽ vật cản ở chỗ khác, cần cập nhật bố cục cùng lúc để luật va chạm khớp hình."

## Quyết định
1. **Toạ độ thế giới = toạ độ cảnh của mỹ thuật.** `originLayout.ts` dẫn xuất từ `src/assets/habitats/origin/geometry.json` + vị trí vật thể: x toàn cục 0–2880, y = điểm chạm đất trong cảnh, z = độ cao (px cảnh). Vùng đi là chữ nhật nằm trong `walkArea`; mặt hồ là polygon (`water`, chỉ loài bơi vào); vật cản là elip dẹt quanh chân vật thể đứng; vật thể phẳng không chặn.
2. **Một microhabitat mỗi lần**, khung 16:9 vừa chiều rộng (không cuộn ngang trên màn hình hẹp), điều hướng bằng tab/mũi tên; chuyển cảnh trượt 520 ms, lớp nền theo parallax của manifest (cảnh mới mờ dần vào), tắt khi reduced motion.
3. **Rồng vẽ bằng clip + khung SVG** (`dragonVisual.ts`); bỏ biến đổi thủ tục `poseOf` của PR4. Khung đã nướng tỉ lệ stage; chỉ dx/dy của track nhân stageScale × `DRAGON_SCENE_SCALE` (0,55); độ cao bay **không** nhân stageScale. Neo chân (120, 170) cho cả sprite tĩnh và khung (PR4 dùng 175 — tâm bóng — đã sửa).
4. **Tốc độ khớp sải bước** của clip (`stridePx`): đi dạo ≈ 0,85 × thời lượng clip mỗi chu kỳ (trong 0,8–1,2 s); đi tới thức ăn ×2,4 (thức ăn sống 12 s); pha clip theo quãng đường nên chân không trượt.
5. **Luật bay** (ADR 0102): độ cao 18/40/56 px viewBox × 0,55; cất cánh 300 ms; hạ cánh liên tục bằng clip `landing` (`altitudeAt` từ độ cao hiện tại); Zephyr Baby chỉ tập bay 1–2 s quanh chỗ đứng trong sinh cảnh hiện tại, nghỉ ≥ 4 s giữa hai lần, không cất cánh khi `healthRestricted` (PR6 nối với HealthCase).
6. **Hiệu ứng**: cue của clip sinh hạt tại attach point; hạt môi trường theo emitter của sinh cảnh và thời điểm; tối đa 80 hạt; RNG cosmetic riêng. Hiệu ứng `informational` (băng, lá chăm sóc) vẽ liên tục, kể cả reduced motion. Huy hiệu biến thể (dùng cho UI) bị cắt khỏi khung trong cảnh; biến thể vẫn nhận ra bằng lớp phủ + motif.
7. **Ánh sáng**: `timeMode` auto = đêm 20:00–06:00 giờ địa phương; thủ công day/sunset/night qua lệnh mới `updateSettings` (chỉ cài đặt hiển thị: timeMode, fpsLimit, reducedMotion; không quyết toán thời gian, không đổi vàng/rồng; event `settingsChanged`). Trường đã có trong `GameSettings` nên **không đổi schema save**.
8. **Tải theo nhu cầu**: mỗi SVG là file riêng (`?url&no-inline`); `ImageCache` tải khi cần, tải trước tài nguyên của cảnh đang/sắp xem và khung của rồng có mặt, giải phóng ảnh không dùng quá 30 s.
9. **Space cho ăn** (GDD Phụ lục G): chỉ khi tiêu điểm trong cảnh, phiên ở trạng thái `ready` (không chỉ đọc/xung đột), không đang nhập liệu, không giữ phím bổ trợ; thả ngẫu nhiên vào sinh cảnh đang xem.
10. Giữ nguyên: world graph Ocean ↔ Origin ↔ Sky (không cạnh Ocean ↔ Sky), ngưỡng 5 s của ADR 0010, năng lượng nghỉ/ngủ chỉ ở bộ nhớ (không vào save), cứu hộ bằng phương tiện thuộc G2.

## Hệ quả
- Test của PR4 được cập nhật theo bố cục mới (mọi bất biến cũ vẫn kiểm: trong biên, không vào nước/vật cản, chỉ loài bay mới bay, tất định theo seed, steering 20 Hz).
- `ASSET_CONTRACT.md` lên v2 (khung SVG + clip thay cho dải khung ngang; không bắt buộc sprite sheet).
- PR6 cần nối `LivingWorld.setCare` / `healthRestricted` với HealthCase.

## Tác giả xác nhận (24/11/2026) và phần bổ sung đã làm
1. ✅ **Một microhabitat mỗi lần**, trượt 520 ms, parallax, tab/mũi tên; reduced motion tắt trượt (chuyển tức thì). Camera chỉ đổi cách nhìn — không đổi vị trí, sinh học, hành vi hay sản xuất (test khóa). **Bổ sung:** số rồng ở từng sinh cảnh trên tab.
2. ✅ **Tốc độ** ≈ 25 px cảnh/s (Adult đi dạo), ×2,4 khi tìm thức ăn, theo loài/stage/sải bước. **Bổ sung:**
   - Trước `seekFood`: ước lượng **quãng đường thật** (`walkPathLength`: thẳng; nếu rồng không bơi và đường cắt mặt hồ thì vòng qua mép trên/dưới hồ trong vùng đi; không có đường → bỏ qua) chia tốc độ vội (hoặc bay nếu được phép) và so với **thời gian sống còn lại** của viên thức ăn trừ 1 s phản ứng (`FOOD_REACT_MARGIN_S`). Không kịp → không đi.
   - **Space** ưu tiên chỗ gần rồng phù hợp (`suggestDrop`: ăn được nhóm đang chọn, không ngủ/chăm sóc, hết cooldown; điểm đứng tới được trong ≤ 6 s); không có thì engine thả ngẫu nhiên như cũ.
   - TTL 12 s, cooldown 8 s, XP và kinh tế **không đổi**.
3. ✅ **Camera điện thoại** (`src/rendering/camera.ts`, thuần):
   - **Overview** 1× (mặc định) · **Focus** 2× bám rồng được chọn (chỉ khi bấm "Theo dõi rồng"; chọn rồng **không** tự zoom) · **Free** khi người chơi zoom/kéo.
   - Zoom 1–2,5× bằng chụm hai ngón, Ctrl + lăn chuột (chụm touchpad), nút ±; kéo một ngón khi đang zoom; nút "Tổng quan" về 1×.
   - Camera kẹp trong biên sinh cảnh; đổi sinh cảnh về Overview (giữ Focus nếu rồng đang theo dõi ở sinh cảnh mới).
   - Toạ độ màn hình ↔ thế giới qua cùng một phép biến đổi cho chọn rồng (hitbox), thả thức ăn và vẽ.
   - Phân biệt cử chỉ: chạm (≤ 10 px, ≤ 600 ms, một ngón) mới chọn/thả; kéo (> 10 px) chỉ dời camera khi đang zoom, ở 1× bỏ qua; ngón thứ hai biến cử chỉ thành chụm và huỷ chạm đến khi nhấc hết ngón. `touch-action`: `pan-y` ở 1× (trang vẫn cuộn), `none` khi đang zoom.
   - Không đổi GameState hay schema save.
4. Giới hạn giữ nguyên: Windows + Chromium trên thiết bị thật chưa kiểm thử; FPS headless không đại diện thiết bị thật; HealthCase/`healthRestricted` nối ở PR6.

## Kiểm chứng
- Unit: `tests/unit/canvasRenderer.test.ts` (camera: biên, zoom 1–2,5, ánh xạ màn hình ↔ thế giới khi zoom, zoom giữ điểm dưới con trỏ, chụm không thả thức ăn, kéo chỉ khi zoom, chạm khi zoom đúng toạ độ, hitbox khi zoom, Focus bám theo/không tự zoom khi chọn/về Overview khi rời sinh cảnh, letterbox), `tests/unit/livingWorld.test.ts` (đường vòng quanh hồ, bỏ qua thức ăn không kịp, gợi ý Space).
- E2E Chromium 158 headless (Linux): `docs/rendering/e2e/renderer-e2e.json` — chụm → 2,5×, 0 thức ăn; kéo khi zoom → camera dời, 0 thức ăn; chạm khi zoom → thức ăn rơi lệch < 0,3 px so với toạ độ tính toán; chọn rồng giữ 1×, "Theo dõi rồng" → Focus 2× đúng rồng; chuyển cảnh trượt khi bình thường, tức thì khi reduced motion; Space → thức ăn cách rồng ăn được 38 px.
