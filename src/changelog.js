// Changelog hiện NGAY TRONG APP.
//
// Vì sao để trong mã nguồn chứ không phải file ngoài hay repo riêng: nó đi
// chung bundle, nên nội dung người dùng đọc LUÔN khớp với bản họ đang chạy.
// Đặt ở nơi khác thì có ngày người ta đọc mô tả của bản 1.3 trong khi trình
// duyệt còn đang chạy bản 1.1.
//
// CHANGELOG[0].version là NGUỒN SỰ THẬT cho số phiên bản hiện ra trên giao diện.
// Nhớ bump luôn `package.json` cho khớp — chỗ đó nuôi /api/health.
//
// SONG NGỮ: mỗi mục có `vi` và `en`, đổi theo cờ ngôn ngữ của giao diện.
// Bản `en` dùng cho changelog công khai
// (xem `scripts/gen-changelog.mjs`).
//
// ⚠️ CHỈ NÓI VỀ APP: phiên bản, tính năng, thay đổi. KHÔNG đưa vào đây:
//   - lý do nội bộ ("để tiết kiệm chi phí", "vì công ty đi chung đường mạng")
//   - quy ước làm việc, tên commit, tên file, tên hàm
//   - tên miền, tên người, số tiền, chi tiết hạ tầng — repo kia CÔNG KHAI
// Người đọc là đồng nghiệp đang dùng tool. Họ cần biết CÁI GÌ ĐỔI và CÓ PHẢI
// LÀM GÌ KHÔNG — không cần biết bên trong bàn nhau thế nào.
//
// kind: 'new' (tính năng/thay đổi) · 'fix' (sửa lỗi) · 'warn' (phải để ý)
// Bôi đậm bằng **…** — tự parse trong WhatsNew.jsx, không kéo thư viện markdown.

