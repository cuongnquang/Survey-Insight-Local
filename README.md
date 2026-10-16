# Survey Insight Local

Bảng phân tích khảo sát chạy hoàn toàn cục bộ trên trình duyệt. Đọc dữ liệu từ **Excel/CSV** (tệp) hoặc **Google Sheets** (chỉ đọc), phân tích từng câu hỏi, tự động vẽ biểu đồ và xuất báo cáo **PDF/Excel**. Không có máy chủ trung gian — dữ liệu khảo sát không rời khỏi máy của bạn.

> Giao diện và tài liệu bằng tiếng Việt.

## Tính năng chính

- **Nhập dữ liệu** từ `.xlsx/.xls/.csv/.tsv` và Google Sheets. Tự phát hiện hàng tiêu đề, loại câu hỏi, dấu phân tách nhiều lựa chọn và nhóm câu hỏi lưới (`Câu hỏi [hàng]`).
- **Phân tích từng câu hỏi**: đếm hợp lệ/trống/không hợp lệ, thống kê thang điểm, phân bố lựa chọn, từ khóa câu trả lời tự luận, phát hiện trùng lặp và nhóm câu trả lời tương tự.
- **Biểu đồ tự động** (Chart.js) với tùy chọn đổi loại biểu đồ và xuất PNG từng câu hỏi.
- **Bộ lọc** dùng chung cho KPI, bảng và biểu đồ: từ khóa, khoảng ngày, nhóm giá trị, điều kiện nâng cao.
- **Xuất báo cáo**: PDF có biểu đồ + bảng (nhúng font **Roboto** đóng gói sẵn, không cần mạng) và Excel nhiều sheet.
- **Đồng bộ Google Sheets** theo mã phản hồi ổn định hoặc so khớp nội dung; dòng trùng nội dung luôn được giữ là các phản hồi riêng biệt.
- **Lưu cục bộ** bằng IndexedDB. Báo cáo PDF và toàn bộ tính năng phân tích hoạt động offline sau khi tải lần đầu; font giao diện (IBM Plex, Space Grotesk) tải từ Google Fonts ở lần đầu và được trình duyệt lưu đệm, nếu không có mạng giao diện vẫn dùng được với font thay thế.

## Yêu cầu

- Node.js 20+ (đã kiểm thử với Node 24) và npm. Node chỉ dùng làm dev server; ứng dụng là HTML/CSS/JS thuần (ES Modules), **không** dùng React/Vue/Angular.

## Cài đặt & chạy

```bash
npm install
npm run dev      # mở dev server (Vite), thường tại http://localhost:5173
```

Các lệnh khác:

```bash
npm run build    # đóng gói vào dist/
npm run preview  # xem thử bản build
npm test         # chạy kiểm thử (Vitest)
npm run lint     # kiểm tra mã (ESLint)
```

> Lưu ý: npm có thể chặn script cài đặt của `esbuild`. Nếu `npm install` báo lỗi liên quan, chạy `npm install-scripts approve esbuild` rồi cài lại.

## Hướng dẫn sử dụng nhanh

1. Mở **Nguồn dữ liệu** → **Nhập từ tệp** và chọn tệp khảo sát, hoặc **Nhập từ Google Sheets** (cần cấu hình trước — xem [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md)).
2. Ở bước **Cấu hình cột**, kiểm tra loại câu hỏi đã nhận diện; chỉnh nếu cần rồi xác nhận.
3. Xem **Tổng quan**, **Phân tích câu hỏi**, **Dữ liệu phản hồi**. Dùng thanh lọc phía trên để thu hẹp phạm vi.
4. Bấm **Xuất báo cáo** ở trang Phân tích câu hỏi để tạo PDF hoặc Excel (có thể chọn toàn bộ dữ liệu hoặc theo bộ lọc hiện tại).

## Nguyên tắc xử lý dữ liệu

