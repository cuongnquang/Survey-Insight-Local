# Cấu hình Google Sheets

Survey Insight Local đọc dữ liệu Google Sheets **chỉ đọc**, trực tiếp từ trình duyệt bằng Google Identity Services (GIS) và Google Sheets API v4. Không có backend trung gian. Bạn cần tạo một **OAuth Client ID** và dán vào phần **Cài đặt** của ứng dụng.

## 1. Tạo project & bật API

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/).
2. Tạo một project mới (hoặc chọn project có sẵn).
3. Vào **APIs & Services → Library**, tìm **Google Sheets API** và bấm **Enable**.

## 2. Cấu hình màn hình đồng ý OAuth

1. Vào **APIs & Services → OAuth consent screen**.
2. Chọn **External** (hoặc **Internal** nếu dùng Google Workspace nội bộ).
3. Điền tên ứng dụng, email hỗ trợ và email liên hệ.
4. Ở phần **Scopes**, thêm scope:
   - `https://www.googleapis.com/auth/spreadsheets.readonly`
   - `openid`, `email`, `profile` (dùng để hiển thị tài khoản đang kết nối)
5. Ở phần **Test users**, thêm địa chỉ Gmail bạn sẽ dùng để kiểm thử (bắt buộc khi ứng dụng còn ở trạng thái *Testing*).

## 3. Tạo OAuth Client ID

1. Vào **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type**: chọn **Web application**.
3. **Authorized JavaScript origins** — thêm đúng địa chỉ ứng dụng chạy:
   - `http://localhost:5173` (Vite dev server mặc định)
   - Nếu Vite dùng cổng khác, thêm cổng tương ứng (ví dụ `http://localhost:5174`).
   - Nếu chạy `npm run preview`, thêm cổng preview (mặc định `http://localhost:4173`).
4. **Authorized redirect URIs**: không cần cho luồng token này (GIS dùng popup), nhưng nếu console yêu cầu, có thể thêm chính origin như trên.
5. Bấm **Create** và **sao chép Client ID** (dạng `xxxxxxxx.apps.googleusercontent.com`).

> Không dùng và không cần **Client secret**. Không dán secret vào ứng dụng.

## 4. Nhập Client ID vào ứng dụng

1. Mở Survey Insight Local → **Cài đặt**.
2. Dán Client ID vào ô **OAuth Client ID** và bấm **Lưu Client ID**.
3. Chuyển sang **Nguồn dữ liệu** → bấm **Kết nối Google** và cấp quyền trong cửa sổ popup.
4. Sau khi kết nối, bấm **Nhập từ Google Sheets**, dán URL (hoặc ID) bảng tính, chọn sheet và nhập dữ liệu.

## 5. Đồng bộ lại dữ liệu

- Trong **Nguồn dữ liệu → Cấu hình bộ dữ liệu đang dùng**, nếu bộ dữ liệu đến từ Google Sheets sẽ có nút **Đồng bộ ngay**.
- Nếu đã cấu hình **Mã phản hồi**, ứng dụng sẽ khớp theo mã để cập nhật đúng dòng (thêm/cập nhật/xóa).
- Nếu chưa có mã phản hồi, ứng dụng so khớp theo **nội dung (multiset)** — dòng trùng nội dung vẫn được giữ là các phản hồi riêng biệt.

## 6. Thu hồi quyền & bảo mật

- Token chỉ nằm trong bộ nhớ phiên làm việc, **không** ghi log, **không** lưu vào báo cáo.
- Bấm **Ngắt kết nối & thu hồi quyền** ở trang Nguồn dữ liệu để thu hồi token ngay lập tức.
- Bạn cũng có thể thu hồi quyền tại [trang quyền truy cập tài khoản Google](https://myaccount.google.com/permissions).
- Bảng tính phải cho tài khoản đã kết nối quyền **xem** (Viewer hoặc cao hơn).

## Khắc phục sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| “Chưa cấu hình Google OAuth Client ID” | Chưa nhập Client ID | Nhập ở **Cài đặt** và lưu |
| Popup báo lỗi `redirect_uri_mismatch` / `origin mismatch` | Origin chưa được thêm vào Authorized JavaScript origins | Thêm đúng địa chỉ `http://localhost:<cổng>` |
| `403` khi đọc bảng tính | Google Sheets API chưa bật, hoặc tài khoản không có quyền xem | Bật API; chia sẻ bảng tính cho tài khoản đã kết nối |
| `401` khi đồng bộ | Token hết hạn | Bấm **Kết nối Google** lại |
| App ở trạng thái *Testing* chặn tài khoản | Tài khoản chưa nằm trong Test users | Thêm vào **Test users** ở OAuth consent screen |

> Khi phát triển cục bộ, hãy dùng đúng origin mà Vite in ra ở terminal (ví dụ `http://localhost:5173`) và khai báo origin đó trong Google Cloud Console.
