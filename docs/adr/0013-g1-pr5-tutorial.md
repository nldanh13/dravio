# ADR 0013 — G1 PR5: hướng dẫn ba sinh cảnh, gói Starter Sproutling, thành tựu đầu tiên; Dravio Save Schema v4

Trạng thái: Chấp nhận cho G1 PR5. Nguồn: GDD 3.1 trang 4, 15 và Phụ lục F; `docs/g0/SCENARIOS.md` S01; ADR 0009 (mục 4–7).

## Bối cảnh
ADR 0009 chốt chuỗi TUT_01–TUT_08 và cách mở `origin_warm_rocks`/`origin_pondbank` bằng khám phá, nhưng PR3 chưa có đường production nào ghi nhận khám phá (chỉ có công cụ DEV). S01 yêu cầu trứng Sproutling hướng dẫn là kết quả cố định, giá Starter 100 G, không tăng pity, `ACH_FIRST_HATCH` 50 G khi nhận trứng và 100 G khi rồng đầu tiên Adult, mỗi thứ một lần, không tính vào vàng sản xuất.

## Quyết định
1. **Hướng dẫn đọc GameState, không đọc thao tác UI.** Sau mỗi lệnh thành công, `dispatch` đánh giá thành tựu rồi hướng dẫn (`engine/progression/achievements.ts`, `tutorial.ts`). Một bước chỉ hoàn thành khi bước trước đã xong; điều kiện đã thỏa từ trước được ghi nhận liên tiếp ngay khi tới lượt. UI không có lệnh nào tự khai báo xong bước.

   | Bước | Điều kiện (state) |
   |---|---|
   | TUT_01 | ≥ 15 s kể từ `tutorial.startedAtMs` và có rồng trong một zone |
   | TUT_02 | engine đã chấp nhận ít nhất một `consumeFood` (rồng có `lastFeedXpAtMs`) |
   | TUT_03 | `tutorial.profilesViewed` có `emberling` |
   | TUT_04 | `origin_warm_rocks` đã mở |
   | TUT_05 | đã mua gói Starter hướng dẫn và đã nhận trứng |
   | TUT_06 | `origin_pondbank` đã mở |
   | TUT_07 | có rồng Adult |
   | TUT_08 | ba sinh cảnh Origin đã mở → `status: completed` |

2. **Lệnh mới**
   - `viewBiologyProfile { speciesId }`: chỉ với loài đang nuôi; ghi `profilesViewed` (không trùng). UI hiển thị hồ sơ từ `g0Biology.ts` (dải nhiệt, sinh cảnh, thức ăn, hô hấp, di chuyển, giờ hoạt động).
   - `surveyHabitat { habitatId }`: người chơi bấm "Khảo sát" ở sinh cảnh chưa mở; engine kiểm điều kiện rồi gọi `recordDiscovery`. Đá ấm cần đang nuôi Emberling và đã xem hồ sơ sinh học của nó; bờ hồ không cần điều kiện (không cần Droplet, ADR 0009 mục 6). Đây là **cùng một đường** cho người theo và người bỏ qua hướng dẫn. Lỗi: `unknown-habitat`, `zone-locked`, `discovery-already-known`, `survey-requirement-missing`.
   - `buyTutorialPack`: 100 G (`starter` trong catalog), một lần mỗi save, vẫn mua được khi đã bỏ qua hướng dẫn. Kết quả cố định Sproutling Normal, genotype founder; roll một lần lúc mua và lưu ngay trong `pendingPack`. Không tiêu RNG domain, không đổi `pityCount`. Lỗi: `pack-pending`, `tutorial-pack-used`, `not-enough-gold`.
   - `claimPack { target }`: nở Baby (`origin: 'pack'`, thế hệ 1), UID và tính cách từ RNG có seed `hash('hatch', pack.id)` nên tái lập được; đặt theo đúng luật của `moveDragon` (sinh học, sức chứa 5) hoặc vào kho; `stats.totalHatched + 1`.
   - `setTutorialStatus { status: 'active' | 'skipped' }`: bỏ qua dừng đánh giá; xem lại giữ các bước đã xong và đặt lại mốc quan sát.
   - Phiên trình duyệt lưu ngay sau `buyTutorialPack` và `claimPack`.
3. **Thành tựu.** Danh mục 12 ID của Phụ lục F (`data/achievements.ts`, ID ổn định). PR5 chỉ cài điều kiện của `ACH_FIRST_HATCH` (`totalHatched ≥ 1`; rồng có sẵn lúc tạo save không tính) và `ACH_FIRST_ADULT` (có rồng Adult). Tự mở và tự nhận một lần, cộng vào `goldMicro`, **không** cộng vào `totalGoldEarnedMicro`. Thành tựu chạy cả khi bỏ qua hướng dẫn. 10 thành tựu còn lại thuộc G2.
4. **Không thêm vàng ngoài GDD.** Hướng dẫn và khảo sát không thưởng gì; mở sinh cảnh vẫn miễn phí.
5. **Dravio Save Schema v4.** Thêm `tutorial`, `pendingPack`, `unlockedAchievements`, `claimedAchievements`. Số 3 vẫn dành cho bí danh tiền phát hành (ADR 0009), nên bước migration là 2 → 4: giữ nguyên mọi trường v2, bắt đầu hướng dẫn ở TUT_01 với `startedAtMs = clock.lastProcessedAtMs`, không cấp thành tựu khi migrate. Lần dispatch đầu tiên sau đó ghi nhận những gì save đã đạt (ví dụ thành tựu Adult nếu save đã có rồng Adult). Bản gốc v2 giữ trong `archive:schema-2`. Validate: `completed` phải là tiền tố đúng thứ tự TUT_01…, `completed` ⇒ đủ 8 bước, `pendingPack` hợp lệ theo loài/locus, trứng hướng dẫn đòi `starterPackUsed`, `claimed ⊆ unlocked`.
6. **Hoãn: nhận thưởng offline ×2.** GDD gắn ×2 với quảng cáo có thưởng trên mobile; quy tắc dự án cấm mock ở production, nên PR5 không làm lệnh này. Biên nhận offline đã hiển thị trong mục Lưu game.

## Quyết định chờ tác giả
- Ngưỡng 15 s cho TUT_01 ("quan sát") là đề xuất của PR này.
- Điều kiện khảo sát đá ấm (đang nuôi Emberling + đã xem hồ sơ sinh học) là đề xuất; bờ hồ không điều kiện theo ADR 0009.
- Save v2 cũ được bắt đầu hướng dẫn ở trạng thái `active`; người chơi có thể bỏ qua.

## Hệ quả
- Công cụ DEV `devRecordDiscovery` vẫn giữ (chỉ trong bản phát triển); production dùng `surveyHabitat`.
- Test: `tests/unit/tutorial.test.ts` (chơi hết 8 bước chỉ bằng lệnh, thứ tự bước, bỏ qua/xem lại, khảo sát, gói, validate, migration từ `tests/fixtures/save-schema-v2.json` do main@b5820f9 ghi). E2E Chromium headless: `/mnt/project-files/g1-pr5-tutorial/tutorial.cjs`.
- Windows + Chromium trên thiết bị thật: chưa kiểm thử.
