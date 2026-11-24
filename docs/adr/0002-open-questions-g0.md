# ADR 0002 — Diễn giải tạm cho các điểm GDD chưa rõ (G0)

Trạng thái: **Superseded by [ADR 0003](0003-g0-decisions.md)** (24/11/2026). Giữ lại làm lịch sử; mọi câu trả lời chính thức nằm trong ADR 0003.

| # | Điểm chưa rõ | Diễn giải tạm trong code | Vị trí |
| --- | --- | --- | --- |
| 1 | "Phí theo độ hiếm cao nhất" (trang 8): của bố mẹ hay của ứng viên con? | Độ hiếm cao nhất **của bố mẹ** (biết trước khi lai). | `engine/genetics/breeding.ts` `breedFeeG` |
| 2 | Tỷ lệ 60/30/9/1 áp cho C/R/E/L của con. | Đúng thứ tự C/R/E/L, bỏ nhóm rỗng rồi chuẩn hóa. | `data/breeding.ts` |
| 3 | Anatomy chi tiết là đầu việc G0. | Bản nháp suy từ cột sinh cảnh trang 6 (`draft: true`); hô hấp nhóm A = `dual`. | `data/dragons.ts` |
| 4 | "Chung ông bà đã biết" cần dữ liệu ông bà. | Thêm trường tùy chọn `grandparentIds`; thiếu thì không suy diễn. | `types/game.ts` |
| 5 | Sproutling (trang 4) và `sprout` (trang 6). | Giữ ID `sprout`; tên EN "Sproutling". | `i18n/en.ts` |
| 6 | Tỷ lệ "Normal 85%" khi luck = 0, b = 0. | Công thức q cho đúng 15% → khớp bảng; test khóa giá trị. | `engine/economy/mutation.ts` |
