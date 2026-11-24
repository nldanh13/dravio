# Danh mục sinh học G0 — 16 loài

Nguồn ID/nhóm/sinh cảnh: GDD 3.1 trang 5–8, 26, 30 và `src/data/dragons.ts`. Ngưỡng, diet, palette và sức chống chịu dưới đây là quyết định gameplay giả tưởng mới, không phải số liệu sinh học thật. JSON là bản đọc máy, TS là module triển khai; khi tích hợp, TS là nguồn duy nhất và JSON chỉ xuất tự động.

| ID | Nhóm | Hô hấp | Vận động | Bảo vệ / hoạt động | Sinh cảnh | Thức ăn | Nhiệt |
|---|---|---|---|---|---|---|---|
| `emberling` | T | lung | walk | scale / day | origin_meadow, origin_warm_rocks | fruit, aether | mild, warm, hot |
| `droplet` | A | dual | walk, swim | scale / both | origin_pondbank, ocean_estuary | aquatic, fruit | cool, mild, warm |
| `sprout` | T | lung | walk, burrow | scale / day | origin_meadow, origin_pondbank | fruit, leaf | mild, warm |
| `zephyr` | V | lung | walk, fly | fur / day | origin_meadow, sky_low_island | fruit, aether | cool, mild, warm |
| `steamdrake` | A | dual | walk, swim | scale / both | origin_pondbank, ocean_estuary | aquatic, aether | mild, warm, hot |
| `magma` | T | lung | walk, burrow | armor / both | origin_warm_rocks | aether | warm, hot |
| `sparkwing` | V | lung | walk, fly | scale / day | origin_meadow, sky_low_island | fruit, aether | mild, warm |
| `frostfin` | A | gill | swim | scale / both | ocean_cool_pool | aquatic | cold, cool |
| `mossback` | A | dual | walk, swim | armor / day | origin_pondbank, ocean_estuary | leaf, aquatic | cool, mild, warm |
| `blossom` | V | lung | walk, fly | scale / day | origin_meadow, sky_low_island | fruit, leaf | mild, warm |
| `solaris` | V | lung | walk, fly | fur / day | origin_meadow, origin_warm_rocks, sky_low_island | aether, fruit | mild, warm, hot |
| `leviathan` | A | gill | swim | scale / both | ocean_reef | aquatic | mild, warm |
| `amberhorn` | T | lung | walk, burrow | armor / day | origin_meadow, origin_warm_rocks | fruit, aether | mild, warm, hot |
| `aurorawing` | V | lung | walk, fly | fur / night | origin_meadow, sky_low_island | aether, fruit | cool, mild |
| `celestia` | V | lung | walk, fly | scale / night | origin_meadow, sky_low_island | aether | cool, mild, warm |
| `gaia` | A | dual | walk, swim | armor / both | origin_pondbank, ocean_estuary | leaf, aquatic, aether | cool, mild, warm |

## Ngưỡng chất lượng và chống chịu

A/W/V/F = không khí/nước/thực vật/thức ăn (0–100); lửa/dòng nước/bão là % resilience giả tưởng, chia 100 khi tính risk. Chỉ dùng yếu tố phù hợp sinh cảnh.

| ID | A/W/V/F | Lửa/Dòng/Bão | Palette chính/phụ/bụng/nhấn | Hình dáng |
|---|---|---|---|---|
| `emberling` | 65/0/30/65 | 75/15/20 | #D86B47 / #A83D36 / #F9D59A / #FFD66C | Bốn chân, đuôi lửa tròn, không cánh. |
| `droplet` | 70/75/30/65 | 25/65/20 | #61BBD0 / #337FA4 / #C7F2EE / #86E5DE | Thân tròn, vây tai, đuôi dẹt, màng chân. |
| `sprout` | 75/0/65/70 | 20/30/25 | #75B57D / #397C58 / #E3EAC0 / #E7B864 | Mầm lá, bốn chân, đuôi lá. |
| `zephyr` | 80/0/20/65 | 25/15/60 | #A6C8E6 / #6388BA / #EDF4FC / #F5D999 | Cánh lông rộng, đuôi mây, chân đậu. |
| `steamdrake` | 70/70/15/65 | 65/65/20 | #92BFC0 / #527E83 / #E5E5CB / #ECAD78 | Thân dài, vây sống lưng, chi ngắn. |
| `magma` | 60/0/0/60 | 90/10/20 | #9F5544 / #523B48 / #F1A55C / #FFD261 | Giáp đá, sừng ngắn, chân chắc. |
| `sparkwing` | 75/0/15/65 | 45/15/85 | #DBB65A / #96703B / #F8EAC6 / #F7F08A | Cánh góc cạnh, đuôi tia điện. |
| `frostfin` | 0/85/0/75 | 10/80/10 | #8ABADD / #4B75AB / #E0F5FF / #BDEDF4 | Vây ngực lớn như cánh; không chân đi, không bay. |
| `mossback` | 70/75/60/70 | 25/80/25 | #829D66 / #506C4C / #D6D7A2 / #A7CD84 | Mai rêu, chi bè, vây đuôi. |
| `blossom` | 80/0/60/70 | 15/20/55 | #DC9FB8 / #A86B94 / #F9E1D5 / #B7D99A | Cánh cánh hoa, đuôi dài, chân đậu. |
| `solaris` | 75/0/10/65 | 85/10/65 | #ED874B / #AC4B3D / #FBE1A0 / #FFE47F | Mào lửa, cánh lông lớn, đuôi quạt. |
| `leviathan` | 0/85/0/75 | 15/90/15 | #427C9A / #27526E / #C7E4D7 / #E38F86 | Thân biển dài, vây san hô, không chi đất. |
| `amberhorn` | 65/0/25/65 | 80/25/25 | #C58C45 / #855B39 / #F3DCA4 / #FFE08A | Sừng hổ phách, giáp lưng, bốn chân. |
| `aurorawing` | 85/0/25/65 | 25/20/80 | #879BD5 / #5F5B9E / #DDE6FA / #8DE6CF | Cánh dải sáng, lông cổ, đuôi cực quang. |
| `celestia` | 85/0/15/70 | 75/20/90 | #7776B5 / #45446F / #D4D2EC / #E9D48C | Cánh sao, sừng tinh thể, đuôi sao. |
| `gaia` | 75/80/65/75 | 55/90/35 | #629B7D / #385D57 / #DDE5B6 / #E8C97F | Sừng cây, giáp đá-rêu, chân màng và vây. |
