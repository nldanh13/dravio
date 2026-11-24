# Dravio — Hiện trạng và lộ trình

Cập nhật: 24/11/2026. Nguồn: GDD 3.1 trang 21 (giai đoạn) và trang 23 (epic TD-01…TD-09).

## Hiện trạng so với GDD

| Epic | Phạm vi P0 trong GDD | Đã có | Còn thiếu |
| --- | --- | --- | --- |
| TD-01 Core | repository, schema, pure engine, commands, RNG/clock, save | Repo, TS strict, CI, RNG có seed, clock + cap 24h + high-water mark, kiểu dữ liệu lõi | `GameState`, hệ command (requestId, lỗi có kiểu), scheduler/domain events, persistence IndexedDB + migration + backup, validate runtime |
| TD-02 World | graph, 3 realm, suitability, capacity, renderer | Realm trong catalog | Graph vùng, `ZoneState`, suitability 0–100, sức chứa, Canvas renderer |
| TD-03 Dragons | 16 catalog, behavior, feeding, phenotype, inventory | Catalog 16 loài (ID + kinh tế v2), kiểu hình dẫn xuất, stage dẫn xuất | Anatomy chốt G0, FSM/utility hành vi, cho ăn, bond, kho, sprite |
| TD-04 Genetics | recipes, preview, breeding, lineage, pity | Luật tương thích, huyết thống, preview = phân phối engine, roll lai, biến thể + pity 200, phí/thời gian ấp | Tổ ấp (`BreedingEgg`, gõ/boost, cooldown 10 phút), phả hệ đầy đủ, UI Punnett |
| TD-05 Care | hazards, shelter, case workflow, recovery, tutorial | — | Toàn bộ |
| TD-06 Progression | expedition, research, Codex, achievements, economy | Công thức vàng/s, giá bán, offline 75%, nâng cấp, gói trứng | Thám hiểm, nghiên cứu, Codex 64 ô, 12 achievement, tutorial onboarding |
| TD-07 Sharing | passport PNG | — | Xuất PNG hộ chiếu |
| TD-08 Release (P1) | polish, native bridge, a11y, CI, packaging | CI cơ bản | PlatformBridge, Electron, Capacitor |
| TD-09 Social (P1/P2) | — | — | Không làm trước khi P0 ổn định |

## Lộ trình đề xuất (theo cổng nghiệm thu)

### G0 — Discovery (đang làm)
- [x] Khung dự án + engine thuần cho luật đã chốt
- [ ] Chốt anatomy/ngưỡng sinh cảnh 16 loài (thay `draft: true`)
- [ ] Trả lời các điểm mở trong `docs/adr/0002-open-questions-g0.md`
- [ ] Prototype mỹ thuật 1 loài (3 stage, 4 biến thể) để khóa phong cách
- [ ] 3 scenario mẫu: phiên quan sát, phiên cứu hộ, phiên lai tạo
- [ ] Chốt thiết bị test và ngân sách

### G1 — Vertical slice (1 vùng đất, 4 Common)
Thứ tự PR đề xuất, mỗi PR một lát cắt có test:
1. `GameState` + command bus (`advanceTime`, `feed`, `pet`, `renameDragon`) + validate runtime
2. Persistence: IndexedDB, autosave 30s, export/import JSON + checksum, backup
3. Zone đất Khởi Nguyên: suitability, sức chứa 5, ngân sách sản xuất
4. Canvas renderer 2.5D + steering + FSM hành vi cơ bản; thả thức ăn (0,8s / 12s / XP mỗi 8s)
5. Tutorial 0–15 phút: 150 G, Emberling, trứng Sproutling, mốc Adult
6. Một ca chăm sóc dựng sẵn (Forecast → … → Closed rút gọn)
7. Xuất PNG Dragon Passport

### G2 — MVP offline
3 realm, 16 loài, tổ ấp, 3 thiên tai, 4 loại chăm sóc, thám hiểm, nghiên cứu, Codex, achievement, kinh tế đầy đủ, offline receipt.

### G3 → G7
Theo GDD trang 21: cân bằng + `simulate:economy` (1.000 seed/chiến lược), Companion/Zen, Web/Steam 1.0, Connect P1, Mobile, P2.
