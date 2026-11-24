# Môi trường Khởi Nguyên — G1 (prototype)

Trạng thái: **prototype chờ tác giả duyệt** (ADR 0103). Không phải art thương mại cuối cùng (G3).
Phạm vi: tài nguyên hình ảnh + dữ liệu bố cục. **Không** có luật domain (mở khóa, sức chứa, suitability, bố trí) — các phần đó thuộc Game Engine (ADR 0008, 0009, 0010). Đã tích hợp vào renderer ở ADR 0012: `src/rendering/originLayout.ts` dẫn xuất vùng đi/mặt hồ/vật cản từ `geometry.json` và vị trí vật thể.

## Tổng quan

| Thành phần | Đường dẫn |
|---|---|
| 5 lớp × 3 sinh cảnh | `src/assets/habitats/origin/<habitatId>/{sky,far,mid,ground,foreground}.svg` |
| 16 vật thể | `src/assets/habitats/origin/props/*.svg` |
| 10 hiệu ứng môi trường | `src/assets/habitats/origin/fx/*.svg` |
| Chưa khám phá | `src/assets/habitats/origin/undiscovered/{mist,marker_thermal,marker_aquatic,marker_generic}.svg` |
| Hình học (sinh) | `src/assets/habitats/origin/geometry.json` |
| Manifest + bố cục | `src/assets/habitats/origin/manifest.ts` |
| Trình sinh | `scripts/art/generate-origin-habitats.mjs` |
| Preview + kiểm tra render | `scripts/art/build-habitat-preview.mjs` → `docs/art/origin-habitats-preview.html` |
| Ảnh xem trước | `docs/art/previews/origin-{panorama,debug,lighting,undiscovered}.png` |
| Báo cáo render | `docs/art/reports/origin-habitats-render.json` |
| Test | `tests/unit/originHabitatAssets.test.ts` |

Sửa: chỉnh trình sinh / manifest → `node scripts/art/generate-origin-habitats.mjs` → `node scripts/art/build-habitat-preview.mjs` → `npm test`.

## Một vùng địa lý

Tây → Đông: **bờ hồ** (`origin_pondbank`, x 0–960) | **đồng cỏ** (`origin_meadow`, 960–1920) | **đá ấm** (`origin_warm_rocks`, 1920–2880). Dãy núi xa, đồi, mây, mép đất và lối mòn được tính theo toạ độ toàn cục nên ba cảnh ghép ngang liền mép (test khóa). Màu đồi/đất chuyển dần từ xanh ẩm (tây) sang vàng cát (đông).

Gợi ý thị giác cho world graph của Game Engine (chỉ hiển thị, không phải luật): lạch nước và dải cửa sông ở mép tây bờ hồ (`origin_ocean_estuary`), đảo trời thấp mờ trên đồng cỏ (`origin_sky_low_island`).

## Cấu trúc một cảnh (960×540 px cảnh)

| z | Lớp | Parallax | Ghi chú |
|---|---|---|---|
| 0 | sky | 0.05 | 960×330: trời, mây, đảo trời |
| 10 | far | 0.15 | dãy núi xa |
| 20 | mid | 0.35 | đồi, cây xa / núi mặt bàn, cửa sông |
| 30 | *ánh sáng nền* | — | `LIGHTING[t].backdrop` (multiply) |
| 40 | ground | 1 | mặt đất, hồ, phiến đá, lối mòn |
| 45 | vật thể phẳng | 1 | `flat: true` (thảm rêu, lá súng, phiến đá nằm…) |
| 50–89 | **actor** | 1 | rồng + vật thể đứng + hiệu ứng, **y-sort** theo điểm neo |
| 90 | foreground | 1.15 | cỏ/lau/đá sát đáy và góc, thấp để không che rồng |
| 95 | *ánh sáng cảnh* | — | `LIGHTING[t].scene` (multiply) toàn khung |
| 96–97 | chưa khám phá | — | sương + biển khám phá |

- **Tỉ lệ**: `DRAGON_SCENE_SCALE = 0.55` px cảnh mỗi đơn vị viewBox rồng → rồng Adult ≈ 132 px cảnh. Vật thể vẽ theo tỉ lệ này (cây ≈ 2× rồng).
- **Vùng**: `walkArea` (polygon đi bộ), `water` (chỉ bờ hồ; đi bộ = walkArea − water; bơi trong water), `trail` (lối mòn trang trí).
- **Vật thể**: `PROPS[id]` (neo đáy giữa) + `habitat.props[]` (x, y, scale, flip).
- **Spot** (`habitat.spots[]`): `rest`, `perch`, `feed`, `drink`, `bask`, `warm`, `swim_entry`, `play`; `requires` (`fly`/`swim`/null) đối chiếu `SPECIES_BIOLOGY.locomotion`; spot trên cao (`elevated`) có `sortY` = y vật thể + 1 để rồng đậu vẽ trên cành/đỉnh đá và không vẽ bóng đất.

