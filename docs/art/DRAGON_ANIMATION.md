# Hoạt ảnh rồng Common — G1 (prototype)

Trạng thái: **prototype chờ tác giả duyệt** (ADR 0009). Không phải hoạt ảnh thương mại cuối cùng (G3).
Phạm vi: tài nguyên + đặc tả dữ liệu. **Không** có FSM, Behavior Engine hay renderer trong PR này.

## Tổng quan

| Thành phần | Đường dẫn |
|---|---|
| Đặc tả clip (dữ liệu + hàm lấy mẫu thuần) | `src/assets/animations/dragonAnimations.ts` |
| Manifest khung (`getDragonFrame`) | `src/assets/animations/manifest.ts` |
| 444 khung SVG (tư thế × stage × biến thể Aether) | `src/assets/animations/frames/<speciesId>/<stage>_<mutation>_<pose>.svg` |
| Attach point từng khung (sinh) | `src/assets/animations/frame-data.json` |
| Hitbox minh họa từng khung (đo) | `src/assets/animations/frame-metrics.json` |
| 13 hiệu ứng + manifest | `src/assets/effects/dragon/*.svg`, `src/assets/effects/manifest.ts` |
| Trình sinh | `scripts/art/generate-common-dragons.mjs`, `scripts/art/generate-effects.mjs` |
| Preview hoạt ảnh (CSS thuần, không JS) + đo đạc | `scripts/art/build-animation-preview.mjs` → `docs/art/dragon-animations-preview.html` |
| Ảnh xem trước | `docs/art/previews/dragon-poses-adult-normal.png`, `dragon-poses-baby-golden.png`, `dragon-animations-preview.png` |
| Báo cáo render | `docs/art/reports/dragon-frames-render.json` |
| Test | `tests/unit/dragonAnimationAssets.test.ts` |

Quy trình sửa: chỉnh script → `node scripts/art/generate-common-dragons.mjs` → `node scripts/art/generate-effects.mjs` → `node scripts/art/build-animation-preview.mjs` → `npm test`.

## Mô hình hoạt ảnh

Một clip = **flipbook tư thế** (đổi khung SVG tại các mốc t) + **track transform** (dx, dy, sx, sy, rot quanh điểm neo chân, nội suy smoothstep) + **cue hiệu ứng** gắn vào attach point. Dạng này nhẹ cho Canvas 2D (chỉ `drawImage` khung đã cache + `setTransform`), không cần rig xương.

### Chuẩn hóa

| Mục | Quy ước |
|---|---|
| Khung | 240×200 viewBox, giống sprite gốc; tỉ lệ stage đã nướng sẵn (Baby 0.68, Juvenile 0.85, Adult 1) |
| Điểm neo | (120,170) = điểm chạm đất giữa hai chân, mọi khung, mọi loài |
| Hướng nhìn | Mặc định nhìn phải; vận tốc ngang < 0 thì lật ngang quanh anchor.x. Hiệu ứng có `flipWithFacing` lật theo |
| Transform | dx/dy theo px viewBox của Adult; renderer nhân `stageScale`. rot (độ) quanh điểm neo |
| Bóng | Khung **không chứa bóng**. Renderer vẽ hiệu ứng `shadow` tại mặt đất: `ground` cố định, `altitude` co lại theo độ cao (đề xuất `scale = 1 − 0.4·alt/56`), `water` không bóng |
| Hitbox | `frame.hitbox` (viewBox) đo trên biến thể Normal từng tư thế; chỉ minh họa (chọn/pet), không dùng cho domain. Khi bay cộng thêm độ cao |
| Attach point | `head`, `mouth`, `body`, `tail`, `ground`, `waterline` (chỉ Droplet), viewBox, đã theo stage và tư thế |
| Thời gian | Renderer truyền `elapsedMs`; `clipPhase` → `poseAt` + `sampleTrack`. Module không đọc đồng hồ, không dùng RNG |
| Nhấp nháy | `blink.intervalMs = [3000, 5000]`, `durMs = 140`; renderer chọn khoảng chờ bằng **RNG cosmetic riêng**, không đụng RNG domain |
| Lặp | `loop: true` lặp liền mạch (khóa đầu = khóa cuối, test khóa). `loop: false` kết thúc ở trạng thái nghỉ và có `returnsTo` (gợi ý; FSM quyết định) |
| Ngắt | `interruptible: false` (pet, happy, landing, recovery) nên chạy hết trước khi đổi clip |
| Reduced motion | Dừng track/flipbook ở khung đầu, ẩn hiệu ứng trang trí; giữ hiệu ứng `informational` (băng, lá chăm sóc, mặt nước) ở dạng tĩnh |

### Bảng clip

