# ADR 0008 — Sprite Common G1: lớp kiểu hình tách khỏi lớp Aether

Trạng thái: **Chấp nhận** (24/11/2026, tác giả duyệt cả 4 điểm). Bổ sung ADR 0005 (mỹ thuật). Không đổi ID loài, giá, gene hay luật sinh học.

## Bối cảnh
- G1 cần 4 loài Common (ROADMAP G1). Emberling đã có prototype G0 được duyệt (ADR 0005).
- `docs/g0/ART_DIRECTION.md`: "Variant không được thay đổi anatomy, locomotion, genotype hay rarity… production phải compositing pigment/pattern/eye độc lập với lớp phủ Aether". Emberling G0 lại đổi palette toàn thân theo biến thể (bản vẽ phẳng).

## Quyết định
1. Droplet, Sproutling (`sprout`), Zephyr dùng cấu trúc lớp: `shadow → body → pattern → aether-tint → eye → aether-fx → badge`. Biến thể Aether chỉ là lớp phủ clip theo silhouette + motif hình học + huy hiệu; ba lớp kiểu hình giống hệt giữa 4 biến thể (test khóa).
2. Giữ huy hiệu và quy ước khung của Emberling (240×200, neo chân (120,170), tỉ lệ stage 0.68/0.85/1.0, thoi/vòng/sao).
3. Sprite mới sinh tất định bằng script trong repo; manifest bổ sung độc lập `src/assets/dragons/manifest.ts`, không sửa `src/assets/manifest.ts` và không di chuyển Emberling.
4. Tất cả là `tier: 'prototype'`; 36 sprite mới `review: 'approved-prototype'` sau khi tác giả duyệt.

## Tác giả quyết định (24/11/2026)
- ✅ Duyệt phong cách và silhouette 3 loài mới làm prototype G1.
- ✅ Emberling giữ nguyên ở G1 (không sửa file G0); làm lại theo cấu trúc lớp cùng đợt art thương mại G3.
- ✅ Giữ cường độ lớp phủ Crystal 46%, Golden 60%, Prismatic 62%.
- ✅ Zephyr là wyvern hai chân (cánh thay chi trước), chân đậu.

## Hệ quả
- Renderer có thể tách/ẩn lớp theo tên `data-layer` khi cần (ví dụ bóng động khi bay).
- Bổ sung biến thể kiểu hình theo locus về sau chỉ đụng lớp `body`/`pattern`/`eye`, không đụng Aether.