| Sinh cảnh | Nghỉ | Tương tác | Đậu (fly) | Bơi |
|---|---|---|---|---|
| Bờ hồ | bãi bùn, cạnh khúc gỗ | đá uống nước | khúc gỗ | lối xuống nước |
| Đồng cỏ | thảm rêu | bụi quả (ăn), thảm hoa (chơi) | cành cây, gốc cây | — |
| Đá ấm | hõm cát | phiến đá phơi nắng, khe ấm | đỉnh đá nhọn | — |

## Hiệu ứng môi trường

`habitat.emitters[]`: khung (butterfly 2 khung, 160 ms), vùng sinh, `maxActive`, `perMinute`, `lifeMs`, `motion` (`drift`, `flutter`, `dart`, `twinkle`, `shimmer`, `rise`), `times` (ngày/hoàng hôn/đêm). Tất cả là **trang trí** → tắt khi reduced motion; thông tin chăm sóc nằm ở hiệu ứng của rồng (`informational`).

| Sinh cảnh | Ngày | Hoàng hôn | Đêm |
|---|---|---|---|
| Bờ hồ | lấp lánh nước, chuồn chuồn | lấp lánh, đom đóm | đom đóm |
| Đồng cỏ | phấn hoa, cánh hoa, bướm | cánh hoa | đom đóm |
| Đá ấm | hơi nóng, bụi, hơi ấm từ khe | bụi, hơi ấm | hơi ấm |

Sinh hạt bằng **RNG cosmetic** của renderer, không đụng RNG domain.

## Ánh sáng

`LIGHTING.day` không phủ. `dusk`: cam (nền 0.35 / cảnh 0.2). `night`: xanh đêm (nền 0.6 / cảnh 0.35). Lớp cảnh nhẹ hơn lớp nền để rồng vẫn nhận diện được (test khóa).

## Trạng thái chưa khám phá

Theo luật mở khóa của Game Engine (`HABITAT_UNLOCK_RULES`, ADR 0009): đá ấm cần `DISC_EMBERLING_THERMAL` → biển **thermal** (mặt trời + đá); bờ hồ cần `DISC_AQUATIC_HABITAT` → biển **aquatic** (giọt nước); đồng cỏ mở mặc định → biển **generic** (la bàn, chỉ dùng nếu UI cần trạng thái giới thiệu). Hiển thị: sky/far/mid bình thường, ground + foreground khử bão hòa `desaturate`, ẩn vật thể/spot/hiệu ứng, phủ `mist.svg`, đặt biển tại `markerAt`. Biển không có chữ; UI hiển thị điều kiện bằng `t(key)` (khóa i18n thuộc UI, không thêm trong PR này).

## Hợp đồng tích hợp cho AI 1 (Renderer / World Engine)

API ổn định: `ORIGIN_HABITATS`, `ORIGIN_HABITAT_IDS`, `PROPS`, `ENV_FX`, `LIGHTING`, `SCENE`, `DRAGON_SCENE_SCALE`, `HABITAT_OFFSET_X`, `ACTOR_LAYER_Z`, `pointInPolygon`. ID: `habitat.origin.prop.<id>`, `habitat.origin.fx.<id>`.

1. Hiển thị trạng thái khóa/mở **theo state của Game Engine** (`unlockedHabitatIds`); tài nguyên không quyết định mở khóa.
2. Vị trí rồng: chọn trong `walkArea` (trừ `water` với loài không bơi; Droplet bơi trong `water`); spot `requires` phải khớp `SPECIES_BIOLOGY.locomotion`; spot `perch` chỉ cho loài bay, rồng đậu dùng `sortY` và không vẽ bóng.
3. Kẹp vị trí rồng bằng `clipExtents` (DRAGON_ANIMATION.md) × `DRAGON_SCENE_SCALE` trong khung 960×540 để không cắt sprite.
4. Mỗi SVG là file riêng (`?url&no-inline`), tải khi vào sinh cảnh, rasterize một lần vào cache theo kích thước hiển thị × DPR (≤ 2). Parallax: dịch lớp theo `camera.x × parallax`.
5. Reduced motion: tắt emitter và parallax động; giữ ánh sáng, sương chưa khám phá và biển khám phá.
6. Không đổi GameState, kinh tế, sinh học vì tài nguyên môi trường; không lưu toạ độ hạt/camera vào save.

## Giới hạn
- Prototype: cảnh tĩnh nhiều lớp; chưa có biến thể theo mùa/thời tiết hay thiên tai (G2).
- Ánh sáng là lớp phủ đơn giản; chưa có nguồn sáng cục bộ.
- Preview dùng vài hạt CSS minh họa; hệ hạt thật thuộc renderer.
- Kiểm tra render: Chromium 158 headless (Linux). Chưa thử Windows + Chromium thiết bị thật, chưa thử renderer thật.
