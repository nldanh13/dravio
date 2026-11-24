# ADR 0104 — Ancient Fantasy visual direction (GDD 3.2 addendum)

Trạng thái: **Định hướng tác giả yêu cầu; prototype triển khai chờ nghiệm thu**.
Kế thừa GDD 3.1, ADR 0005, 0101–0103 và 0012. Không thay đổi domain, tên dự án, tiền tệ, sinh học, di truyền, lore chính thức hay save.

## Nguồn và mục tiêu
Tác giả cung cấp ảnh thánh địa rồng ngập nắng và Art Bible (11 trang). Mục tiêu không phải ảnh concept tĩnh: gameplay thực tế phải có cùng cảm giác hand-painted, cổ tích, di tích đá phủ rêu, hoa, ánh sáng ấm và nhân vật chibi có chiều sâu.
Tỷ trọng định hướng: 40% cổ đại rêu phong, 40% đáng yêu rực rỡ, 20% phép thuật phát sáng. Đây là guideline thẩm mỹ, không phải tỷ lệ màu pixel.
Các nhân vật/cốt truyện mới trong Art Bible chỉ là tham chiếu, không tự động thay thế catalog 16 loài hoặc GDD.

## Quy chuẩn hình ảnh
- Hình tròn/elip cho rồng và thực vật; kiến trúc phong hóa có cạnh bo và vết nứt lớn; sừng/gai tù nhẹ.
- Đá xám ấm #B8B2A6 / #8E8A82 / #5A5D63; rêu #A8D84E / #5FA84D / #2E5936; ánh nắng #FFF6C2 / #FFD86B.
- Kiến trúc ít bão hòa, thiên nhiên trung bình, rồng và đối tượng tương tác nổi bật hơn. Không dùng màu là dấu hiệu duy nhất.
- Nguồn sáng chính trên trái, góc khoảng 35–45°, viền sáng mật ong hoặc lam trong hang, bóng pha xanh rêu/chàm/tím; không bóng đen cứng.
- Phân lớp foreground/midground/background; trung cảnh là vùng chơi, cảnh xa giảm tương phản. Cổ vật có thể tương tác dùng dấu hiệu rõ; trang trí không được giả làm nút.
- Kiến trúc có rêu, dây leo, hoa; mục tiêu phủ khoảng 30% ở asset production, tránh chi tiết gây nhiễu. Land: đền cổ; Ocean: di tích san hô; Sky: đền đảo nổi.
- Rồng tuân thủ anatomy từng loài và stage; không thêm cánh để giống concept. Giữ genotype/phenotype/Aether độc lập. Baby đầu lớn, mắt có catchlight, dáng thân thiện. Chấn thương không máu.
- UI giấy cổ màu #F5EFE0, đá #E6E1D6, gỗ ấm, nút xanh rêu/hổ phách, viền bo mềm; serif tiêu đề và sans dễ đọc VI/EN. Không thêm gem, premium shop, inbox, health bar giả hoặc nhiệm vụ giả vì concept có chúng.

## Triển khai lát cắt hiện tại
- HUD vàng và sức chứa thật từ snapshot; vùng chơi là nội dung chính.
- Bảng rồng hiển thị sprite đúng species/stage/mutation, bond và tiến độ trưởng thành, các lệnh feed/pet/focus/rename sẵn có.
- Bảng kho, catalog và save vẫn truy cập được, công cụ preview thử nghiệm trong DEV. Cảnh báo lưu trữ quan trọng vẫn hiển thị.
- CSS responsive, giữ kích thước canvas 16:9, các điều khiển camera và keyboard/touch của ADR 0012.
- meadow-ruins.svg là lớp minh họa kiến trúc nền độc lập 960×330, không chứa rồng sống, không thay đổi vị trí/vật cản; nguồn: vector mới tạo cho dự án, không dùng asset bên thứ ba. Trạng thái prototype.
- Không thay thế hay xóa bộ SVG đã duyệt. Đây là bản vector nâng chất liệu ban đầu, **không** phải art painterly đạt chuẩn thương mại.

## Pipeline tiếp theo (chưa triển khai)
1. Concept sheet Emberling và Sproutling theo anatomy, rồi 3 stage × 4 Aether; phê duyệt silhouette ở 64/128px và portrait.
2. Tài nguyên painterly tách lớp: hậu cảnh WebP; prop/rồng PNG hoặc WebP alpha; atlas hoạt ảnh; manifest width/height/anchor/hitbox/scale/origin/license. Đo kích thước tải và bộ nhớ ảnh đã giải mã. Chỉ compositing phenotype/Aether nếu có kiểm thử bảo toàn genotype.
3. Origin Meadow production-quality: kiến trúc, ánh sáng, props, môi trường, HUD, animations. Giữ world geometry hoặc cập nhật collision đồng thời khi đổi vị trí prop. Không flatten ảnh concept làm game.
4. Thay thế từng asset sau khi tác giả duyệt và kiểm thử; mở rộng sang các sinh cảnh khác. Không làm toàn bộ 16 loài trước khi slice được duyệt.
5. Tutorial PR5, HealthCase PR6, Passport PR7 theo ROADMAP; giữ giới hạn ngân sách.

## Nghiệm thu
- Desktop và màn hình dọc 360/390px, không overflow ngang; nút dễ bấm, chữ VI/EN rõ, reduced motion.
- Golden screenshot overview/focus, ngày/đêm, các stage/mutation; thao tác thật chọn/cho ăn/vuốt ve/đổi tên/camera, save/load và cảnh báo tab chỉ đọc.
- npm run typecheck, lint, test, build; renderer E2E, sau đó thiết bị Windows + Chromium thật.
- Không công bố đạt 60FPS thiết bị thật hoặc mỹ thuật thương mại khi chưa có bằng chứng.
- GDD 3.1 gốc được giữ nguyên. Tài liệu này là addendum cho GDD 3.2; bản DOCX hợp nhất là công việc riêng khi rà soát phiên bản.

## Nâng cấp kỹ thuật tiếp theo
- Script `npm run art:shade` tạo SVG gradient dẫn xuất cho Emberling/Sproutling (3 stage, 4 mutation, các pose hiện có); chạy trước dev/build/test. Không chỉnh sửa geometry, anchor, source SVG hoặc dữ liệu gene. Chỉ là prototype có ánh sáng và bóng mềm.
- Renderer ưu tiên PNG/WebP tác giả duyệt trong `src/assets/animations/painted/<species>/<stage>_<mutation>_<pose>.webp|png`, tiếp đến bản gradient, cuối cùng SVG gốc. Rồng hiển thị trên inspector dùng cùng idle frame.
- Sinh cảnh/props có đường dẫn tương ứng `src/assets/habitats/origin/painted/<habitatId>/<layer>.webp|png` và `painted/props/<propId>.webp|png`. Giữ tỉ lệ và anchor canonical; không có file thì tiếp tục dùng SVG. Lớp mid Meadow thay thế phải bao gồm di tích/tượng; khi có replacement không vẽ lớp shrine prototype chồng lên.
- Raster vẫn chưa được sản xuất/duyệt. Không dùng concept chứa rồng, chỉ số hoặc UI đóng cứng làm background. Sprite atlas/compositing genotype vẫn là công việc sau.
