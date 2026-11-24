# Ghi chú tích hợp G0 Decision Pack 1.0

Ngày 24/11/2026. Ghi lại cách pack được đưa vào repo và các điểm lệch giữa tài liệu, theo yêu cầu "báo mâu thuẫn thay vì sửa ngầm".

## Vị trí file

| Pack | Repo | Ghi chú |
| --- | --- | --- |
| `src/data/g0Biology.ts` | `src/data/g0Biology.ts` | Kiểu dữ liệu tách ra `src/types/biology.ts` để `types/` không phụ thuộc `data/`; dữ liệu và `suitability` giữ nguyên. |
| `docs/adr/0003-g0-decisions.md` | giữ nguyên đường dẫn | ADR 0002 giữ lại, trạng thái *Superseded by 0003*. |
| `docs/g0/*` | giữ nguyên đường dẫn | `README.md` và `AI_HANDOFF.md` của pack lưu thành `docs/g0/PACK_README.md`, `docs/g0/AI_HANDOFF.md`. |
| `assets/g0/emberling/*` | `src/assets/g0/emberling/*` | Đặt dưới `src/assets/` theo cây thư mục GDD trang 24; có manifest `src/assets/manifest.ts` ghi nguồn và quyền sử dụng. |
| `tests/g0/biology.smoke.ts` | `tests/unit/g0Biology.test.ts` | Chuyển sang Vitest và mở rộng; `BIOLOGY_CATALOG.json` được test so khớp với TS để chỉ có một nguồn runtime. |

## Điểm lệch đã phát hiện

1. **Magma "đất nóng" và `origin_warm_rocks` = `warm`.** GDD trang 6 ghi Magma sống ở "đất nóng" (code cũ: `habitatTags: ['hot']`), còn microhabitat duy nhất của Magma trong G0 có `temperatureBand: 'warm'`. Không mâu thuẫn về luật vì `thermalBands` của Magma gồm cả `warm` và `hot`; `habitatTags` được giữ làm mô tả cũ, không dùng cho gate. Cần tác giả xác nhận có muốn thêm microhabitat nóng (ví dụ Hỏa Sơn) ở G2 không.
2. **Điều kiện sức khỏe khi lai (ADR 0003).** ADR 0003 thêm health ≥80, mobility ≥80, comfort ≥60 và "không có HealthCase mở". GameState chưa có dữ liệu sức khỏe (TD-05), nên `checkBreed` chưa kiểm các điều kiện này và **không** giả lập giá trị "khỏe". Đã có: chặn `released`, shelter khẩn cấp, đang care, genotype sai.
3. **Màu biến thể Crystal trùng tông "lạnh".** Bản mẫu Crystal tô thân màu lam, dễ nhầm với kiểu hình `rr` (tông lạnh). Art direction yêu cầu biến thể không chỉ dựa vào màu; cần review khi duyệt phong cách.
4. **Frostfin `bodyStyle: 'winged'` nhưng không bay.** Đúng theo GDD trang 30 (dáng thân là baseline mỹ thuật, không quyết định vận động) và G0 (`locomotion: ['swim']`). Không đổi.
5. **Tutorial trứng Sprout.** AI_HANDOFF nhắc tới trong G1 PR1, nhưng ROADMAP đặt tutorial ở PR5 và yêu cầu của tác giả cho PR1 chỉ gồm 4 lệnh. Trứng tutorial để PR5; GameState đã có chỗ cho `pendingPack`.

## Cổng G0 chưa thể tự đánh dấu xong

- Tác giả duyệt phong cách 12 mẫu Emberling ở 64/128 px.
- Tác giả xác nhận thiết bị test và trần ngân sách trong `QA_BUDGET.md`.
