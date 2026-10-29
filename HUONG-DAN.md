# Podmktool — Hướng dẫn sử dụng

Web app sinh **mockup sản phẩm POD** và **creative quảng cáo Facebook** từ mockup đó.
Tất cả ảnh render bằng Gemini (Nano Banana Pro). Text gửi cho model luôn tiếng Anh;
giao diện đổi 🇻🇳/🇬🇧 bằng cờ ở góc trên phải.

- **Chạy:** backend phục vụ luôn frontend ở `http://localhost:8787`
  (`cd server && npm start`). Sửa code frontend phải `npm run build` lại.
- **Đăng nhập bắt buộc** (tool không mở đăng ký; tài khoản do admin cấp).
- **Tỉ lệ hiện khoá 1:1** cho mọi công cụ (tạm thời).

Thanh tab: **🟡 New Mockup · 🔵 Ads FB · 🔒 Redesign** (Redesign đang khoá).

---

## 🟡 Tab New Mockup

Sinh nhiều ảnh mockup cho 1 sản phẩm. Có **2 chế độ** (công tắc góc trên khu Preview):

| Chế độ | Dùng khi |
|---|---|
| **🎛️ Tùy biến** | Tự kiểm soát số lượng, góc camera, phối cảnh từng ảnh |
| **🎬 Lifestyle Combo** | Bấm 1 phát ra **5 cảnh chuẩn** của team, không cần chỉnh |

> Đổi chế độ sẽ **xoá kết quả** đang có (2 chế độ không dùng chung lưới ảnh). Có nút **✕ Xoá kết quả** để dọn tay.

### Input (khối trên cùng, dùng chung 2 chế độ)

| Thành phần | Vào (In) | Ra (Out) |
|---|---|---|
| **Công tắc nguồn** 🔗 Link store / 📝 Dán text | chọn cách nạp thông tin | hiện ô tương ứng |
| Ô **Link** (khi chọn Link store) | URL sản phẩm (Shopify/store) | tool cào content + og:image |
| Ô **Dán text** (khi chọn Text) | cụm mô tả sản phẩm tiếng Việt (công năng / mục đích / target audience) | AI breakdown thành content |
| **Main Ref + 4 Sub Ref** (upload/Từ link) | ảnh sản phẩm gốc | dùng làm reference để gen bám đúng sản phẩm |

> Nguồn **Text bắt buộc upload ảnh sản phẩm** (text không có ảnh). Nguồn Link tự lấy og:image.

### Sidebar (setup) — các panel

| Panel | Chức năng | In | Out |
|---|---|---|---|
| **I · Content** | thông tin sản phẩm | nút *Chỉ tạo content tự động* đọc link/ảnh/text | Tên, Danh mục, Chủ đề thiết kế, Đặc điểm, Mô tả — **sửa tay được** |
| **II · Info bổ sung** *(chỉ Tùy biến)* | vật liệu, kích thước, sản xuất, orientation, placement + câu so sánh kích thước + độ chiếm khung | tick "bỏ qua" để AI tự suy, hoặc nhập tay | dùng cho scale control khi gen |
| **III · Prompt** *(chỉ Tùy biến)* | prompt gốc sinh ảnh | nút *Tạo prompt tự động* | ô prompt sửa tay được |

### 🎥 Góc camera *(chỉ Tùy biến, dải trên lưới ảnh)*

- 16 ô **thumbnail** minh hoạ góc (khung + bố cục + chấm màu focus).
- Chấm màu: **xanh tím = tôn công năng · xanh lá = tôn design · xám = cả hai**.
- Nút nhanh: **Đa dạng** (bộ 8 mặc định) · **Tất cả** (16) · **Bỏ hết** (AI tự mix).
- Bộ góc đã chọn được **phân bổ đều** cho N ảnh.

### IV · Phối cảnh *(cột trái cạnh lưới ảnh)*

- Ô **Niche / target audience**.
- *(Tùy biến)* nút **Gợi ý N phối cảnh tự động**.
- Mỗi dòng phối cảnh: **chip shot** (Cận / Vừa / Xa / Người) đổi là prompt đổi theo · nút **↻** tối ưu lại riêng dòng đó qua AI · ô text scene sửa tay.
- *(Combo)* hiện đúng **5 dòng** cảnh chuẩn (badge vàng, không có chip shot).

### Thanh Output + nút gen

