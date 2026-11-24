# ADR 0010 — Sửa lỗi trước renderer G1 PR4: vòng đời thời gian, ghi save đa tab, validate thế giới, world graph

Trạng thái: Chấp nhận 25/11/2026 (G1 PR4, phần A: PR sửa lỗi riêng trước renderer). Nguồn: yêu cầu tác giả "DRAVIO — G1 PR4: Living World & Canvas Renderer" mục A; GDD 3.1 trang 5 và 18; ADR 0006, 0008, 0009.

## 1. Thu nhập online/offline theo vòng đời trang
Trước đây tick 1 Hz luôn gửi `advanceTime` chế độ `online`. Khi tab ẩn, trình duyệt bóp `setInterval` (≥ 1 phút/lần) hoặc đóng băng trang; máy ngủ thì đồng hồ nhảy. Lần tick kế tiếp tính cả khoảng đó là online (100 %, không chặn 24 h, không receipt) — sai quy tắc GDD trang 18.

Quy tắc mới (`src/platform/timePolicy.ts`, `lifecycle.ts`, `gameSession.ts`):
- Chỉ tính **online** khi trang đang hiện **và** khoảng từ lần quyết toán trước ≤ `ONLINE_GAP_LIMIT_MS` = 5 s (5 tick). Lớn hơn → coi như máy ngủ/tab treo → **offline** (75 %, chặn 24 h, receipt khi > 60 s).
- **Ẩn** (`visibilitychange` → hidden: chuyển tab, thu nhỏ cửa sổ; `freeze`; `pagehide`): quyết toán online tới lúc ẩn, dừng tick online, ghi save ngay.
- **Hiện lại** (`visibilitychange` → visible, `resume`, `pageshow`): toàn bộ thời gian ẩn quyết toán **offline**, rồi tick online tiếp.
- Engine không đổi: vẫn chỉ là `advanceTime { mode }`; quy tắc chọn mode nằm ở lớp platform. Kinh tế và di truyền không đổi.

## 2. Không để nhiều tab ghi đè save khi không có Web Locks
- **Compare-and-swap trên slot `main`** (`SaveStore.rotate(text, { expectMain })`): trong cùng transaction IndexedDB, đọc `main`; khác với bản phiên này biết gần nhất (đọc lúc load hoặc tự ghi) → hủy transaction, không ghi gì, `SaveConflictError`. `SaveManager` chuyển sang chặn `conflict`; `GameSession` dừng tick/autosave, trạng thái `conflict`, UI báo "tải lại trang". `force` (import, bắt đầu lại) không vượt qua `conflict`. Lớp này hoạt động cả khi có Web Locks (phòng lease hết hạn, tab bị đóng băng rồi tỉnh lại).
- **Lease `localStorage`** khi `navigator.locks` không có (`writerLock.ts`): đọc lease; còn hạn và của tab khác → chỉ xem. Ngược lại ghi lease (TTL 6 s), chờ 150 ms, đọc lại; vẫn của mình → người ghi, heartbeat 2 s. Đóng tab → xóa lease; tab chết → lease hết hạn sau 6 s. Lease là lớp ưu tiên; CAS là lớp đảm bảo.
- Không có cả Web Locks lẫn `localStorage`: coi là người ghi (`via: 'none'`), CAS vẫn chặn ghi đè.

## 3. Validate runtime chặt hơn (`validation.ts`)
- `capacity` mỗi zone đúng 5 (P0; `P0_ZONE_CAPACITY`). Nâng sức chứa theo zone chưa có trong P0.
- Zone khóa không có microhabitat mở; Khởi Nguyên đã mở phải có `origin_meadow`; `unlockedHabitatIds` không trùng.
- Microhabitat cần khám phá (ADR 0009) chỉ hợp lệ khi `discoveries` có khám phá đó.
- Rồng `location.kind = 'zone'` phải ở zone đã mở, microhabitat đã mở và `suitability ≥ 50`.
- `productionDragonIds` chỉ chứa rồng đang đặt trong zone (khớp lệnh `setProductionSlot`: `not-placed`).
- Thức ăn: microhabitat phải thuộc đúng zone.
- Migration 1 → 2 ghi bù khám phá cho microhabitat đã mở trong save v1 (save v1 chỉ có thể có `origin_meadow`, nên fixture thật không đổi) để save cũ không bị luật mới từ chối.

## 4. World graph (GDD 3.1 trang 5)
GDD: "node = vùng, edge = đường đi với điều kiện di chuyển…; rồng bay cần nơi đậu"; "Thủy Vực: … cửa sông nối vùng đất". `src/data/worldGraph.ts`:
- Node `origin`, `ocean`, `sky`.
- `origin_ocean_estuary`: cần `swim`, cửa ngõ `origin_pondbank` ↔ `ocean_estuary`.
- `origin_sky_low_island`: cần `fly`, cửa ngõ `origin_meadow` ↔ `sky_low_island` (đảo thấp có `perch`).
- `canTravel(from, to, locomotion)` (BFS). Test: mọi loài tới được zone của mọi sinh cảnh hợp lệ của nó.
- **Chưa nối vào `moveDragon`**: ở G1 Thủy Vực/Thiên Giới còn khóa nên mọi lần chuyển đều trong Khởi Nguyên; nối khi mở realm (G2).

## Điểm cần tác giả quyết định
1. GDD không nêu cạnh Thủy Vực ↔ Thiên Giới; hiện không có cạnh trực tiếp (đi qua Khởi Nguyên). Cửa ngõ đất liền của cạnh trời là đồng cỏ — GDD chưa nêu.
2. Ngưỡng 5 s cho "khoảng trống = máy ngủ" là đề xuất kỹ thuật.
3. Vận chuyển bằng phương tiện cứu hộ (ngoại lệ trong GDD) để G2.

## Kiểm chứng
- `tests/unit/g1Fixes.test.ts` (21 test): time policy, sự kiện vòng đời, CAS hai tab, lease (lấy/giữ/nhả, tranh chấp, lease hết hạn, fallback), validate thế giới, ghi bù khám phá, world graph.
- Chromium 158 headless (Linux x64, Playwright, bản production): tab ẩn 120 s không tick/không ghi, hiện lại → receipt offline 120 s; đồng hồ nhảy 10 phút khi tab hiện → offline + receipt; không có Web Locks → tab hai chỉ xem qua lease; save bị nơi khác ghi → tab dừng, không ghi đè; SIGKILL trình duyệt 3 lần khi đang ghi liên tục → mở lại nạp `main` hợp lệ, không slot hỏng, không mất revision đã ghi. **Windows + Chromium trên thiết bị thật: chưa kiểm thử.**
