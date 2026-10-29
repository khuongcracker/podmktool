// Dấu cho biết đang đứng ở bản nào: local hay bản đã deploy.
//
// Vì sao cần: hai bản chạy cùng một giao diện, nhưng DB tách hẳn (local ở
// ./data/app.db, deploy ở volume /data). Mở hai tab cạnh nhau rồi thao tác nhầm
// bản là chuyện sớm muộn — và mấy việc như xoá tài khoản thì không lùi được.
//
// CỐ Ý hiện dấu ở CẢ HAI bản chứ không chỉ cảnh báo ở local: chỉ đánh dấu một
// bên thì bên kia là "không có dấu", mà không có dấu còn có nghĩa là trang chưa
// tải xong hay bản cũ trước khi có tính năng này. Hai dấu rõ ràng thì không có
// khoảng xám nào.
export default function EnvBadge({ build }) {
  if (!build?.env) return null
  const live = build.env === 'production'
  const title = [
    live ? 'Bản đã deploy — dữ liệu thật của người dùng' : 'Bản chạy trên máy này — dữ liệu riêng, không đụng bản deploy',
    build.version && 'v' + build.version,
    build.commit,
    build.branch && 'nhánh ' + build.branch,
  ].filter(Boolean).join(' · ')

  return (
    <span className={live ? 'envbadge live' : 'envbadge local'} title={title}>
      {live ? 'LIVE' : 'LOCAL'}
    </span>
  )
}
