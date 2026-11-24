# Dravio

> Different Worlds. Connected by Life. — Những thế giới khác nhau, kết nối bằng sự sống.

Cozy Dragon Ecosystem & Sanctuary Simulation: mô phỏng hệ sinh thái rồng, di truyền, chăm sóc, cứu hộ, bảo tồn và kết nối cộng đồng. Chơi đơn offline-first; Web → Steam → Android/iOS trên cùng một lõi.

Tài liệu thiết kế nguồn: [`docs/gdd/Dravio_GDD_3.1.docx`](docs/gdd/Dravio_GDD_3.1.docx). Lộ trình và hiện trạng: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Trạng thái

Giai đoạn **G0 / TD-01 Core**: khung dự án và engine thuần TypeScript cho các luật đã chốt trong GDD (catalog 16 loài, di truyền P0, RNG/clock, công thức kinh tế). Chưa có gameplay, renderer hay save.

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
  types/        hợp đồng kiểu dữ liệu (Phụ lục C)
  data/         catalog bất biến: loài, locus, gói, nâng cấp, phí lai
  engine/
    core/       RNG có seed, clock + quy tắc offline
    genetics/   allele, kiểu hình, luật tương thích, preview/roll lai
    economy/    tốc độ vàng, giá bán, biến thể + pity, gói trứng
  i18n/         VI/EN cùng bộ key
  App.tsx       màn hình minh họa catalog + preview lai
tests/unit/     test các bất biến domain
docs/           GDD, roadmap, ADR
```

Nguyên tắc: engine thuần, UI chỉ gửi lệnh/đọc kết quả; không `Math.random` trong engine; không hardcode chuỗi hiển thị; giá trị dẫn xuất (stage, kiểu hình, vàng/s) không lưu trong save.
