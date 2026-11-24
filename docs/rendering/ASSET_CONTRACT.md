# Hợp đồng asset cho renderer — dành cho AI 2

Phiên bản manifest: **1** (`RENDER_MANIFEST_VERSION`). Mã: `src/rendering/assetContract.ts`, `src/rendering/assetAdapter.ts`. Kiểm tra: `validateRenderManifest()` và `tests/unit/livingWorld.test.ts`.

AI 2 sở hữu sprite, animation và nền sinh cảnh. Renderer (G1 PR4) **không** vẽ đồ họa thay thế:
- loài/stage/biến thể chưa có sprite → khung xám có dấu **"?"** (dấu hiệu thiếu asset, không phải art);
- sinh cảnh chưa có nền → khối màu phẳng + vật cản hình elip, kèm dòng chữ "Nền sinh cảnh tạm thời — chờ asset của AI 2".

## Sprite rồng (`RenderManifest.dragons[speciesId][stage][mutation]`)

| Trường | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `url` | có | Ảnh đóng gói cục bộ (import Vite, `/…`, `./…`, `data:image/…`). Không URL Internet. |
| `width`, `height` | có | Khung nguồn, px. Emberling G0: 240 × 200. |
| `anchorX`, `anchorY` | có | Điểm neo **dưới chân**, px nguồn, nằm trong khung. Emberling G0: (120, 175). |
| `stageScaled` | có | `true` nếu tỉ lệ Baby 0,68 / Juvenile 0,85 / Adult 1,0 đã vẽ trong ảnh (Emberling G0: `true`). `false` → renderer nhân tỉ lệ. |
| `facing` | có | Hướng nhìn của ảnh gốc (`right`/`left`); renderer lật ngang theo vận tốc, không méo hình. |
| `animations` | không | `{ idle, walk, swim, fly, eat, rest, sleep, pet }` → dải khung ngang `{ url, frames, durationMs, loop }`. |
| `source` | có | `origin`, `license`, `review` (nguồn và quyền sử dụng — GDD trang 16). |

Thang hiển thị: 240 px nguồn ≈ 150 đơn vị thế giới. Một rồng Adult dài khoảng 100 đơn vị.

**Hoạt ảnh hiện tại.** Renderer tạo chuyển động bằng biến đổi thủ tục trên ảnh tĩnh, theo ART_DIRECTION G0:
- thở chu kỳ 2,5 s;
- nhún bước chân khi đi;
- cúi khi ăn 0,6 s;
- nằm thấp khi nghỉ và ngủ, kèm ký hiệu "z";
- nảy kèm "♥" khi được vuốt ve 1 s;
- chìm 30 % khi bơi, có vòng gợn nước;
- bay có bóng thu nhỏ.

Khi AI 2 cung cấp `animations`, phần đọc dải khung sẽ được nối vào renderer. **Chưa làm ở PR4** vì chưa có asset để kiểm thử.

**Chớp mắt 3–5 s** cần khung mắt nhắm. Hiện chưa có, nên đây là yêu cầu cho AI 2.

## Nền sinh cảnh (`RenderManifest.habitats[habitatId]`)
- `groundUrl` (không bắt buộc): lớp mặt đất của microhabitat.
- `props` (không bắt buộc): mỗi mục `{ url, x, y, width, height }`, toạ độ theo đơn vị thế giới.
- `source`: bắt buộc.

Bố cục va chạm nằm ở `src/rendering/originLayout.ts`. Khu Khởi Nguyên rộng 1200 × sâu 520 đơn vị:

| Microhabitat | Dải x | Vật cản |
| --- | --- | --- |
| Đồng cỏ | 0–480 | bụi tại (230, 190), r 42; bụi tại (120, 400), r 30 |
| Đá ấm | 480–840 | đá tại (600, 160), r 48; đá tại (735, 360), r 44 |
| Bờ hồ | 840–1200 | mặt hồ tại (1030, 290), r 115 |

Nếu AI 2 vẽ nền với vật cản ở chỗ khác, cần cập nhật bố cục này cùng lúc để luật va chạm khớp hình.

## Danh sách asset còn thiếu cho G1
1. Sprite 3 stage × 4 biến thể cho Sproutling. Loài này có trong tutorial PR5. Hiện Zephyr và Droplet cũng chỉ hiện "?" trong ảnh kiểm thử.
2. Nền đồng cỏ, đá ấm, bờ hồ và các vật cản.
3. Khung chớp mắt, cùng dải `walk` và `eat` nếu muốn thay biến đổi thủ tục.
4. Biểu tượng thức ăn cho 4 nhóm `fruit`, `leaf`, `aquatic`, `aether`. Hiện renderer vẽ chấm màu kèm viền.
