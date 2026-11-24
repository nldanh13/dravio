# AI Engineering Prompt — G0 integration → G1 PR1

Bạn là Principal Game Engineer của Dravio. Hãy đọc GDD 3.1, ROADMAP và toàn bộ pack G0 1.0; kiểm tra repo hiện tại, git status, branch, package.json, lockfile, các test, ADR. Không viết lại mã nguồn đang có. Không tự thêm gameplay P1/P2, Supabase, SDK native, dependency hoặc đổi package ID. Không xóa cấu trúc file cũ hay đổi 16 species ID, economy baseline, loci. Báo mâu thuẫn thay vì tự sửa ngầm. Dùng nhánh riêng, không merge main khi chưa review.

## PR G0: tích hợp quyết định và catalog

1. Đưa ADR 0003, docs/g0, các SVG vào repo theo đường dẫn; giữ ADR 0002 lịch sử, ghi status superseded by 0003 và link, không xóa. Kiểm tra `git diff` trước khi ghi. Đưa `src/data/g0Biology.ts` vào repo, giữ đúng 16 ID. File này có helper suitability thuần; khi world engine xuất hiện, đưa helper vào `src/engine/world/habitat.ts` và re-export nếu cần; không copy nghiệp vụ thành hai hàm. Data chỉ có một nguồn runtime.
2. `src/types/game.ts`: import type `G0Anatomy` từ module dữ liệu (hoặc tách type vào `types/biology.ts` trước nếu muốn tránh dependency types→data); mở rộng Anatomy bằng `Omit<G0Anatomy,'group'|'habitatRules'|'palette'|'silhouetteVi'>`. Giữ field cũ và `draft` (false theo canonical). Thêm `habitatRules`, `palette`, `silhouetteVi` vào DragonSpecies; không thay `realms`, `habitatTags`, baseRateMicroG, growthTimeSec, baseSellG, bodyStyle, packEligible, assetId. `dragons.ts` thay anatomyFor bằng `getBiology(r.id)` rồi destructure group, habitatRules, palette, silhouetteVi và phần anatomy; kiểm group/realms khớp catalog; không infer từ nguyên tố, không thêm ID. Có thể giữ group chỉ ở DragonSpecies và xác minh giá trị G0 data trong test. Không lưu Anatomy vào save; catalog version.
3. Giữ existing breeding rules/weights/fee/mutation engine; cập nhật comment ADR. Thêm test cấm `released` và shelter khẩn cấp trong checkBreed ngay bây giờ; kiểm health/case khi state có health, không giả lập healthy bằng placeholder. Giữ `grandparentIds` optional; implement phả hệ cache khi có parent registry. Preview phải bị disable với input invalid qua query wrapper, không trừ tiền. Không dùng roll trước khi validate.
4. Chuyển smoke test độc lập sang Vitest `tests/unit/g0Biology.test.ts`; test 16 species đúng group, realms, mỗi species ≥1 habitat score≥80, invalid placement, diet, 0/49/50/79/80/100, NaN, unknown enum, hard gates, ancestry, baseline mutation, pity. Thêm test catalog không đổi kinh tế từ trước PR. Chạy `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Ghi đúng output; nếu fail từ baseline phân biệt trước/sau. Chỉ đổi ROADMAP G0 khi tích hợp test xong; art review và thiết bị/ngân sách chưa xác nhận ghi pending. Không tuyên bố G0 merged hoặc game playable nếu chưa thật.

## G1 PR1: GameState + command bus (chỉ sau PR G0)

Scope TD-01: `GameState` GDD p28, initial state, runtime validation, requestId/idempotency, command discriminated union, pure reducer, scheduler/domain events tối thiểu. Lệnh `advanceTime`, `feed`, `pet`, `renameDragon`; G1 feed spawn và consume event có kiểm chứng; nếu renderer chưa có, test consume bằng fixture engine, không cấp XP trực tiếp từ UI. Dùng clock/RNG inject có sẵn, integer microG, stage dẫn xuất; tích phân vàng theo mốc, offline cap 24h/high-water mark. Seed initial founder ổn định, Emberling, 150 G, Origin locked/unlocked đúng GDD; tutorial trứng Sprout không reroll. Không serialize frame x/y/vx/vy, phenotype, stage, rate. Mọi command có requestId, validate trước thay state, lỗi typed; duplicate trả kết quả idempotent, invalid không tiêu RNG/vàng. Atomic in-memory reducer ở PR1; persistence transaction IndexedDB đến PR2. Không tạo hai store.

Acceptance PR1: state mới schema valid; 16 ID canonical; reject NaN, unknown UID, duplicate UID, negative gold, invalid allele, invalid refs; clock lùi, elapsed 0/60/61s, >24h, boundary 35/100%, duplicate requestId; pet cooldown 30s/10 bond UTC daily cap; food 0.8/12/8s, không bonus gold; rename 1–24 Unicode grapheme (đề xuất), trim, cấm control chars, i18n lỗi, không HTML injection; test engine, strict TS/lint/build. Không hoàn thành toàn G1 trong PR1.

## PR sau (ROADMAP)

2. Persistence IndexedDB + autosave 30s + backup 2 + import/export JSON checksum; Dravio Save Schema v1 + khung migration theo schemaVersion (ADR 0007; trước đây ghi "migration v1→v2→v3"), one writer; không import entitlement/verified. 3. Origin zone, 3 microhabitat, capacity 5, suitability & production budget; habitat placement/move. 4. Canvas 2.5D, FSM/steering, sprite, feeding. 5. Tutorial 0–15 phút. 6. Rescue fixture. 7. Passport PNG offline. Genetics preview demo S03 G1, full nest G2. Kiểm test từng PR; không mở G2/G5 khi chưa đủ gate. Không xóa phần GDD cũ.

## Báo cáo mỗi PR

- Mục tiêu và acceptance, file thêm/sửa, quyết định ADR, thay đổi schema/migration/rollback.
- Lệnh đã chạy, output pass/fail, test thực tế và test chưa chạy. Nếu có blocker ghi rõ.
- Phạm vi đã hoàn thành và phần còn thiếu; đề xuất PR tiếp theo. Không tự đánh dấu Done cho G0 chỉ vì có pack.
