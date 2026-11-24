# ADR 0003 — Quyết định G0 cho Dravio

Trạng thái: Baseline thiết kế đề xuất để triển khai G1; tác giả đã yêu cầu giải quyết G0. Không phải xác nhận mã nguồn đã merge hoặc playtest đã đạt.
Nguồn: GDD 3.1 trang 4–12, 15–18, 21–23, 26–32; ROADMAP; ADR 0002 và mã nguồn main đọc ngày 24/11/2026.

## Sáu câu hỏi của ADR 0002

| # | Quyết định | Kiểm thử |
|---|---|---|
| 1 | Phí theo rarity cao nhất của bố mẹ: C/R/E/L = 80/350/1500/5000 G, biết trước khi roll. | Common + Rare cùng nhóm = 350 G, preview không tiêu RNG. |
| 2 | Con dùng trọng số C/R/E/L 60/30/9/1; bỏ nhóm rỗng, chuẩn hóa, chia đều loài trong nhóm. | Emberling × Sprout: Emberling 1/3, Sprout 1/3, Magma 1/3; không Epic. |
| 3 | Dùng SPECIES_BIOLOGY theo ID, không suy từ group/realm; draft=false sau tích hợp và test. | 16 ID khớp, mỗi loài ít nhất 1 habitat hợp lệ; Frostfin không bay, Leviathan không lên đất. |
| 4 | Giữ grandparentIds; truy từ parentIds và hồ sơ phả hệ lưu dài hạn; thiếu thì ancestry unknown, không đoán. | Cấm cùng UID, trực hệ đã biết đến ông bà, chung cha/mẹ hoặc chung ông bà; thiếu dữ liệu không tự gán. |
| 5 | ID sprout; EN Sproutling; VI Mộc Long Mầm. Không đổi ID save. | Key VI/EN khớp; migration giữ UID và speciesId. |
| 6 | Giữ mutationDistribution: w=1+0.25L; q=min(0.60,15w/(85+15w)+0.08b); Normal=1−q, hiếm chia 11:3.5:0.5. | L=0,b=0 → 85/11/3.5/0.5%; pityCount=199 → Prismatic và 0. |

## Những quyết định bổ sung để tránh mơ hồ

- Loài con được chọn bằng recipe giả tưởng GDD; genotype P0 gồm pigment R/r, pattern P/p, eye B/b, mỗi locus một allele từ mỗi bố mẹ. Mỗi founder allele 50%, seed ổn định; phenotype dẫn xuất, không random lần hai. Mutation Aether không sửa allele. Không thêm allele hô hấp/chi/cánh trong P0.
- Chọn cặp cùng nhóm T/A/V, Adult, activity idle, cooldown xong, không care, không released, không shelter khẩn cấp; không có HealthCase đang mở; health ≥80, mobility ≥80, comfort ≥60 và không có cờ hạn chế sinh sản. Các ngưỡng 0–100 này là gameplay mới. Kho an toàn có thể lai nếu đáp ứng toàn bộ điều kiện; shelter khẩn cấp không được lai. Rồng locked vẫn được lai (locked chỉ chống bán/chuyển giao). Check sức khỏe phải dùng state chính, không tạo thêm bản sao state.
- Khi lai, reserve một chỗ kho/trứng, kiểm phí và điều kiện, roll một lần, commit atomic cùng RNG và requestId; từ chối không mất vàng/không tiêu RNG. Tổ 1 slot, duration theo rarity con 5/15/60/180 phút, ceil(baseSec × (1−0.1×level)); gõ mỗi ≥2s giảm tối đa 3s, tổng ≤10% duration sau nâng cấp; mobile rewarded giảm 25% remaining một lần, không có DEV reward ở production. Khi hoàn tất ấp, bố mẹ được giải phóng và cooldown 10 phút, kể cả trứng chờ nhận do kho đầy. Claim chỉ một UID.
- Phả hệ: G1 founder, con max generation+1; giữ ancestry node sau bán/thả; không sửa parentIds/genotype. grandparentIds là cache dẫn xuất từ hồ sơ đã biết; không coi null là "không có họ hàng"; cảnh báo ancestry unknown ở UI. P0 chặn trực hệ đến ông bà, chung cha/mẹ hoặc chung ông bà theo GDD; không mở rộng kiểm tra họ hàng vô hạn. P1/P2 xác thực server riêng.
- G1 dùng một zone Origin với 3 microhabitat; 4 Common có thể xuất hiện theo nhiệm vụ nhưng chỉ Emberling + Sprout ở khởi đầu. Droplet vào bờ hồ, Zephyr vào đồng cỏ có điểm đậu; không mở ocean/sky trước G2, không cho rồng đất bay. Không thay đổi sức chứa 5 của Origin.
- GDD p4 nói mở vùng 15–60 phút: G1 chỉ mở pocket và preview bản đồ, G2 mở ocean/sky thực. Các mốc thời gian là mục tiêu playtest, không cấp vàng bù vô hạn. GDD p5 và p30: 5 chỗ mỗi zone; capacity upgrade chỉ tăng ngân sách sản xuất toàn cục (5+2L, max25), không tự tăng chỗ vật lý trong P0.
- GDD p9: dự báo tích 10 phút *World foreground active*, tạm dừng khi hide/Zen/Companion. Khi mất focus trong Active, chuyển an toàn, không roll thêm thương tích; case đã có giữ lại. Không dùng clock offline để sinh thiên tai. G0 chọn kiểm hazard mỗi 60 phút World foreground, 20% cơ hội nếu không event mở và đủ cooldown 24h; một seed riêng, tutorial độc lập. Đây là giả thuyết để cân bằng G3.
- Các quyết định G0 không thay đổi giá, tỷ lệ pack, bonus, achievement, offline 75%/24h, save migration và ID hiện có trong GDD 3.1. Nếu mâu thuẫn mới phải ghi ADR, test và không sửa ngầm.
