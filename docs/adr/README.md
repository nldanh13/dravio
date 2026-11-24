# ADR — quy ước đánh số

Hai luồng làm việc song song ghi ADR vào cùng thư mục. Để tránh trùng số:

| Dải | Luồng | Ví dụ |
|---|---|---|
| `0001`–`0099` | Game Engine / World Engine / dữ liệu / lưu game | 0008 Zone Khởi Nguyên, 0009 mở khóa sinh cảnh, 0010 sửa lỗi PR4 |
| `0101`–`0199` | Art / Technical Art / Animation / UI asset | 0101 sprite Common, 0102 hoạt ảnh rồng |

Trước khi tạo ADR mới: xem `main` **và** các branch đang mở (`git ls-tree --name-only origin/<branch> docs/adr/`) rồi lấy số kế tiếp trong dải của mình.

Lịch sử: ADR 0101/0102 trước đây đánh số 0008/0009 và trùng với ADR 0008/0009 của Game Engine trên `main`; đã đổi số ngày 24/11/2026 (nội dung không đổi).
