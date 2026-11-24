# Dravio — Hiện trạng và lộ trình

Cập nhật: 25/11/2026 (G0 được tác giả xác nhận, G1 PR1 đã merge). Nguồn: GDD 3.1 trang 21 (giai đoạn) và trang 23 (epic TD-01…TD-09).

## Hiện trạng so với GDD

| Epic | Phạm vi P0 trong GDD | Đã có | Còn thiếu |
| --- | --- | --- | --- |
| TD-01 Core | repository, schema, pure engine, commands, RNG/clock, save | Repo, TS strict, CI, RNG có seed, clock + cap 24h + high-water mark, `GameState`, command bus (requestId, lỗi có kiểu), domain events, validate runtime, persistence IndexedDB + Dravio Save Schema v1 + khung migration theo schemaVersion + 2 backup + import/export checksum (ADR 0006, 0007) | Scheduler cho jobs |
| TD-02 World | graph, 3 realm, suitability, capacity, renderer | 7 microhabitat, `suitability` 0–100 với hard gate | Graph vùng, `ZoneState`, sức chứa, Canvas renderer |
| TD-03 Dragons | 16 catalog, behavior, feeding, phenotype, inventory | Catalog 16 loài (ID + kinh tế v2), anatomy/diet/sinh cảnh G0, kiểu hình và stage dẫn xuất, sprite Emberling prototype | FSM/utility hành vi, cho ăn, bond, kho, sprite 15 loài còn lại |
| TD-04 Genetics | recipes, preview, breeding, lineage, pity | Luật tương thích, huyết thống, preview = phân phối engine, roll lai, biến thể + pity 200, phí/thời gian ấp | Tổ ấp (`BreedingEgg`, gõ/boost, cooldown 10 phút), phả hệ đầy đủ, UI Punnett |
| TD-05 Care | hazards, shelter, case workflow, recovery, tutorial | — | Toàn bộ |
| TD-06 Progression | expedition, research, Codex, achievements, economy | Công thức vàng/s, giá bán, offline 75%, nâng cấp, gói trứng | Thám hiểm, nghiên cứu, Codex 64 ô, 12 achievement, tutorial onboarding |
| TD-07 Sharing | passport PNG | — | Xuất PNG hộ chiếu |
| TD-08 Release (P1) | polish, native bridge, a11y, CI, packaging | CI cơ bản | PlatformBridge, Electron, Capacitor |
| TD-09 Social (P1/P2) | — | — | Không làm trước khi P0 ổn định |

## Lộ trình đề xuất (theo cổng nghiệm thu)

### G0 — Discovery ✅ hoàn thành 25/11/2026 (ADR 0005)
Nguồn: G0 Decision Pack 1.0 (`docs/g0/`, ADR 0003). Chỉ đánh dấu những gì đã kiểm chứng bằng test trong repo.
- [x] Khung dự án + engine thuần cho luật đã chốt
- [x] Anatomy/ngưỡng sinh cảnh 16 loài từ `g0Biology.ts` (`draft: false`), 7 microhabitat, `suitability`; test Vitest qua
- [x] Trả lời 6 điểm của ADR 0002 → ADR 0003; mỗi câu trả lời có test (`tests/unit/g0Decisions.test.ts`)
- [x] Prototype mỹ thuật Emberling 3 stage × 4 biến thể tích hợp qua manifest, hiển thị trên trang demo
- [x] Tác giả duyệt phong cách Emberling làm prototype G0; thêm huy hiệu hình học cho biến thể để nhận diện ở 64 px không dựa vào màu (ADR 0005)
- [x] 3 scenario mẫu có đặc tả (`docs/g0/SCENARIOS.md`); phần S03 preview G1 đã thành test
- [x] Tác giả xác nhận thiết bị test (ưu tiên Windows + Chromium ở G1) và trần ngân sách 2/10/12 triệu VNĐ (`docs/g0/QA_BUDGET.md`, ADR 0005)

Điểm lệch giữa tài liệu: `docs/g0/INTEGRATION_NOTES.md`.

### G1 — Vertical slice (1 vùng đất, 4 Common)
Kịch bản nghiệm thu chạy trên gameplay thật: S01 qua PR1–PR4 (phần engine của S01 đã có test ở PR1), S02 bản giản lược ở PR6 (đầy đủ ở G2). Kiểm thử ưu tiên Windows + Chromium, ghi cấu hình thực tế.
Thứ tự PR đề xuất, mỗi PR một lát cắt có test:
1. [x] `GameState` + command bus (`advanceTime`, `feed` + `consumeFood`, `pet`, `renameDragon`) + validate runtime + domain events — ADR 0004, `tests/unit/gameState.test.ts`. Chưa có: trứng tutorial, nhận bonus offline (PR5)
2. [x] Persistence: IndexedDB, autosave 30s, export/import JSON + checksum, backup — ADR 0006, `tests/unit/persistence.test.ts`, Dravio Save Schema v1 (ADR 0007), kiểm trên Chromium 158 headless (Linux). Windows + Chromium trên thiết bị thật: chưa kiểm thử
3. [x] Zone đất Khởi Nguyên: suitability, sức chứa 5, ngân sách sản xuất — ADR 0008, `tests/unit/zones.test.ts`, lệnh `moveDragon`/`setProductionSlot`/`unlockHabitat` (miễn phí, cần khám phá; ADR 0009, Dravio Save Schema v2). Chưa có: nhiệm vụ ghi nhận khám phá (PR5), mua nâng cấp sức chứa. Windows + Chromium trên thiết bị thật: chưa kiểm thử
4. Canvas renderer 2.5D + steering + FSM hành vi cơ bản; thả thức ăn (0,8s / 12s / XP mỗi 8s)
5. Tutorial 0–15 phút: 150 G, Emberling, trứng Sproutling, mốc Adult; chuỗi TUT_01–TUT_08 ghi nhận `DISC_EMBERLING_THERMAL` (TUT_04) và `DISC_AQUATIC_HABITAT` (TUT_06), có đường khám phá thay thế khi bỏ hướng dẫn (ADR 0009)
6. Một ca chăm sóc dựng sẵn (Forecast → … → Closed rút gọn)
7. Xuất PNG Dragon Passport

### G2 — MVP offline
3 realm, 16 loài, tổ ấp, 3 thiên tai, 4 loại chăm sóc, thám hiểm, nghiên cứu, Codex, achievement, kinh tế đầy đủ, offline receipt.

### G3 → G7
Theo GDD trang 21: cân bằng + `simulate:economy` (1.000 seed/chiến lược), Companion/Zen, Web/Steam 1.0, Connect P1, Mobile, P2.
