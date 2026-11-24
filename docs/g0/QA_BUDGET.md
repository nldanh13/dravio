# Thiết bị, ngân sách và cổng nghiệm thu G0

## Thiết bị mục tiêu (baseline, chưa xác nhận sở hữu)

| Lớp | Cấu hình mục tiêu | Kiểm thử |
|---|---|---|
| Desktop chính | Windows 10/11 64-bit, 8 GB RAM, CPU 4 luồng trở lên, GPU tích hợp, trình duyệt Chromium hiện hành | 1920×1080; 480×320; keyboard, resume, IndexedDB, xuất PNG |
| Mobile Android mục tiêu | Android 10+, RAM 4 GB, thiết bị tầm trung, Chrome/WebView; 360×640 CSS px | 30 FPS, touch, safe area, pin; ưu tiên test thật trước G3 |
| Mobile iOS mục tiêu | iPhone 11 hoặc tương đương; Safari; 390×844 CSS px tham chiếu | Web trước; native cần thiết bị và macOS/Xcode thật ở G6 |
| macOS | Apple Silicon hoặc Intel còn hỗ trợ; 8 GB RAM | Steam/macOS trước G4, không chặn G1 Web nếu chưa có máy |

Các OS trên là mục tiêu thử nghiệm web nội bộ, không phải cam kết min OS của SDK native/store. Không mua máy ngay. G1 kiểm Chromium thật và viewport giả lập; ghi model/OS/browser/RAM/DPR thực vào report. Thiết bị giả lập không thay thế test native. Nếu chưa có máy Android/iOS/macOS, mượn hoặc dùng dịch vụ test ở cổng tương ứng.

## Ngân sách đề xuất (VND, trần phân bổ, không phải báo giá)

| Khoản | G0–G1 | G2–G4 dự phòng | G5–G6 dự phòng |
|---|---:|---:|---:|
| Repo, CI nhỏ, dev local | 0 | 0 | 0 |
| Công cụ art/audio, license | 500.000 | 2.000.000 | 1.000.000 |
| Thiết bị/test thuê hoặc mượn | 500.000 | 2.000.000 | 3.000.000 |
| Playtest/QA | 500.000 | 1.500.000 | 1.500.000 |
| Store/domain/hosting | 0 | 2.500.000 | 4.000.000 |
| Dự phòng | 500.000 | 2.000.000 | 2.500.000 |
| Tổng trần | 2.000.000 | 10.000.000 | 12.000.000 |

G0–G1 mục tiêu chi tiền 0 nếu đã có máy và dùng asset code tự tạo. Trần G0–G1 2 triệu chỉ là quyết định lập kế hoạch; không cấp quyền chi tiêu. Không bao gồm công sức, mua máy mới, thuê artist chuyên nghiệp, thuế/phí giao dịch. G2 trở đi chỉ phê duyệt theo cổng, giá store/hosting cần kiểm tra lúc mua; chi phí vận hành server chưa được xác định, đặt budget riêng trước G5. Không backend ở P0. G0–G1 ưu tiên không phụ thuộc dịch vụ trả phí.

## Tiêu chí kỹ thuật

- G0 tài liệu: 16 biology đúng ID + catalog, 6 ADR, 3 scenario, prototype 12 tổ hợp, quyết định ngân sách/thiết bị; schema và test module độc lập pass. Review artwork ở 64px/128px, phân biệt stage/variant không chỉ màu.
- G1 PR1: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` theo repo. Nếu lệnh không chạy ghi log blocker, không tự báo pass. Không đổi dependency ngoài scope.
- G1 gameplay: test thật 10 phút, không crash, không mất save, không duplicate; HUD 1Hz, renderer 30/60FPS, dt clamp 100ms/DPR cap2, 25 rồng stress test mục tiêu p95 frame ≤33,3ms ở 30FPS; chưa đủ thiết bị thì report pending.
- G3: 1000 seed/chiến lược theo GDD; 5–10 playtester độc lập; record hiểu sinh học, chăm sóc, gắn bó, áp lực offline và chia sẻ tự nguyện. Không coi test logic độc lập là kết quả mô phỏng game.

## Gate

Bộ hồ sơ G0 đã đủ quyết định thiết kế để AI bắt đầu G1. G0 tích hợp chỉ đánh dấu Done sau khi module anatomy đã merge/test trên repo, tác giả xem prototype và xác nhận thiết bị/trần ngân sách. Cổng kiểm thử game/nền tảng vẫn pending. Không tuyên bố đã hoàn tất QA hoặc phát hành.

## Quyết định của tác giả (25/11/2026)

Phần trên giữ nguyên làm lịch sử. Tác giả đã phê duyệt:

- **Thiết bị:** chấp thuận toàn bộ cấu hình mục tiêu ở bảng trên. G1 ưu tiên **Windows + Chromium**. Không mua thêm thiết bị ngay. Mỗi báo cáo kiểm thử ghi cấu hình thực tế (model/OS/trình duyệt/RAM/DPR); mô phỏng trình duyệt **không** được tính là kiểm thử native.
- **Ngân sách (trần lập kế hoạch, không phải quyền chi):** G0–G1 2.000.000 VNĐ; G2–G4 10.000.000 VNĐ; G5–G6 12.000.000 VNĐ; tổng 24.000.000 VNĐ. Mục tiêu chi thực tế G0–G1 là 0 đồng. Không dùng dịch vụ trả phí hoặc phát sinh chi phí khi chưa được tác giả phê duyệt riêng.
