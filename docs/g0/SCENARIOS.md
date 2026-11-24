# Ba kịch bản G0 — acceptance fixture cho G1/G2

Mỗi fixture dùng clock/RNG tiêm được; không dùng Date.now/Math.random trong engine. Số giây test là thời gian mô phỏng, không cần chờ thật. Tên rồng chỉ là ví dụ. Các test mô tả dưới đây chưa chạy trên game.

## S01 — Quan sát, chăm sóc và lưu (G1)

**Mục tiêu:** Chứng minh cảm giác thế giới sống; đúng sinh học; không có áp lực offline.

- Given save mới lúc T0: 150 G, 1 Emberling baby XP=0 ở origin_meadow, production được chọn, seed cố định 101, Normal; Origin capacity=5. Sprout tutorial là kết quả cố định, mua Starter 100 G theo GDD, không tăng pity. Không nhận thưởng nở cho cá thể có sẵn; claim trứng tutorial mới nhận ACH_FIRST_HATCH 50 G một lần. Khi adult lần đầu nhận 100 G một lần.
- When chọn Emberling và thả 1 fruit đúng chỗ; thức ăn spawn nếu cách lần trước ≥800 ms, TTL 12 s. Khi ăn hợp lệ lần đầu: XP +8, bond +1, không thêm vàng ăn. Thả/ăn nhanh hơn ngưỡng phải không cấp XP trùng. Lệnh feed chỉ cấp thức ăn, event consume xác nhận va chạm từ engine, không tin client tự báo XP. Pet +1, cooldown 30s, tổng +10 bond/ngày UTC/rồng.
- When qua mốc 35% XP (105 s) → juvenile, 300 s → adult. Engine tách tích phân vàng tại mốc stage. Nếu không có feed/bonus, 105×0.025×0.4 +195×0.025×0.75 = 4.70625 G sản xuất trong 300s. Vàng microG giữ phần lẻ theo GDD, không dùng float làm save. Test stage riêng không cộng reward vào production.
- When chuyển tab 8 giờ sau khi Emberling Adult và không có job/care: 0.025×28800×0.75=540 G, XP không vượt max, không tạo hazard mới; modal >60s, receipt 1 lần. Reload và command requestId lặp không cộng lại. Save/load giữ UID/gene và stage dẫn xuất, không lưu tọa độ frame.
- When mở sinh cảnh (ADR 0009, miễn phí): đồng cỏ mở sẵn; TUT_04 ghi nhận khám phá `DISC_EMBERLING_THERMAL` → lệnh `unlockHabitat origin_warm_rocks`; TUT_06 ghi nhận `DISC_AQUATIC_HABITAT` → `unlockHabitat origin_pondbank` (không cần sở hữu Droplet). Vàng không đổi; Origin vẫn 5 chỗ, ngân sách sản xuất không đổi. Mở trùng, sai ID hoặc chưa có khám phá bị từ chối, không đổi state. Bỏ qua hướng dẫn vẫn có đường khám phá tương đương. UI không tự khai báo hoàn thành nhiệm vụ.
- Then ở scene rồng đi bộ, chớp mắt, nghỉ; không bay. Quan sát 5 phút không bắt buộc thao tác, âm thanh tùy chọn; export hộ chiếu PNG có nhãn offline (G1 cuối). Nếu người chơi muốn bỏ tutorial phải có thể xem lại. Test thực nghiệm: người chơi tự chỉ ra thức ăn đúng và rồng yêu thích, không cảm thấy phải trực game.

## S02 — Giông bão và chăm sóc (G1 fixture giản lược, G2 event đầy đủ)

**Mục tiêu:** hiểu nguyên nhân, chọn chăm sóc đúng, rồng không mất; không phát sinh thương tích offline.

