# ADR 0105 — Emberling 360° inspection prototype

Trạng thái: **Prototype / đề xuất nghiệm thu**.
Tác giả xác nhận thử nghiệm nhân vật xoay 360°, không xoay camera tự do. Kế thừa GDD 3.1, ADR 0012, ADR 0104 (PR #15) và PR #16 (Tutorial).

## Phạm vi
- Môi trường vẫn 2.5D với camera theo sinh cảnh, zoom/focus hiện có; không thay Renderer thế giới.
- Khi chọn Emberling, mở/đóng panel Quan sát 3D. Đây là mẫu Baby Normal, không phải kết quả phenotype của cá thể được chọn.
- Mô hình xyz thực, bốn chân, không cánh, đuôi lửa tròn, không sừng ở Baby. Đổ sáng và depth test. Camera orthographic cố định; chỉ quay model quanh trục đứng.
- Chuột/cảm ứng kéo ngang, slider 0–359°, nút ±30° và reset. Không auto-spin, không tự thay đổi camera thế giới.
- Chỉ tạo WebGL context khi mở panel; không chạy loop riêng. Vẽ khi thao tác/resize; giới hạn DPR 2; cleanup buffer/program/listeners. Khi mất context hoặc không hỗ trợ thì dùng sprite 2D có thông báo.
- Không đổi GameState, RNG, commands, kinh tế, save schema v4, tutorial, genotype hoặc ID loài.
- Không thêm thư viện/dịch vụ trả phí. Prototype dùng native WebGL thay vì Three.js do chưa xác minh được dependency/lockfile trong môi trường triển khai. Quyết định công nghệ production vẫn mở.

## Nghiệm thu prototype
- Kiểm tra góc 0/90/180/270/359°, mặt trước/hông/sau khác nhau, không cắt đuôi.
- Chuột/touch, bàn phím qua slider, reset, mở/đóng lặp, context loss/fallback, thiết bị 360px.
- Kiểm tra tutorial, tương tác rồng, save/load không bị ảnh hưởng.
- Kiểm tra typecheck, lint, test, build, WebGL thực tế trên desktop và mobile. Unit test chỉ xác minh hình học và góc; không thay cho kiểm thử đồ họa.
- Art hiện là procedural mesh đơn giản, chưa có rig, texture painterly, mesh production, hoạt ảnh xương, GLB, phenotype/Aether hoặc tổn thương 3D.

## Sau khi tác giả duyệt
Thử nghiệm GLB/glTF rigged Emberling có texture hand-painted theo Art Bible. Cân nhắc Three.js + lazy loader, ánh sáng cố định, shader phenotype/Aether, vùng cơ thể có ID phục vụ chăm sóc. Tách layer inspector 3D khỏi renderer thế giới; chỉ xem xét nhân vật 3D trong scene hoặc PixiJS sau khi benchmark. Không nhân rộng 16 loài trước khi mẫu đạt chất lượng.

## GLB export
- Chạy `npm run art:export:emberling` sau khi cài dependencies. File `art-exports/emberling-baby-normal.glb` được sinh tại máy local; có thể nhập vào Blender để chỉnh sửa hình thể.
- GLB 2.0 độc lập, mesh tam giác, màu đỉnh, normals đơn vị, winding hướng ngoài, loại mặt suy biến. Không có rig/UV/texture/animation. Không phải model production.
- Có thể truyền đường dẫn khác qua `npm run art:export:emberling -- my-model.glb`.
- Viewer WebGL hiện tại vẫn dùng mesh canonical; chưa tích hợp GLB loader hoặc Three.js. Cần nghiệm thu bằng Blender và trình duyệt thật trước khi chọn pipeline production.