export const CHANGELOG = [
  {
    version: '1.2.0',
    date: { vi: '21/08/2026', en: '21 Aug 2026' },
    title: { vi: 'Gọn lại phần chọn model', en: 'Simplified model selection' },
    items: [
      {
        kind: 'new',
        vi: 'Tài khoản thường giờ chạy cố định **Gemini 3.1 Pro** để phân tích và **Nano Banana 2** để vẽ ảnh.',
        en: 'Standard accounts now run a fixed pair of models: **Gemini 3.1 Pro** for analysis and **Nano Banana 2** for image generation.',
      },
      {
        kind: 'new',
        vi: 'Ô chọn model thay bằng dòng chữ ghi rõ đang dùng model nào.',
        en: 'The model dropdown is replaced by a read-only label showing which models are in use.',
      },
      {
        kind: 'new',
        vi: 'Quản trị viên vẫn chọn được đầy đủ model.',
        en: 'Administrators keep full model selection.',
      },
      {
        kind: 'fix',
        vi: 'Model đã chọn từ trước tự được đưa về mặc định — không phải làm gì.',
        en: 'Any previously selected model is reset to the default automatically — no action needed.',
      },
    ],
  },
  {
    version: '1.1.1',
    date: { vi: '21/08/2026', en: '21 Aug 2026' },
    title: { vi: 'Vẽ ảnh nhanh hơn', en: 'Faster image generation' },
    items: [
      {
        kind: 'new',
        vi: 'Model vẽ ảnh mặc định đổi sang **Nano Banana 2** — nhanh hơn hẳn, chất lượng tương đương.',
        en: 'Default image model changed to **Nano Banana 2** — noticeably faster, with comparable output quality.',
      },
    ],
  },
  {
    version: '1.1.0',
    date: { vi: '21/08/2026', en: '21 Aug 2026' },
    title: { vi: 'Giao diện mới · sửa nhiều lỗi khó chịu', en: 'New interface and reliability fixes' },
    items: [
      {
        kind: 'warn',
        vi: 'Tool đã **đổi địa chỉ**. Cần đăng nhập lại, và lịch sử phiên cũ không theo sang. Tài khoản và mật khẩu vẫn nguyên.',
        en: 'The tool has **moved to a new address**. You will need to sign in again, and past session history does not carry over. Accounts and passwords are unchanged.',
      },
      {
        kind: 'new',
        vi: 'Bảng màu mới — xanh mực chuyển mint. Nút bấm có chiều sâu, bấm xuống thấy lún.',
        en: 'New colour scheme — deep blue to mint. Buttons have depth and respond when pressed.',
      },
      {
        kind: 'new',
        vi: 'Công tắc **Auto / Manual** thành dạng viên thuốc có con trượt, phân biệt rõ với công tắc nguồn bên cạnh.',
        en: 'The **Auto / Manual** switch is now a sliding toggle, visually distinct from the source switch beside it.',
      },
      {
        kind: 'new',
        vi: 'Nút giao diện sáng/tối **tách làm hai**: một nút bám theo cài đặt máy, một nút đổi sáng-tối trực tiếp.',
        en: 'Theme control **split into two buttons**: one follows your system setting, one switches light and dark directly.',
      },
      {
        kind: 'new',
        vi: 'Tab **Content FB**: khu **Mockup base** và **Yêu cầu add-in** nằm cạnh nhau — không phải cuộn mới thấy khu thứ hai.',
        en: '**Content FB** tab: **Mockup base** and **What to add** now sit side by side — no scrolling to reach the second panel.',
      },
      {
        kind: 'fix',
        vi: 'Gõ sai mật khẩu không còn khoá đăng nhập của người khác cùng mạng.',
        en: 'Failed sign-in attempts no longer lock out other people on the same network.',
      },
      {
        kind: 'fix',
        vi: 'Hết phiên giữa chừng thì được đưa về màn đăng nhập kèm lý do, thay vì một dòng lỗi chung chung.',
        en: 'An expired session now returns you to the sign-in screen with the reason shown, instead of a generic error.',
      },
      {
        kind: 'new',
        vi: 'Quản trị: chọn nhiều tài khoản rồi khoá / mở / đổi mật khẩu / đổi vai trò / xoá / xuất danh sách trong một lần.',
        en: 'Admin: select multiple accounts to lock, unlock, reset passwords, change roles, delete, or export — all in one action.',
      },
    ],
  },
  {
    version: '1.0.0',
    date: { vi: '20/08/2026', en: '20 Aug 2026' },
    title: { vi: 'Bản đầu tiên', en: 'Initial release' },
    items: [
      {
        kind: 'new',
        vi: 'Hai tab: **New Mockup** sinh ảnh mockup sản phẩm, **Content FB** sinh creative quảng cáo từ mockup đó.',
        en: 'Two tabs: **New Mockup** for product mockup images, and **Content FB** for ad creatives built from a mockup.',
      },
      {
        kind: 'new',
        vi: 'Hai chế độ chạy: **Auto** bấm một nút chạy hết, **Manual** chạy và chạy lại từng bước.',
        en: 'Two run modes: **Auto** runs every step from one button, **Manual** runs and re-runs individual steps.',
      },
      {
        kind: 'new',
        vi: 'Nạp thông tin sản phẩm từ **link store** hoặc **dán text**.',
        en: 'Load product details from a **store link** or **pasted text**.',
      },
      {
        kind: 'new',
        vi: 'Huỷ được giữa lượt chạy. Lịch sử phiên tự lưu.',
        en: 'Cancel a run in progress. Session history is saved automatically.',
      },
      {
        kind: 'new',
        vi: 'Tự kiểm soát tỉ lệ sản phẩm — ảnh sai cỡ thì vẽ lại.',
        en: 'Automatic product-scale control — images are re-generated when the product appears at the wrong size.',
      },
    ],
  },
]

export const CURRENT_VERSION = CHANGELOG[0].version