| Nút | Chế độ | Chức năng |
|---|---|---|
| **Số lượng: 1/ảnh · Theo ref** | Tùy biến | 1 sản phẩm/ảnh, hoặc bám đúng số sản phẩm có trong ref (ref 3 đĩa → 3) |
| **Count (1–10)** | Tùy biến | số ảnh gen |
| **⚡ Auto toàn bộ · L2P / T2P** | Tùy biến | full pipeline từ input → ảnh (L2P = Link→ảnh, T2P = Text→ảnh) |
| **🖼️ Chỉ tạo ảnh (N)** | Tùy biến | gen lại ảnh từ content/scene/prompt **đã có** (disable khi chưa có prompt) |
| **🎬 Tạo Combo (5 cảnh)** | Combo | full-auto 5 cảnh chuẩn team |

**5 cảnh chuẩn của Combo:** ① Cận + BG hợp niche · ② Model người bên cạnh · ③ Chụp xa nhiều BG · ④ Cầm tay / trao tặng · ⑤ Design hero + đúng công năng (đặt đúng nơi dùng thật, background theo công năng, hợp lý vật lý).

### Nút trên mỗi ảnh kết quả (tile)

| Nút | Chức năng |
|---|---|
| **BG** | đổi background, giữ sản phẩm |
| **− / +** | thu / phóng sản phẩm trong ảnh |
| **↻** | tạo lại ảnh đó |
| **★** | đặt làm ảnh chuẩn (đẩy lên Main Ref) |
| **S+** | đưa vào ô Sub Ref trống |
| **→Ad** | **gửi ảnh này sang tab Ads FB** (lưu cố định) |
| **⤓ Download** | tải ảnh · **Tải tất cả · ZIP** ở đầu khu |

---

## 🔵 Tab Ads FB

Biến 1 mockup thành **creative chạy quảng cáo Facebook** = mockup (giữ nguyên) + **lớp chữ marketing**.
Bố cục 2 cột: **trái = nhập · phải = ref + tạo + kết quả**.

> Luật cứng: **chữ không bao giờ đè lên sản phẩm** — chỉ đặt vào vùng trống.

### Input — 3 phần (chỉ Mockup bắt buộc)

| Bước | In | Ghi chú |
|---|---|---|
| **I · Mockup base** | ảnh từ tab Mockup (bấm **→Ad**) hoặc **upload** | chọn **1** ảnh; hover có **×** để bỏ; ảnh đã gửi **lưu cố định** kể cả khi bên Mockup gen ảnh khác |
| **II · Yêu cầu add-in** | mô tả cần thêm gì | có toggle **Auto / Manual** |
| **III · Ref** *(không bắt buộc)* | 2 ảnh mẫu | **Ref tổng thể** (style cả ad) + **Ref helptext** (riêng cho badge/helptext) |

### Bước II — Auto vs Manual

- **Auto:** gõ 1 ô **brief** (hoặc để trống) → bấm **Tạo**, AI tự tách lớp + viết copy.
  Bấm **✦ Phân tích** để AI bóc brief ra các ô rồi tự nhảy sang Manual xem/sửa.
- **Manual:** tự điền từng lớp:
  - **Headline** (chữ lớn) · **Text** (dòng phụ)
  - **Helptext — nội dung** (câu CTA, vd "Customize your design")
  - **Helptext — style** (kiểu badge/khung/màu/font)
  - **Helptext — vị trí**: Auto + 6 ô (góc trên-trái/trên/trên-phải · dưới-trái/dưới/dưới-phải)
  - *(để trống lớp nào thì bỏ qua lớp đó)*

### Ref (cột phải)

| Ref | Tác dụng |
|---|---|
| **Ref tổng thể** | AI học **style cả ad** (font/màu/bố cục) rồi **vẽ lại mới, nét** (không copy pixel) |
| **Ref helptext** | AI làm **helptext/badge giống đúng ảnh mẫu này** |

### Tạo + Output (cột phải)

| Thành phần | In | Out |
|---|---|---|
| **Số mẫu (1–4)** | số creative | mỗi mẫu 1 bố cục khác (nếu không có ref) |
| **⚡ Tạo creative (N)** | bấm gen | ảnh đổ ra khu **Kết quả** ngay dưới |
| **Kết quả** | — | grid ảnh, mỗi ảnh có **⤓ Tải** |

---

## 🔒 Tab Redesign

Đang **khoá** (pipeline chưa đạt), để sau cùng.

---

## Ghi chú kỹ thuật

- **Mockup giữ nguyên tuyệt đối** khi sang Ads (chỉ overlay chữ).
- **Match-ref & Combo bỏ qua QA scale** (tỉ lệ 1-sản-phẩm không áp cho nhiều đơn vị).
- Ảnh Gemini có watermark ẩn SynthID (không tắt được).
- Đọc link có thể fail nếu site chặn bot → nhập text tay hoặc upload ảnh.
- Đổi tỉ lệ (mở lại ratio khác): đặt `LOCK_RATIO = null` trong `src/shared.js`.
