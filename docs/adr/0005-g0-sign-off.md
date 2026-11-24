# ADR 0005 — Tác giả xác nhận G0

Trạng thái: Chấp nhận (25/11/2026). Bổ sung ADR 0003; không thay đổi ID, giá, gene hay luật sinh học.

## Quyết định
1. **Mỹ thuật:** duyệt Emberling hiện tại làm prototype G0 (Cozy Fantasy, chibi 2.5D, SVG, 3 stage × 4 biến thể, đúng giải phẫu/vận động). Cải thiện nhận diện 64 px và không dùng màu làm tín hiệu duy nhất; chất lượng thương mại ở G3. Chi tiết: `docs/g0/ART_DIRECTION.md`.
2. **Thiết bị:** chấp thuận cấu hình mục tiêu trong `docs/g0/QA_BUDGET.md`; G1 ưu tiên Windows + Chromium; không mua thiết bị ngay; ghi cấu hình thực tế; mô phỏng trình duyệt ≠ kiểm thử native.
3. **Ngân sách:** trần lập kế hoạch G0–G1 2.000.000, G2–G4 10.000.000, G5–G6 12.000.000 VNĐ (tổng 24.000.000). Chi thực tế G0–G1 mục tiêu 0 đồng; mọi dịch vụ trả phí cần phê duyệt riêng.

## Hệ quả trong repo
- 9 SVG biến thể của Emberling có thêm huy hiệu hình học (thoi / vòng / sao) làm tín hiệu không dựa vào màu; test khóa quy tắc.
- Cổng G0 trong `docs/ROADMAP.md` được đánh dấu hoàn thành sau khi chạy lại đủ typecheck, lint, test, build.
- Repo không dùng dịch vụ trả phí nào (CI GitHub Actions gói miễn phí, không backend, không SDK).
