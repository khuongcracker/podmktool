// Bộ icon dùng chung — MỘT lưới, MỘT độ dày nét, MỘT kiểu đầu nét.
//
// Vì sao không dùng emoji: Windows thiếu glyph cho rất nhiều emoji nên ra ô
// vuông; emoji còn đổi hình theo hệ điều hành và theo phiên bản, không kiểm
// soát được diện mạo. Cờ quốc gia là ví dụ kinh điển — xem Flags.jsx.
//
// Quy ước:
//   - lưới 24×24, nét 2 (ở cỡ hiển thị 16px sẽ ra ~1.33px — đúng tỉ lệ chuẩn)
//   - stroke="currentColor" → tự ăn màu chữ, đúng ở cả theme sáng lẫn tối
//   - fill="none" trừ vài icon đặc (dấu sao khi đã chọn)
//   - aria-hidden: icon ở đây LUÔN đi kèm chữ hoặc kèm aria-label của nút cha
//
// Thêm icon mới: giữ nguyên viewBox và strokeWidth. Một khái niệm chỉ được có
// một icon; một icon không được mang hai nghĩa.

const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
})

export const IcImage = ({ size = 16 }) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 16l-5-5-4.5 4.5L9 13l-6 6" />
  </svg>
)

export const IcMegaphone = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
    <path d="M15 8.5a4 4 0 0 1 0 7" />
    <path d="M18 6a8 8 0 0 1 0 12" />
  </svg>
)

export const IcLock = ({ size = 16 }) => (
  <svg {...base(size)}>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)

export const IcSliders = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M5 20v-7M5 9V4M12 20v-9M12 7V4M19 20v-4M19 12V4" />
    <circle cx="5" cy="11" r="2" /><circle cx="12" cy="9" r="2" /><circle cx="19" cy="14" r="2" />
  </svg>
)

export const IcFilm = ({ size = 16 }) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M3 15h18M8 4v16M16 4v16" />
  </svg>
)

export const IcBolt = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
  </svg>
)

export const IcRefresh = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M20 11a8 8 0 1 0-1.6 5.6" />
    <path d="M20 5v6h-6" />
  </svg>
)

export const IcStar = ({ size = 16, filled = false }) => (
  <svg {...base(size)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />
  </svg>
)

export const IcGear = ({ size = 16 }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0V21a1.6 1.6 0 0 0-2.7-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.4H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.4 7.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.7a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.2 1z" />
  </svg>
)

export const IcDownload = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
  </svg>
)

export const IcLink = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5" />
    <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5L12.5 17" />
  </svg>
)

export const IcText = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M5 5h14M5 5v2M19 5v2M12 5v14M9 19h6" />
  </svg>
)

export const IcSparkle = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3z" />
    <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
  </svg>
)

export const IcCamera = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M3 8h3l1.5-2h5L14 8h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7z" />
    <circle cx="11.5" cy="13" r="3.2" />
  </svg>
)

export const IcClose = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>
)

export const IcCheck = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M4 12.5l5 5L20 6.5" /></svg>
)

export const IcAlert = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M12 4L2.5 20h19L12 4z" />
    <path d="M12 10v4M12 17.2v.1" />
  </svg>
)

export const IcSearch = ({ size = 16 }) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
  </svg>
)

export const IcPalette = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5c0-3.9-4-7-9-7z" />
    <circle cx="7.5" cy="11.5" r="1" /><circle cx="11" cy="7.5" r="1" /><circle cx="15.5" cy="9" r="1" />
  </svg>
)

export const IcArrowRight = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M4 12h15M13 6l6 6-6 6" /></svg>
)

export const IcArrowUp = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M12 20V5M6 11l6-6 6 6" /></svg>
)

export const IcMinus = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M5 12h14" /></svg>
)

export const IcPlus = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>
)

export const IcStop = ({ size = 16 }) => (
  <svg {...base(size)}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
)

export const IcDiamond = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M12 3l9 9-9 9-9-9 9-9z" /></svg>
)

// ---- Thêm 2026-08-20 cho bố cục ba cột: nút có nhãn đổi theo trạng thái
// phải thành icon cỡ cố định, nên cần đủ icon cho từng thao tác.

export const IcPencil = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M4 20h4L20 8l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
)

export const IcTrash = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
)

export const IcKey = ({ size = 16 }) => (
  <svg {...base(size)}><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M15.5 12v2.4" /></svg>
)

export const IcUnlock = ({ size = 16 }) => (
  <svg {...base(size)}><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 017.5-2" /></svg>
)

export const IcLogout = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M14 4H6v16h8" /><path d="M18 12H10m8 0l-3-3m3 3l-3 3" /></svg>
)

export const IcShrink = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M9 4v5H4M15 20v-5h5" /><path d="M4 20l5-5M20 4l-5 5" /></svg>
)

export const IcGrow = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M14 4h6v6M10 20H4v-6" /><path d="M20 4l-6 6M4 20l6-6" /></svg>
)

// Mũi gập panel. Dùng SVG chứ không dùng ký tự ▸: ký tự hình học phụ thuộc
// font, máy thiếu glyph là ra ô vuông — đúng lý do đã cấm emoji làm icon.
export const IcChevron = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M9 6l6 6-6 6" strokeLinejoin="round" /></svg>
)

// "Chạy tiếp từ đây": vạch mốc + mũi chạy về sau. Phân biệt với IcBolt
// (chỉ chạy đúng bước này) bằng cái vạch đứng ở đầu.
export const IcPlayFrom = ({ size = 16 }) => (
  <svg {...base(size)}>
    <path d="M5 5v14" />
    <path d="M9 6l8 6-8 6z" strokeLinejoin="round" />
  </svg>
)

// Logo Facebook. Cố ý là NGOẠI LỆ của bộ icon nét-2: đây là nhãn hiệu, vẽ
// theo kiểu nét mảnh sẽ không còn nhận ra. Dùng đúng để chỉ chỗ nối với
// Facebook, không phải để nhận là của Facebook.
// Cái loa cũ nói "quảng cáo" chung chung, trong khi việc ở đây là ra creative
// chạy trên ĐÚNG một nền tảng.
export const IcFacebook = ({ size = 16 }) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="18" height="18" rx="4.5" />
    <path
      fill="currentColor"
      stroke="none"
      d="M13.55 19v-5.4h1.81l.29-2.11h-2.1V10.2c0-.61.17-1.02 1.04-1.02h1.13V7.29c-.2-.03-.87-.09-1.65-.09-1.63 0-2.75 1-2.75 2.83v1.46H9.5v2.11h1.82V19z"
    />
  </svg>
)

export const IcDots = ({ size = 16 }) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
  </svg>
)
