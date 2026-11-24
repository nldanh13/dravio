# ADR 0004 — GameState và command bus (G1 PR1)

Trạng thái: Chấp nhận cho G1 PR1. Nguồn: GDD 3.1 Phụ lục C, trang 7, 15, 18; ADR 0003; `docs/g0/AI_HANDOFF.md`; `docs/g0/SCENARIOS.md` S01.

## Quyết định

1. **Một điểm vào.** `dispatch(state, command, { clock })` trong `src/engine/core/commands.ts` là cách duy nhất để đổi `GameState`. Reducer thuần, không dùng `Date.now`/`Math.random`; lệnh không hợp lệ trả lỗi có kiểu (`CommandError`, khóa i18n `commandError.*`) và **giữ nguyên object state**.
2. **Idempotency.** Mọi lệnh có `requestId`. State nhớ 200 `requestId` thành công gần nhất; gửi lại trả `duplicate: true`, không event, không tăng `revision`. Lệnh lỗi không được ghi nhận nên có thể thử lại cùng `requestId`.
3. **Thời gian hiệu lực** = `max(clock.nowMs(), clock.highWaterAtMs)`. Đồng hồ lùi không cộng thời gian và không dùng để né cooldown.
4. **Tích phân vàng theo mốc stage** (`engine/progression/growth.ts`) bằng số nguyên ms: online 100%, offline 75% (phân số 3/4), elapsed chặn 24h, phần lẻ giữ trong `goldRemainder` (đơn vị microG/4000). XP tăng 100% cho mọi rồng chưa thả, chặn ở mức Adult. Không có thiên tai offline.
5. **Sản xuất** chỉ khi rồng nằm trong `productionDragonIds`, `activity = idle`, và ở microhabitat đã mở, hợp sinh học (suitability ≥ 50). Rồng ngoài ngân sách vẫn lớn.
6. **Cho ăn tách hai bước** theo AI_HANDOFF: `feed` chỉ thả viên thức ăn (cách ≥ 0,8 s, sống 12 s, tối đa 5 + cấp); `consumeFood` do mô phỏng/va chạm của engine phát khi rồng ăn, kiểm cùng chỗ, đúng diet, cooldown XP 8 s. XP = 8 + 6 × cấp chất lượng; +1 bond; không vàng. `consumeFood` quyết toán thời gian online tới thời điểm ăn trước khi cộng XP để vàng không bị tính theo stage mới. PR1 chưa có renderer nên test phát `consumeFood` như fixture engine.
7. **Gắn bó.** Vuốt ve cooldown 30 s; ăn và vuốt ve mỗi lần +1, tối đa +10/ngày UTC/rồng, trần 100, không giảm. Khi đã chạm trần, vuốt ve vẫn hợp lệ (có event) nhưng không cộng bond.
8. **Tên rồng.** NFC, trim, 1–24 grapheme (Intl.Segmenter), cấm ký tự điều khiển và ký tự định hướng bidi; lưu nguyên văn, UI hiển thị như text (React escape). `nickname: null` xóa tên. Lọc nội dung từ ngữ thuộc P1 (cộng đồng).
9. **Vị trí.** `Location.zone` có thêm `habitatId` (ADR 0003: slot lưu zoneId + habitatId). Kiểu để optional cho tương thích; validator yêu cầu có và phải thuộc đúng zone.
10. **Thức ăn trong state.** `food.drops` là trạng thái tạm (≤ 12 s) nằm trong `GameState` để reducer thuần. PR2 (persistence) sẽ quyết định bỏ qua khi lưu.
11. **Save mới.** 150 G, một Emberling baby ở `origin_meadow`, đã ở slot sản xuất; Origin mở (5 chỗ, chỉ đồng cỏ), Ocean/Sky khóa; UID và tính cách từ RNG đã tiêm, genotype founder từ UID + contentVersion `g0-1.0`.

## Ngoài phạm vi PR1
- Trứng hướng dẫn Sprout, thưởng mốc Adult/nở (PR5 tutorial + achievements).
- `claimOfflineBonus` (receipt đã được tạo, chưa có lệnh nhận bonus).
- Scheduler cho jobs (ấp, thám hiểm, chăm sóc): sẽ thêm cùng các job; mốc stage đã được tích phân trực tiếp.
- Persistence, migration, IndexedDB (PR2); zone/sức chứa/di chuyển rồng (PR3); renderer (PR4).