- Given fixture tutorial riêng: rồng Zephyr Adult (không dùng rồng yêu thích), thuộc zone Origin với điểm đậu ở G1; G2 dùng sky_low_island. Seed 202, case ID tutorial cố định, trạm 2 chỗ. Mốc Forecast → Preparation → Active → Rescue → Recovery → Closed; trong G1 rút ngắn forecast qua nút bắt đầu bài tập, không bỏ quy tắc G2. Với thiên tai thật: dự báo 10 phút active World; tối đa 1 event mở, 2 case nhẹ/trung bình, cooldown 24h.
- When thiếu nơi trú trong tình huống mẫu, case `limb_wing` trung bình xuất hiện có chủ đích. Event thật roll risk một lần trên snapshot các cá thể đủ điều kiện, không reroll khi reload; nếu shelter protection=1 thì risk=0. Khi switch Zen/hide ở Forecast, không tiến Active; nếu Active đang chạy, tự đưa vào nơi trú hợp lệ và không sinh thêm case. Trạm đầy đưa về trú an toàn, FIFO queue, không bỏ ca.
- Then nhận định hiện triệu chứng game: cánh hạn chế vận động, mệt. `assessCase` trước `setCarePlan`, rồi `startCare`. Chọn nơi nghỉ phù hợp, bảo vệ cánh theo chỉ dẫn game, hỗ trợ dinh dưỡng; không dùng liều thuốc/thủ thuật thật. Phương án tập bay sớm không hợp lệ, chỉ giải thích, không gây tổn thương mới.
- Case nhẹ mặc định 20 phút (P0 phạm vi 15–30), trung bình 80 phút (phạm vi 60–120); plan đúng rút 25% tổng thời lượng → 15/60 phút. Phase 10/50/30/10% duration (ổn định/lành/phục hồi/tái hòa nhập); chia mốc ceil, phase cuối lấy phần còn lại, tiến độ monotonic. Nếu không có kế hoạch: auto stabilize, chờ quyết định, không xấu thêm; khi offline đã có plan thì tiếp tục, không auto claim. Mobility phục hồi tới 90 ở phase return, health ≥90, comfort ≥80; discharge khi hoàn tất và có habitat hợp lệ/còn chỗ. Nếu đầy chờ nơi an toàn. Đây là tham số gameplay mới, không phải y lệnh.
- Then không lai/bán/thám hiểm khi case mở; không sản xuất trong care; discharge hoàn tất mới gỡ restriction. Tutorial thưởng 50 G một lần (đề xuất), idempotent `caseId`; ca thiên tai thường P0 không thưởng vàng trực tiếp (tránh farm), ghi journal và phục hồi sinh cảnh. Không mất rồng hoặc đồ trả phí.
- Test: requestId lặp, 2 case đầy trạm, chuyển offline giữa phase, protection=1, severity out-of-range, thiếu habitat, released dragon không bị roll. Người chơi phải nhận ra bước đánh giá và theo dõi trước khi cho bay lại.

## S03 — Lai tạo và di truyền (G1 preview/fixture; G2 tổ ấp)

**Mục tiêu:** hiểu kiểu gen khác kiểu hình và phí đã biết trước; không reroll.

- Given hai Adult không họ hàng đã biết trong Origin, Emberling A `pigment Rr, pattern Pp, eye Bb`; Sprout B `rr, pp, bb`; nhóm T, Normal, đủ 80 G, health/mobility/comfort đạt ngưỡng, cooldown 0, một tổ rảnh; seed 303. Ancestry fixture có parentIds khác nhau và grandparentIds không trùng; không gán founder bịa.
- Preview loài: Common Emberling/Sprout mỗi 1/3; Rare Magma 1/3 (60/(60+30)=2/3, chia 2 Common). Epic Amberhorn bị loại vì hai Common. Các locus: pigment 50% Rr ấm/50% rr lạnh; pattern 50% Pp trung gian/50% pp trơn; eye 50% Bb hổ phách/50% bb lam. Ba locus độc lập; 8 tổ hợp genotype mỗi 1/8. Mutation ở L=0,b=0 là 85/11/3.5/0.5%, pity nếu 199 đảm bảo Prismatic. Preview không đổi RNG, không trừ tiền.
- When bắt đầu lai: trừ đúng 80 G một lần, lưu outcome, RNG, finishAt, parentIds, jobId trong transaction. Kiểm RNG seed thực tế của repo để xác định golden fixture; không tự bịa loài roll chính xác. Nếu kết quả Common duration 300s; Magma 900s; level0. Gõ cách ≥2s, tổng cap 30/90s tương ứng. Không bán/chuyển bố mẹ bận. Sau nở bố mẹ cooldown 600s; claim một con, G=max+1; nếu kho đầy đợi, không roll lại. Child placement kiểm sinh cảnh; Magma vào origin_warm_rocks hoặc khu trú an toàn.
- Negative cases: nhóm T×A; cùng UID; chung parent; chung grandparent; direct ancestor; released; đang care; health<80; thiếu tiền; tổ bận; input allele sai; clock lùi; reload sau thanh toán; pity + nghiên cứu (ưu tiên pity giữ nghiên cứu); tất cả rejected không tiêu vàng/RNG. Ancestry unknown được hiển thị; luật cấm dựa vào quan hệ đã biết.
- G1 chỉ cần preview chính xác + fixture outcome/read-only; lệnh start/claim hoàn chỉnh ở G2 theo ROADMAP, không đẩy toàn bộ genetics UI vào PR1.
