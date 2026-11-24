# DRAVIO — G0 Decision Pack 1.0

**Ngày:** 24/11/2026 · **Áp dụng:** GDD 3.1 / ROADMAP G0–G1. Đây là phần bổ sung, không thay thế GDD 3.1. Tất cả nội dung cũ không mâu thuẫn tiếp tục có hiệu lực.

## Bàn giao

| Hạng mục G0 từ ROADMAP | Kết quả | Trạng thái |
|---|---|---|
| Khung dự án + pure engine | Đã kiểm tra README, package và một số module repo | Có theo repo, chưa chạy suite repo |
| Anatomy/ngưỡng sinh cảnh | 16 loài, 7 microhabitat, diet, nhiệt, độ mặn/độ sâu/độ cao, resilience, palette; TS + JSON + 235 assertions | Thiết kế + module độc lập đã kiểm thử; chưa merge |
| ADR 0002 | 6 câu trả lời + quyết định bổ sung | Có tài liệu ADR 0003 |
| Prototype mỹ thuật | 12 SVG Emberling, sheet PNG, art direction | Prototype có thật; cần review style/animation |
| 3 scenario | Observation, Rescue, Genetics, Given–When–Then + edge cases | Đặc tả test; chưa chạy gameplay |
| Thiết bị test và ngân sách | Lớp máy, viewport, ngưỡng, trần 2 triệu G0–G1 | Quyết định đề xuất; thiết bị thực và chi tiêu cần xác nhận |

## Nguồn sự thật và thứ tự ưu tiên

1. GDD 3.1 toàn bộ 32 trang, ưu tiên phần chính và phụ lục theo quy tắc trang 32.
2. `docs/adr/0003-g0-decisions.md` cụ thể hóa các điểm bỏ ngỏ (không thay giá, gene, ID, cấu trúc cũ ngoài quyết định ghi rõ).
3. `src/data/g0Biology.ts` là dữ liệu biology canonical sau khi tích hợp; `docs/g0/BIOLOGY_CATALOG.json` là snapshot đọc máy và `.md` là bản đọc người. Không duy trì hai nguồn runtime.
4. `docs/g0/SCENARIOS.md`, `ART_DIRECTION.md`, `QA_BUDGET.md` là tiêu chí nghiệm thu; `AI_HANDOFF.md` là prompt cho lượt lập trình tiếp.

## Địa lý và các nguyên tắc sinh học đã quyết định

Ba zone: `origin` (land), `ocean` (ocean), `sky` (sky). Mỗi zone mở có 5 chỗ vật lý P0; 7 microhabitat là loại môi trường/cấu hình trong zone, **không phải bảy vùng tăng sức chứa**. Slot rồng lưu zoneId và habitatId qua schema được version hóa. Origin có meadow, pondbank, warm_rocks; Ocean có estuary, reef, cool_pool; Sky có low_island. Ở G1 chỉ Origin mở, meadow ban đầu, pondbank và warm_rocks qua hướng dẫn/khám phá; Zephyr có thể đi/đậu ở meadow. G2 mở đủ 3 zone. Đồ trang trí không nhân vàng.

- Bảng nhiệt dùng `cold/cool/mild/warm/hot`, độ mặn `none/fresh/brackish/marine`, độ sâu `none/shallow/deep`, độ cao `ground/low/high`; đây là đơn vị gameplay, không diễn giải là giới hạn sinh lý thực của động vật. Deep và high dành mở rộng, không thể tự bố trí P0.
- Hô hấp, vận động, nhiệt, profile, nước mặn, độ sâu, độ cao và điểm đậu là hard gates. `suitability = clamp(100 − sum(ceil(max(0, comfortMin−actual))),0,100)` trên yếu tố liên quan; ≥80 phù hợp, 50–79 cho bố trí có cảnh báo, <50 không cho bố trí lâu dài. Không hợp sinh học luôn score 0, không bù bằng vàng/bond. Không gây thương tích chỉ vì thiếu chất lượng; auto shelter phù hợp khi nguy hiểm, nếu chưa mở sinh cảnh thì safe sanctuary phi sản xuất. Quality 0–100 hữu hạn; validate schema cả input enum và ID ở command boundary.
- Luồng graph P0: Origin↔Ocean qua cửa sông; Origin↔Sky qua sân đáp thấp. Rồng A bơi ở cửa sông khi phù hợp, V bay tới Sky; walk ở Origin; phương tiện vận chuyển/cứu hộ là ngoại lệ nhưng đích vẫn kiểm habitat. Không teleporter qua hard gates. Không mô phỏng tất cả vùng frame-by-frame.
- Food: `fruit` (quả/hạt), `leaf` (lá), `aquatic` (thức ăn thủy sinh), `aether` (viên năng lượng giả tưởng). Tất cả thức ăn cơ bản miễn phí, không thêm premium; không tự đổi diet theo rarity. Khi thả chọn loại phù hợp hoặc auto chọn từ cá thể, một viên một mục tiêu hợp lệ; 0.8s giữa spawn, TTL 12s, XP tối đa mỗi 8s/rồng. Nhu cầu thấp chỉ đổi hành vi, không bệnh do offline.
- Resilience được cung cấp theo hazard cụ thể; risk dùng severity, exposure, resiliencePct/100, protection. Đề xuất mặc định severity nhẹ=0.30, trung bình=0.60; exposure 1 nếu vùng tác động, 0 nếu ngoài vùng; shelter đầy đủ protection=1, dự phòng một phần 0.5, không trú 0. Ưu tiên nơi trú thích hợp, thứ tự stable theo UID, roll một lần cho mỗi eventId/dragonId; nếu >2 ca chọn theo risk giảm dần rồi UID. Các giả thuyết này phải cân bằng G3.

## Cách dùng

Giải nén vào thư mục tạm, đọc `AI_HANDOFF.md`; đưa từng file vào đúng đường dẫn repo bằng PR, không chép đè repo/GDD. `tests/g0/biology.smoke.ts` là smoke standalone, không tự nhận là Vitest; chuyển thành suite Vitest tại `tests/unit/` khi tích hợp. Không chạy npm scripts giả, không tự merge main. Không có backend hoặc SDK mới trong pack này.

### Nguồn đã đọc trực tiếp

- GDD 3.1 PDF 32 trang và Dravio_ROADMAP.md do tác giả gửi.
- https://github.com/nldanh13/dravio/blob/main/docs/adr/0002-open-questions-g0.md
- https://github.com/nldanh13/dravio/blob/main/src/types/game.ts
- https://github.com/nldanh13/dravio/blob/main/src/data/dragons.ts
- https://github.com/nldanh13/dravio/blob/main/src/engine/genetics/breeding.ts
- https://github.com/nldanh13/dravio/blob/main/src/engine/economy/mutation.ts
- https://github.com/nldanh13/dravio/blob/main/src/data/breeding.ts
- https://github.com/nldanh13/dravio/blob/main/package.json
- https://github.com/nldanh13/dravio/blob/main/README.md
- https://github.com/nldanh13/dravio/blob/main/docs/ROADMAP.md

## Giới hạn

Chưa sửa repo trực tiếp, chưa chạy full repo CI, chưa chạy gameplay/kinh tế/native. Không xác nhận quyền sở hữu phần cứng, chi phí thực hoặc phê duyệt art. Các ngưỡng fantasy được đề xuất cho G0 và cần kiểm thử, không phải kết luận khoa học/thú y. Không đánh dấu G0 tích hợp xong trước khi merge dữ liệu, test, review art và xác nhận ngân sách. Kết quả độc lập trong TEST_REPORT.txt.
