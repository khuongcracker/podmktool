import { IcAlert } from './Icons.jsx'
import { Component } from 'react'

// Bắt lỗi render của cây con -> hiện thông báo thay vì màn hình đen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="errboundary">
          <h3>Lỗi hiển thị {this.props.name || ''}</h3>
          <pre>{String(this.state.error?.message || this.state.error)}</pre>
          <button className="btn" onClick={() => this.setState({ error: null })}>Thử lại</button>
        </div>
      )
    }
    return this.props.children
  }
}