| Trạng thái | Yêu cầu vận động | Thời lượng | Lặp | Tư thế | Track | Hiệu ứng |
|---|---|---|---|---|---|---|
| idle | — | 2400 ms | ✓ | idle (+ blink ngẫu nhiên) | thở: sy 1→1.025 | — |
| walk | walk | 1000 ms (Droplet/Sprout 1100, Zephyr 800) | ✓ | walk_a → idle → walk_b → idle | nhún 2.5 px | dust ở chân. `stridePx` để khớp tốc độ |
| swim | swim | 1200 ms | ✓ | swim_a ↔ swim_b (đuôi đập) | lắc ±1.5°, nhấp nhô | ripple ở waterline, bubbles ở miệng. Renderer đặt waterline khung trùng mặt nước, vẽ `water_surface` phía trước |
| fly | fly | 600 ms | ✓ | fly_up ↔ fly_down (chân co) | thân lên khi đập xuống | wind. Độ cao Baby 18 / Juvenile 40 / Adult 56 px |
| eat | — | 600 ms | ✓ | eat_a (há) ↔ eat_b (nhai), đầu cúi | gật 3° | crumbs ở miệng |
| sleep | — | 3200 ms | ✓ | sleep (nằm, mắt nhắm) | thở chậm | zzz ở đầu |
| pet | — | 1000 ms | — → idle | blink → happy → idle | nén–giãn | heart |
| happy | — | 900 ms | — → idle | happy (Zephyr: vỗ cánh) | nhảy 14 px + nén khi chạm đất | happy_burst |
| landing | fly | 500 ms | — → idle | land (cánh giơ) → idle | hạ 20 px + nén | dust |
| injured | — | 3000 ms | ✓ | injured (thu mình, mắt lo) | thở yếu | **bandage** + **care_leaf** (informational) |
| recovery | — | 1500 ms | — → idle | injured → blink → idle → happy | đứng dậy, nhảy nhẹ | recovery_glow, happy_burst |

Trạng thái theo loài (từ `SPECIES_BIOLOGY.locomotion`, test khóa):

| Loài | idle | walk | swim | fly | eat | sleep | pet | happy | landing | injured | recovery |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Emberling | ✓ | ✓¹ | — | — | ✓¹ | ✓¹ | ✓ | ✓ | — | ✓ | ✓ |
| Droplet | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Sproutling | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Zephyr | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

¹ Emberling giữ bản vẽ G0 phẳng (ADR 0008): chỉ có khung thay mắt/miệng (idle, blink, happy, eat_a, injured), dẫn xuất từ file G0 **không sửa file gốc**. Tư thế thiếu dùng `POSE_FALLBACK` (walk → idle, sleep → blink, eat_b → idle) và track bù (lắc thân khi đi, nén khi ngủ, cúi khi ăn). Khung bước chân thật cho Emberling sẽ có khi làm lại ở G3.

Sproutling có `burrow` trong catalog, nhưng 11 trạng thái yêu cầu không gồm đào hang; chưa làm (đề xuất bổ sung ở PR sau nếu tác giả muốn).

### Biến thể Aether trong hoạt ảnh
Mỗi tư thế có đủ 4 biến thể; lớp `body`/`pattern`/`eye` giống hệt giữa các biến thể ở mọi tư thế (test khóa) — đổi tư thế không làm mất biến thể, đổi biến thể không đổi giải phẫu.

## Tích hợp vào Canvas Renderer (gợi ý cho AI phụ trách Renderer)

```ts
const clip = resolveDragonClip(speciesId, state);      // null → loài không làm được trạng thái này
if (!clip) return;                                      // FSM không nên chọn trạng thái null
const t = clipPhase(clip, elapsedMs);
const frame = getDragonFrame(speciesId, stage, mutation, poseAt(clip, t)); // đã áp fallback
const tr = sampleTrack(clip, t);
const k = displayWidth / 240, s = STAGE_SCALE[stage];
const alt = (clip.altitude?.[stage] ?? 0) * k;
ctx.save();
ctx.translate(worldX, worldY - alt);                    // gốc = điểm neo
if (facingLeft) ctx.scale(-1, 1);
ctx.translate(tr.dx * s * k, tr.dy * s * k);
ctx.rotate((tr.rot * Math.PI) / 180);
ctx.scale(tr.sx, tr.sy);
ctx.drawImage(cache(frame.url), -120 * k, -170 * k, 240 * k, 200 * k);
ctx.restore();
```

- Preload: mọi khung của loài/stage/biến thể đang có trên màn hình; rasterize một lần vào canvas cache (DPR ≤ 2). Có thể đổi `import.meta.glob` sang dạng lazy nếu bundle lớn.
- Hiệu ứng: với cue có `t` vừa qua, sinh hạt tại `frame.attach[cue.at]` (đổi sang toạ độ thế giới như trên), dịch theo `travel` và mờ dần trong `durMs` theo `motion`.
- Bơi: đặt sprite sao cho `attach.waterline` trùng mặt nước thế giới; vẽ `water_surface` sau sprite để che phần chìm.
- Chuyển trạng thái do FSM quyết định; nên đợi clip `interruptible: false` chạy hết.

## Giới hạn
- Prototype: 2–4 khung mỗi chu kỳ, chuyển động chủ yếu bằng transform; chưa có nội suy giữa các khung.
- Emberling không có khung bước chân/nằm (xem ¹).
- Kiểm tra render trên Chromium 158 headless (Linux); chưa thử Windows + Chromium thiết bị thật; chưa thử trên renderer thật vì renderer chưa có.
- Kích thước repo: 444 khung ≈ 2.9 MB SVG.
