# Bộ sprite rồng Common — G1 (prototype)

Trạng thái: **prototype đã được tác giả duyệt** (36 sprite mới, ADR 0008, 24/11/2026) + Emberling prototype G0 đã duyệt (12 sprite, giữ nguyên đến G3). Không phải art thương mại cuối cùng; chất lượng thương mại ở G3 (ADR 0005).
Nguồn quyết định: GDD 3.1, `docs/g0/ART_DIRECTION.md`, `docs/g0/BIOLOGY_CATALOG.md`, `src/data/g0Biology.ts`, ADR 0003, ADR 0005, ADR 0008.

## Tổng quan

| Thành phần | Đường dẫn |
|---|---|
| 12 sprite Emberling (không di chuyển) | `src/assets/g0/emberling/{stage}_{mutation}.svg` |
| 36 sprite mới | `src/assets/dragons/common/{droplet,sprout,zephyr}/{stage}_{mutation}.svg` |
| Manifest bổ sung (48 mục) | `src/assets/dragons/manifest.ts` |
| Hộp va chạm minh họa (đo) | `src/assets/dragons/common/sprite-metrics.json` |
| Trình sinh SVG (tất định) | `scripts/art/generate-common-dragons.mjs` |
| Contact sheet + kiểm tra render | `scripts/art/build-common-preview.mjs` |
| Contact sheet để duyệt (mở trực tiếp bằng trình duyệt) | `docs/art/common-dragons-contact-sheet.html` |
| Ảnh xem trước | `docs/art/previews/common-dragons-128.png`, `common-dragons-64-gray.png` |
| Báo cáo render | `docs/art/reports/common-dragons-render.json` |
| Test | `tests/unit/commonDragonAssets.test.ts` |

Sửa hình: chỉnh tham số trong `generate-common-dragons.mjs`, chạy lại hai script, chạy test. Không sửa tay file SVG sinh ra.

## Giải phẫu từng loài (theo catalog sinh học)

Khung chung với Emberling: viewBox 240×200, nhìn ngang 2.5D, mặt hướng phải, viền bo tròn màu `secondary` 2.7px, mắt mực `#3A303A` có điểm sáng. Palette lấy đúng `SPECIES_BIOLOGY[id].palette`.

| Loài | Nhóm / vận động | Silhouette | Bộ phận (`data-part`) |
|---|---|---|---|
| Emberling | T / walk | Bốn chân, gai lưng nhọn, sừng, đuôi lửa tròn; không cánh | (G0, bản vẽ phẳng) |
| Droplet | A / walk, swim | Thân **thấp, dẹt** kiểu kỳ giông; đầu rộng mõm cười; **vây tai dạng tua** sau đầu; **đuôi dẹt mái chèo** có màng; **màng chân** | `ear-fin`, `dorsal-fin`, `paddle-tail`, `tail-fin`, `webbed-foot` |
| Sproutling (`sprout`) | T / walk, burrow | Thân **chắc, tròn cao**, đầu tròn mõm ngắn; **mầm lá trên đầu**, tai lá rủ; **tấm lá trên lưng** (tròn, không nhọn như Emberling); **đuôi lá**; chân to có **móng xẻng** | `head-sprout`, `leaf-plate`, `leaf-tail`, `digging-claw` |
| Zephyr | V / walk, fly | **Đứng thẳng hai chân** (wyvern), **cánh lông rộng** (cánh xa tối hơn tạo chiều sâu), dải lông phủ màu nhấn, **cổ lông xù**, chỏm lông tai, **đuôi mây**, **chân đậu** 3 ngón trước + 1 sau | `wing`, `cloud-tail`, `perching-foot` |

Test khóa: có `wing` ⇔ loài có `fly`; có `webbed-foot` ⇔ có `swim`; có `digging-claw` ⇔ có `burrow` (ở Adult). Emberling không bay.

## Ba giai đoạn — vẽ riêng, không phóng to một hình chung

Tỉ lệ nướng sẵn quanh điểm neo chân (120,170): Baby 0.68, Juvenile 0.85, Adult 1.0 (như Emberling). Ngoài tỉ lệ, hình học mỗi stage khác nhau:

| | Baby | Juvenile | Adult |
|---|---|---|---|
| Chung | Đầu rất to (r≈30–33), mắt to nhất, thân ngắn | Đầu vừa, chi tiết đặc trưng bắt đầu rõ | Đầu nhỏ tương đối, đủ bộ phận |
| Droplet | 1 thùy vây tai, đuôi ngắn, không vây lưng | 2 thùy, vây lưng 3 sóng, có màng đuôi | 3 thùy, vây lưng 5 sóng, đuôi mái chèo dài, đủ đốm |
| Sproutling | Hai lá mầm tròn, không tấm lưng, chưa có móng | Thân + lá thứ ba + **nụ**, 2 tấm lá lưng, móng chân trước | **Hoa** nở, 3 tấm lá lưng, móng cả hai chân, đuôi lá lớn |
| Zephyr | Cánh nhỏ 3 lông, 1 chỏm lông, đuôi 2 bông mây | Cánh 4 lông, 2 chỏm, 3 bông mây | Cánh rộng 5 lông bay, 3 chỏm, đuôi mây dài |

## Kiểu hình di truyền ≠ biến thể Aether

Hai hệ thống tách rõ trong cấu trúc SVG (các lớp phẳng, không lồng `<g>`):

```
shadow → body → pattern → aether-tint → eye → aether-fx → badge
         └──── kiểu hình (genotype) ───┘          └── Aether (mutation) ──┘
```

