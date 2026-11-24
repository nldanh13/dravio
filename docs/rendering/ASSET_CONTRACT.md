# Hợp đồng asset cho renderer — v2

Cập nhật 24/11/2026 (ADR 0012). Bản v1 (G1 PR4, ADR 0011) mô tả sprite tĩnh + dải khung ngang tùy chọn và nền tạm; v2 thay bằng tài nguyên thật đã tích hợp: **khung SVG rời + clip dữ liệu**. Không bắt buộc sprite sheet ngang.

## Nguồn dữ liệu (một nguồn cho mỗi loại)

| Loại | Module | Ghi chú |
|---|---|---|
| Sprite tĩnh 48 Common | `src/assets/dragons/manifest.ts` (`getCommonDragonSprite`) | Có bóng; dùng cho UI (thẻ, kho, hộ chiếu). `defaultRenderManifest()` (`src/rendering/assetContract.ts`) bọc lại theo kiểu v1 và vẫn được kiểm bằng `validateRenderManifest`. |
| Khung hoạt ảnh | `src/assets/animations/manifest.ts` (`getDragonFrame`) | 444 SVG không bóng, có `attach` và `hitbox` theo tư thế. |
| Clip | `src/assets/animations/dragonAnimations.ts` | 11 trạng thái; flipbook tư thế + track transform + cue hiệu ứng; `requires` theo vận động. |
| Hiệu ứng rồng | `src/assets/effects/manifest.ts` | 13 SVG; `informational` giữ khi reduced motion. |
| Sinh cảnh | `src/assets/habitats/origin/manifest.ts` | 5 lớp × 3, 16 vật thể, emitter, ánh sáng, chưa khám phá. |
| Icon thức ăn | `src/assets/icons/food/manifest.ts` | 4 nhóm diet, dùng trong cảnh và UI. |
| Bố cục va chạm | `src/rendering/originLayout.ts` | Dẫn xuất từ `geometry.json` + vị trí vật thể, không nhập tay. |

## Quy ước

| Mục | Giá trị |
|---|---|
| Khung rồng | 240 × 200 viewBox; neo chân **(120, 170)**; nhìn phải, lật quanh neo theo vận tốc |
| Tỉ lệ stage | Đã nướng trong SVG (0,68 / 0,85 / 1,0). Renderer **không** nhân lại; chỉ dx/dy của track × stageScale |
| Tỉ lệ rồng trong cảnh | `DRAGON_SCENE_SCALE = 0.55` px cảnh / đơn vị viewBox (Adult ≈ 132 px cảnh) |
| Cảnh | 960 × 540 px; thế giới = 3 cảnh Tây → Đông (x 0–2880); y = điểm chạm đất; z = độ cao |
| Độ cao bay | 18 / 40 / 56 px viewBox × 0,55 — không nhân stageScale |
| Thứ tự vẽ | sky → far → mid → ánh sáng nền → ground → vật thể phẳng → (vật thể đứng + rồng + thức ăn, y-sort) → hạt → foreground → ánh sáng cảnh → chưa khám phá |
| Bóng | Hiệu ứng `shadow` trên đất (co theo độ cao; không có khi bơi) |
| Bơi | Phần dưới `attach.waterline` bị che; vòng gợn nước quanh chân |
| Huy hiệu biến thể | Có trong SVG (cho UI); renderer cắt góc 50 × 50 khi vẽ trong cảnh |
| Tải | Mỗi SVG là file riêng (`?url&no-inline`); `ImageCache` tải khi cần, giải phóng ảnh không dùng > 30 s |
| URL | Chỉ asset đóng gói cục bộ; không tải Internet |

## Thêm loài/tư thế mới
1. Thêm hình học vào `scripts/art/generate-common-dragons.mjs` (tư thế trong `SPECIES_POSES`), chạy lại script.
2. Clip chung tự áp dụng; ghi đè theo loài trong `OVERRIDES` nếu cần; `requires` khớp `SPECIES_BIOLOGY.locomotion`.
3. Chạy `node scripts/art/build-animation-preview.mjs` (đo hitbox, kiểm render) và `npm test`.

## Thêm sinh cảnh mới
Theo `docs/art/ORIGIN_HABITATS.md`: lớp + vật thể + `geometry.json`; `originLayout.ts` dẫn xuất vùng đi, nước, vật cản.

## Kiểm thử
- Đơn vị: `tests/unit/livingWorld.test.ts`, `canvasRenderer.test.ts`, `dragonAnimationAssets.test.ts`, `originHabitatAssets.test.ts`, `settingsAndInput.test.ts`.
- Trình duyệt (không thuộc CI): `node scripts/e2e/renderer-e2e.mjs` sau `npm run build` → `docs/rendering/e2e/`.
