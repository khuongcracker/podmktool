# Backend Podmktool

Auth · proxy AI (giấu key) · đo thời gian đăng nhập và chi phí API từng người.

## Vì sao có backend

Trước đây app là frontend-only, user tự dán key vào localStorage. Khi deploy bằng **key của công ty** thì cách đó không dùng được: key nằm trong browser thì ai mở DevTools cũng lấy được và xài bằng tiền công ty. Có backend rồi mới giấu được key — và mới đo được usage thật.

## Chạy

```bash
cd server
npm install
cp .env.example .env        # điền GEMINI_API_KEY
npm run dev                 # hoặc npm start
```

Mặc định `http://localhost:8787`. Không có dependency native — `node:sqlite` và `node:crypto` đều là đồ có sẵn của Node (cần **Node ≥ 22.5**, máy hiện tại 24).

## Cấp account

Không có tự đăng ký — admin cấp.

```bash
npm run cli -- add <username> <password> [admin]
npm run cli -- passwd <username> <password-mới>
npm run cli -- lock <username>
npm run cli -- unlock <username>
npm run cli -- list
```

## API

| Method | Route | Quyền | Việc |
|---|---|---|---|
| POST | `/api/login` | — | đăng nhập, set cookie httpOnly |
| POST | `/api/logout` | — | đóng phiên, ghi `end_reason='logout'` |
| GET | `/api/me` | user | thông tin phiên hiện tại |
| POST | `/api/gemini` | user | proxy `{model, body}` → Gemini |
| POST | `/api/openai` | user | proxy `{model, body}` → OpenAI |
| GET | `/api/my-history` | user | lịch sử gọi API của chính mình |
| GET | `/api/admin/users` | admin | danh sách account |
| POST | `/api/admin/users` | admin | tạo 1 account |
| POST | `/api/admin/users/bulk` | admin | import danh sách; `mode: 'skip'` (mặc định) hoặc `'update'` (đặt lại pass user đã có) |
| POST | `/api/admin/users/bulk-action` | admin | khoá/mở · đổi pass · đổi vai trò · **xoá** trên mảng `usernames` |
| GET | `/api/admin/users/export` | admin | xuất CSV danh sách (`?usernames=a,b` để lọc) |
| GET | `/api/admin/sessions` | admin | thời lượng đăng nhập từng người |
| GET | `/api/admin/usage` | admin | lượt gen + chi phí từng người |
| GET | `/api/health` | — | trạng thái cấu hình |

Báo cáo nhận `?from=YYYY-MM-DD&to=YYYY-MM-DD`, mặc định 30 ngày gần nhất.

### Biến môi trường chỉnh được

| Biến | Mặc định | Việc |
|---|---|---|
| `LOGIN_WINDOW_MS` | `600000` (10 phút) | cửa sổ đếm lần đăng nhập sai |
| `LOGIN_MAX_PER_USER` | `10` | trần lần sai cho MỘT tài khoản từ một IP — đây là lớp chặn dò mật khẩu thật |
| `LOGIN_MAX_PER_IP` | `100` | trần lần sai cho cả một IP — nới rộng vì cả văn phòng chung một IP NAT |
| `SESSION_IDLE_MIN` | `480` (8h) | phiên không hoạt động bao lâu thì hết hạn |
| `MAX_INFLIGHT_IMAGE` | `6` | số request sinh ảnh chạy cùng lúc, DÙNG CHUNG mọi user; vượt thì xếp hàng |
| `UPSTREAM_TIMEOUT_MS` | `120000` | chờ upstream bao lâu thì cắt |

`bulk-action` trả kết quả **từng dòng** (`deleted` | `locked` | `unlocked` |
`password` | `role` | `skipped` | `error`) chứ không fail cả mẻ — một user hỏng
không được chặn 20 user còn lại. Hai luật chặn nằm ở đây, không chép đi đâu khác:
không tự khoá/xoá/hạ quyền chính mình, và không bỏ admin hoạt động cuối cùng.

**Xoá là xoá hẳn**: user + phiên đăng nhập + `usage_events` của người đó
(`foreign_keys` đang bật nên không dọn con thì xoá cha sẽ fail). Báo cáo 30 ngày
mất luôn phần chi phí của họ — muốn giữ số liệu thì khoá, đừng xoá.

Pass ngẫu nhiên (`{"action":"password","randomPassword":true}`) trả về plaintext
đúng **một lần** trong response; scrypt một chiều, không hỏi lại được.

CSV export **không có cột mật khẩu** — file để đối chiếu/bàn giao, không phải bản
sao lưu khôi phục đăng nhập được.

## Ba quyết định thiết kế đáng nhớ

**1. Lưu số liệu thô, KHÔNG lưu thành tiền.** `usage_events` chỉ ghi token và số ảnh. Tiền tính lúc **đọc** báo cáo từ `pricing.js`. Nhờ vậy sửa bảng giá là toàn bộ lịch sử cũ tự tính lại đúng. Lưu tiền cứng vào DB là khoá chết vào giá của hôm ghi.

**2. Chưa có giá thì báo "chưa cấu hình", không hiện 0 USD.** `pricing.js` để trống có chủ đích — không bịa giá API. Tổng chi phí chỉ cộng phần đã có giá, số dòng chưa có giá đếm riêng ở `unpricedRows` để không ai nhìn nhầm tổng thiếu thành tổng đủ.

**3. Phiên chưa đóng tính tới `last_seen_at`, không tới "bây giờ".** Ai mở tab rồi bỏ đó 3 ngày sẽ không thành "đăng nhập 72 giờ". Phiên quá `SESSION_IDLE_MIN` tự đóng với `end_reason='expired'`, phân biệt rõ với `logout` thật.

## Bảo mật

- Key AI chỉ ở `process.env`, không có đường nào ra browser.
- Cookie `httpOnly` + `sameSite=lax`. Deploy sau HTTPS thì đặt `SECURE_COOKIE=1`.
- Mật khẩu hash bằng scrypt + salt riêng từng user; so sánh theo thời gian hằng định.
- Login sai vẫn chạy hash để thời gian phản hồi không tiết lộ username nào tồn tại.
- Danh sách model cho phép nằm ở `proxy.js#ALLOWED` — frontend không thể gọi model tuỳ ý. **Thêm model mới phải sửa cả đây và `src/providers/models.js`.**
- `.env` và `data/` đã gitignore.

## Đã xong (từng nằm ở mục "còn thiếu")

- **Chống brute-force** — `ratelimit.js`, cửa sổ trượt 15 phút, 5 lần sai / (IP+username) và 20 lần / IP, trả 429 kèm số phút phải chờ. Đếm trong bộ nhớ một tiến trình; chạy nhiều instance sau load balancer thì phải chuyển sang store dùng chung.
- **Frontend đã nối backend** — không còn key localStorage, có màn `Login.jsx`, mọi lượt gọi đi qua `src/api.js`.

## Còn thiếu (chưa làm)

- **`pricing.js` chưa điền giá** — báo cáo chi phí trả `pricingConfigured:false`. Đây là lý do duy nhất tính năng "đo chi phí từng người" chưa ra được số tiền, dù token đã ghi đủ.
- **Hạn mức** chi phí theo người — hiện chỉ đo, chưa chặn.
- Chưa có UI xem báo cáo — mới có API (`/api/admin/sessions`, `/api/admin/usage`).