- `body` (giải phẫu + pigment), `pattern` (hoa văn), `eye` (mắt) là **kiểu hình**. Bản prototype cố định một kiểu hình tham chiếu (palette loài, hoa văn mức "medium", mắt mặc định) như ART_DIRECTION quy định. Test khóa: ba lớp này **giống hệt từng byte** giữa Normal/Crystal/Golden/Prismatic của cùng stage.
- `aether-tint` là lớp phủ bán trong suốt **clip theo silhouette** (không đổi hình thể, hoa văn vẫn nhìn thấy bên dưới); `aether-fx` là motif hình học; `badge` là huy hiệu đơn sắc giống Emberling.

| Biến thể | Lớp phủ | Motif hình học (không dựa vào màu) | Huy hiệu |
|---|---|---|---|
| Normal | — | — | — |
| Crystal | xanh băng 46% | mặt thoi trên thân, vệt sáng, tia 4 cánh | ◆ thoi |
| Golden | vàng 60% | **vòng hào quang** trên đầu, vòng nhỏ, vệt sáng | ◎ vòng |
| Prismatic | gradient cầu vồng 62% | vệt cầu vồng, **sao 5 cánh** | ★ sao |

Khác biệt với Emberling G0: Emberling đổi palette toàn thân theo biến thể (bản vẽ phẳng). Ba loài mới dùng lớp phủ để giữ dấu nhận biết kiểu hình theo hướng production của ART_DIRECTION. Tác giả đã chấp nhận (ADR 0008); Emberling sẽ được làm lại theo cấu trúc lớp ở G3.

## Nghiệm thu đã chạy

- 48 sprite (12 Emberling + 36 mới), ID `dragon.<speciesId>.<stage>.<mutation>` duy nhất.
- Kiểm tra render: Chromium 158 (Playwright có sẵn trong môi trường, không phải dependency dự án) tải từng SVG bằng `<img>`, vẽ bằng Canvas 2D `drawImage` ở **64, 128, 256 px**: 48/48 tải được, có nội dung, nằm trong khung. Kết quả: `docs/art/reports/common-dragons-render.json`.
- Duyệt mắt: contact sheet có 64/128/256 px và thang xám; ở 64 px thang xám vẫn phân biệt loài (silhouette), stage (kích thước + bộ phận) và biến thể (huy hiệu + motif).
- SVG tự chứa: không script, không `<image>`, không `href`, không `url()` ngoài `#id` nội bộ; id nội bộ có tiền tố riêng mỗi file nên có thể nhúng nhiều sprite cùng trang.

## Tích hợp vào Canvas Renderer

Không sửa renderer/FSM/Behavior Engine trong PR này. Hướng dẫn cho AI phụ trách Renderer:

1. **Tra cứu**: `getCommonDragonSprite(speciesId, stage, mutation)` từ `src/assets/dragons/manifest.ts` (stage dẫn xuất từ engine, mutation từ `DragonInstance.mutation`). Trả `null` cho loài chưa có art → vẽ fallback.
2. **Preload + cache** (ART_DIRECTION G1): tải `url` bằng `Image`, `await img.decode()`, rồi rasterize một lần vào `OffscreenCanvas`/canvas cache theo kích thước hiển thị × DPR (cap 2). Không vẽ SVG trực tiếp mỗi frame. Chỉ dùng asset đã preload, không tải Internet.
3. **Kích thước**: sprite giữ khung 240×200; tỉ lệ stage đã nướng sẵn, renderer **không** nhân thêm stageScale. Hệ số hiển thị đề xuất: chiều rộng 128 px CSS cho rồng Adult ở zoom 1 (64 px vẫn đọc được).
4. **Điểm neo**: `anchor = (120,170)` trong viewBox = điểm chạm đất giữa hai chân. Vẽ: `ctx.drawImage(cache, worldX - anchor.x*k, worldY - anchor.y*k, 240*k, 200*k)` với `k = displayWidth/240`. Sắp xếp chiều sâu 2.5D theo `worldY` của anchor.
5. **Hướng nhìn**: mặc định nhìn phải. Khi vận tốc ngang < 0: `ctx.save(); ctx.translate(worldX, 0); ctx.scale(-1, 1); ctx.translate(-worldX, 0); …` (lật quanh anchor.x, không méo hình). Huy hiệu biến thể bị lật theo — nếu cần giữ ở góc trái, vẽ huy hiệu bằng UI riêng (đề xuất).
6. **Hộp va chạm minh họa**: `hitbox` (đơn vị viewBox) chỉ cho chọn/hover/pet; không dùng trong logic domain. Nhân `k` như trên.
7. **Bóng**: đã có trong SVG (lớp `shadow`). Nếu renderer vẽ bóng động (khi bay), cache thêm bản không bóng bằng cách ẩn lớp `shadow` trước khi rasterize (đề xuất cho PR hoạt ảnh).
8. **Reduced motion**: sprite tĩnh không có animation/gradient động; không cần xử lý.

## Giới hạn

- Prototype: hình vector đơn giản, một khung tĩnh (idle) mỗi sprite; khung hoạt ảnh thuộc PR "Dragon Animation Assets".
- Kiểu hình cố định một genotype; biến thể pigment/pattern/eye theo locus chưa có asset (lớp đã tách sẵn để làm sau).
- Hộp va chạm đo trên Chromium headless Linux; chưa kiểm trên Windows + Chromium thiết bị thật.
- Emberling không được chỉnh sửa (vẫn là bản vẽ phẳng, đổi palette theo biến thể).