- **Không bao giờ sửa hay xóa dữ liệu nguồn.** Nhập và đồng bộ chỉ đọc.
- **Hai dòng trùng nội dung là hai phản hồi riêng.** Không dùng băm nội dung làm mã định danh.
- **Ưu tiên mã phản hồi ổn định** do nguồn cung cấp để cập nhật đúng dòng khi đồng bộ; nếu không có, dùng so khớp đa tập (multiset).
- **Khi không chắc loại câu hỏi**, cột được để ở trạng thái “Chưa xác định” để người dùng chọn thủ công.
- **Không dùng dịch vụ AI/dịch thuật bên ngoài** để xử lý nội dung văn bản.
- **Tỷ lệ phần trăm câu hỏi nhiều lựa chọn** tính trên số người trả lời hợp lệ; tổng có thể vượt 100% và được ghi chú rõ trong giao diện.
- **Bộ lọc áp dụng nhất quán** cho KPI, bảng và biểu đồ. Báo cáo có thể xuất toàn bộ dữ liệu hoặc chỉ dữ liệu đã lọc.

## Cấu trúc thư mục

```
index.html              # khung ứng dụng (sidebar, topbar, view, modal, toast)
src/
  main.js               # điểm khởi động
  styles.css            # hệ thống thiết kế (tokens + component)
  core/                 # constants, model, values, dates, store (IndexedDB), state, actions, filters
  import/               # parse (Excel/CSV), detect (loại câu hỏi), normalize (dựng dataset)
  analysis/             # stats, text (từ khóa/nhóm), analyze (theo câu hỏi/lưới), overview
  charts/               # renderer (Chart.js): chọn loại, dựng spec, xuất ảnh
  integrations/         # googleAuth, googleSheets, sync (diff), syncEngine
  export/               # pdf (jsPDF), excel (SheetJS), download
  ui/                   # dom, toast, modal, filtersBar, importWizard, questionCard, exportDialog, app
  ui/pages/             # overview, questions, responses, sources, settings
tests/                  # kiểm thử Vitest cho các module thuần
docs/GOOGLE_SETUP.md    # hướng dẫn tạo OAuth Client ID
public/fonts/           # font Roboto đóng gói cho PDF (offline) + LICENSE (OFL 1.1)
```

## Công nghệ

HTML5, CSS3, JavaScript ES Modules, [Chart.js](https://www.chartjs.org/), [SheetJS (xlsx)](https://sheetjs.com/), [Papa Parse](https://www.papaparse.com/), [jsPDF](https://github.com/parallax/jsPDF), IndexedDB, Google Identity Services + Google Sheets API. Dev: [Vite](https://vitejs.dev/), [Vitest](https://vitest.dev/), [ESLint](https://eslint.org/).

## Quyền riêng tư & bảo mật

- Không có **client secret** trong mã nguồn hay trong trình duyệt; chỉ dùng OAuth Client ID công khai.
- **Token Google** chỉ tồn tại trong bộ nhớ phiên và có thể thu hồi bất cứ lúc nào (nút *Ngắt kết nối & thu hồi quyền*).
- Token **không** được ghi log và **không** xuất hiện trong báo cáo.
- Ứng dụng chỉ yêu cầu quyền tối thiểu: `spreadsheets.readonly` cho bảng tính.
- Báo cáo PDF/Excel không chứa token hay thông tin đăng nhập.

## Ghi chú về `npm audit`

`npm audit` báo một số cảnh báo, trong đó gói `xlsx@0.18.5` có lỗi mức cao/critical. Đây là công cụ chạy **cục bộ trên máy người dùng**, không có backend dùng chung, nên rủi ro được chấp nhận. Không dùng ứng dụng này để xử lý tệp từ nguồn không tin cậy trên máy chủ công cộng.

## Giấy phép

Dự án nội bộ, dùng cho mục đích cục bộ.

Font **Roboto** đóng gói trong `public/fonts/` phát hành theo [SIL Open Font License 1.1](public/fonts/LICENSE.txt) (qua Google Fonts).
