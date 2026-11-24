# ADR 0012 — Tích hợp mỹ thuật vào Canvas renderer (G1)

Trạng thái: **Đề xuất — chờ tác giả duyệt**. Bổ sung ADR 0011 (Living World + renderer), ADR 0101–0103 (mỹ thuật). Áp dụng các quyết định còn mở mà tác giả đã chốt khi bàn giao dự án (24/11/2026). Không đổi kinh tế, di truyền, ID loài hay schema save.

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

## Cần tác giả quyết định
1. Duyệt cách hiển thị một microhabitat mỗi lần (khung 16:9) và chuyển cảnh trượt.
2. Tốc độ đi dạo chậm (≈ 25 px cảnh/s cho Adult, ≈ 38 s băng qua một cảnh) và hệ số vội 2,4 khi đi tới thức ăn.
3. Trên điện thoại dọc, cảnh 16:9 khá nhỏ (≈ 356 × 200 px CSS ở màn 390 px): giữ vừa chiều rộng, hay cho phép phóng to/cắt hai bên quanh rồng đang chọn?
