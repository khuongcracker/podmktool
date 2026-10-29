// Quản trị account từ terminal — "cấp account" theo yêu cầu: admin tạo,
// KHÔNG có tự đăng ký.
//
//   node --env-file=.env cli.js add <username> <password> [admin]
//   node --env-file=.env cli.js passwd <username> <password-mới>
//   node --env-file=.env cli.js lock|unlock <username>
//   node --env-file=.env cli.js list
import { createUser, findUser, setUserActive, listUsers, db } from './db.js'
import { hashPassword } from './auth.js'

const [cmd, a, b, c] = process.argv.slice(2)

function die(msg) {
  console.error('✗ ' + msg)
  process.exit(1)
}

switch (cmd) {
  case 'add': {
    if (!a || !b) die('Dùng: cli.js add <username> <password> [admin]')
    if (b.length < 8) die('Mật khẩu tối thiểu 8 ký tự.')
    if (findUser(a)) die(`Tài khoản "${a}" đã tồn tại.`)
    const { salt, hash } = hashPassword(b)
    createUser(a, hash, salt, c === 'admin' ? 'admin' : 'user')
    console.log(`✓ Đã tạo "${a}"${c === 'admin' ? ' (admin)' : ''}`)
    break
  }
  case 'passwd': {
    if (!a || !b) die('Dùng: cli.js passwd <username> <password-mới>')
    if (b.length < 8) die('Mật khẩu tối thiểu 8 ký tự.')
    if (!findUser(a)) die(`Không có tài khoản "${a}".`)
    const { salt, hash } = hashPassword(b)
    db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE username = ?').run(hash, salt, a)
    console.log(`✓ Đã đổi mật khẩu "${a}"`)
    break
  }
  case 'lock':
  case 'unlock': {
    if (!a) die(`Dùng: cli.js ${cmd} <username>`)
    if (!findUser(a)) die(`Không có tài khoản "${a}".`)
    setUserActive(a, cmd === 'unlock')
    console.log(`✓ Đã ${cmd === 'lock' ? 'khoá' : 'mở khoá'} "${a}"`)
    break
  }
  case 'list': {
    const rows = listUsers()
    if (!rows.length) {
      console.log('(chưa có tài khoản nào)')
    } else {
      console.table(
        rows.map((r) => ({
          id: r.id, username: r.username, role: r.role,
          trang_thai: r.active ? 'hoat dong' : 'da khoa',
          luot_login: r.logins, luot_goi_API: r.calls, tao_luc: r.created_at,
        }))
      )
    }
    break
  }
  default:
    console.log(`Quản trị account Podmktool

  node --env-file=.env cli.js add <username> <password> [admin]
  node --env-file=.env cli.js passwd <username> <password-mới>
  node --env-file=.env cli.js lock <username>
  node --env-file=.env cli.js unlock <username>
  node --env-file=.env cli.js list`)
}
