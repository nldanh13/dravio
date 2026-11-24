# Prototype mỹ thuật G0 — Emberling

## Mục tiêu và file

`assets/g0/emberling/` có 12 SVG riêng (baby/juvenile/adult × normal/crystal/golden/prismatic) và bảng preview SVG/PNG. Đây là hình thể vector nguyên mẫu tự tạo cho dự án; không dùng tài nguyên bên ngoài, không chứa asset bên thứ ba. Chưa là sprite animation production. Có thể thay đổi màu và hình thể trực tiếp trong SVG; không bắt buộc giữ mọi chi tiết mẫu.

- Cozy fantasy 2.5D, camera ngang hơi từ trên, silhouette đọc được ở 64–128px; đường viền bo tròn và màu pastel tương phản vừa phải. Emberling 4 chân, đuôi ngọn lửa Aether giả tưởng, không cánh; không bay.
- 3 stage: Baby 0.68 đầu lớn, không sừng; Juvenile 0.85 một sừng + gai nhỏ; Adult 1.0 hai sừng và gai lưng rõ. Anchor dưới chân; giữ khoảng trống tail/horn. Lật theo vận tốc ngang, không méo hình.
- Normal dùng palette loài; Crystal thêm cạnh sáng và hình thoi; Golden thêm quầng sáng hình vòng; Prismatic thêm gradient và vệt màu. Variant không được thay đổi anatomy, locomotion, genotype hay rarity. Bản mẫu cố định một genotype; production phải compositing pigment/pattern/eye độc lập với lớp phủ Aether, giữ dấu nhận biết phenotype và text label. Không dùng màu là tín hiệu duy nhất.
- Ánh sáng mềm; không máu me; chấn thương minh họa bằng tư thế nghỉ, ký hiệu chăm sóc và băng giả tưởng, không thay đổi permanent phenotype. Các silhouette và palette còn lại đã có ở BIOLOGY_CATALOG.

## Tiêu chuẩn thực hiện renderer G1

- Dùng Canvas 2D cache sprite, DPR cap 2, 30/60FPS, dt ≤100ms, không setState mỗi frame; behavior 1Hz jitter, steering 10–30Hz.
- Animation tối thiểu idle (thở nhẹ 2–3s), walk (chu kỳ 0.8–1.2s), eat (0.6s), rest, pet response (1s); blink ngẫu nhiên 3–5s từ cosmetic RNG riêng, không ảnh hưởng domain RNG. Baby/juvenile/adult không có animation bay cho Emberling. Asset mới phải có manifest; runtime chỉ lấy asset đã preload, không tải Internet.
- World bối cảnh đồng cỏ + bờ hồ + đá ấm, ánh sáng ngày/hoàng hôn/đêm. Âm thanh local, Web Audio resume sau tương tác, SFX/BGM tách. Reduced motion tắt gradient animation/particle mạnh, không tắt thông tin.
- Cổng G0: review 12 mẫu, nhận diện stage và variant ở 64/128px; tác giả xác nhận phong cách. Cổng G1: animation/state thực chạy, không dùng placeholder để tuyên bố art production hoàn tất.
