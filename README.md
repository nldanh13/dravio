# Dravio

> Different Worlds. Connected by Life. — Những thế giới khác nhau, kết nối bằng sự sống.

Cozy Dragon Ecosystem & Sanctuary Simulation: mô phỏng hệ sinh thái rồng, di truyền, chăm sóc, cứu hộ, bảo tồn và kết nối cộng đồng. Chơi đơn offline-first; Web → Steam → Android/iOS trên cùng một lõi.

Tài liệu thiết kế nguồn: [`docs/gdd/Dravio_GDD_3.1.docx`](docs/gdd/Dravio_GDD_3.1.docx). Lộ trình và hiện trạng: [`docs/ROADMAP.md`](docs/ROADMAP.md). Quyết định G0: [`docs/adr/0003-g0-decisions.md`](docs/adr/0003-g0-decisions.md), [`docs/g0/`](docs/g0/).

## Trạng thái

Giai đoạn **G1 — Vertical slice** (xem [`docs/ROADMAP.md`](docs/ROADMAP.md)). Đã có: engine thuần TypeScript (16 loài, sinh học G0, suitability, di truyền P0, kinh tế, RNG/clock), `GameState` + command bus, save IndexedDB (Dravio Save Schema v2, 2 backup, import/export checksum, migration), zone Khởi Nguyên với 3 microhabitat và mở khóa theo khám phá, quy tắc thời gian online/offline theo vòng đời trang, chống ghi đè save giữa nhiều tab, world graph dữ liệu. UI hiện là bảng điều khiển HTML; **chưa có Canvas renderer** (G1 PR4 phần B), tutorial (PR5), ca chăm sóc (PR6), hộ chiếu (PR7). Kiểm thử trình duyệt: Chromium headless trên Linux; **Windows + Chromium trên thiết bị thật chưa kiểm thử**.

## Lệnh

| Lệnh | Mô tả |
| --- | --- |
| `npm run dev` | Chạy Vite dev server |
| `npm run build` | Typecheck + build production vào `dist/` |
| `npm run typecheck` | `tsc` strict |
| `npm run lint` | ESLint |
| `npm test` | Vitest (domain invariants) |

Các lệnh mục tiêu khác trong GDD (`test:e2e`, `simulate:economy`, `cap:sync`, `electron:*`) sẽ được thêm khi tới epic tương ứng.

## Cấu trúc

```
src/
  types/        hợp đồng kiểu dữ liệu (Phụ lục C), GameState
  data/         catalog bất biến: loài, sinh học G0, locus, gói, nâng cấp, chăm sóc, mở khóa sinh cảnh, world graph
  engine/
    core/       RNG có seed, clock, command bus, lỗi có kiểu, domain events, validate runtime
    genetics/   allele, kiểu hình, luật tương thích, preview/roll lai
    economy/    tốc độ vàng, giá bán, biến thể + pity, gói trứng
    world/      suitability, zone, bố trí, ngân sách sản xuất, mở khóa sinh cảnh
    biology/    bond (vuốt ve)
    inventory/  tên rồng
    progression/ tăng trưởng, stage
  persistence/  envelope + checksum, migration, IndexedDB 3 slot, autosave, import/export
  platform/     GameSession (nối engine + save cho trình duyệt), vòng đời trang, khóa người ghi
  ui/           bảng điều khiển React (zone, save)
  i18n/         VI/EN cùng bộ key
tests/unit/     test các bất biến domain
tests/fixtures/ save thật của schema cũ cho test migration
docs/           GDD, roadmap, ADR
```

Nguyên tắc: engine thuần, UI chỉ gửi lệnh/đọc kết quả; không `Math.random` trong engine; không hardcode chuỗi hiển thị; giá trị dẫn xuất (stage, kiểu hình, vàng/s) không lưu trong save.
