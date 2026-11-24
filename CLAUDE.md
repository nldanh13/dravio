# Hướng dẫn cho AI khi làm việc trên Dravio

Nguồn quyết định chính: `docs/gdd/Dravio_GDD_3.1.docx` (GDD 3.1). Lộ trình: `docs/ROADMAP.md`. Thay đổi lớn hoặc chỗ GDD chưa rõ → ghi ADR trong `docs/adr/`.

- Đọc `package.json`, test và code liên quan trước khi sửa. Chỉ làm một epic hoặc lát cắt đã chọn; giữ chức năng đang chạy.
- Chốt acceptance criteria, viết test cho domain invariants, triển khai engine thuần TypeScript rồi mới nối UI.
- Không tự thêm backend, thư viện, giá, gene hoặc tính năng ngoài scope. P2 không làm trước khi P0 ổn định.
- Engine không dùng `Math.random`/`Date.now` trực tiếp: tiêm `Rng` và `Clock`. Preview không tiêu RNG; roll một lần và lưu ngay.
- Không hardcode chuỗi hiển thị: dùng `t(key)`; `vi.ts` và `en.ts` phải cùng bộ key.
- Mọi catalog có ID ổn định và schema. Không đổi ID loài/achievement/upgrade của v2.
- Tiền tính bằng microG nguyên. Bảo vệ save cũ; không dùng mock ở production.
- Trước khi báo xong: `npm run typecheck && npm run lint && npm test && npm run build`. Báo cáo file đã đổi, lệnh đã chạy, kết quả thật, giới hạn.
