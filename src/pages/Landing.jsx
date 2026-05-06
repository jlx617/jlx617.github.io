import { Link } from 'react-router-dom'
import './Landing.css'

/**
 * 心工坊V2 - 角色选择首页
 * 员工入口和辅导员入口
 */
export default function Landing() {
  return (
    <div className="landing">
      {/* === 标题区域 === */}
      <div className="landing__header">
        <span className="landing__logo">🧠</span>
        <h1 className="landing__title">心工坊 AI主动引导系统</h1>
        <p className="landing__subtitle">让AI陪伴每一位心智障碍者完成工作</p>
      </div>

      {/* === 角色选择卡片 === */}
      <div className="landing__cards">
        {/* 员工入口 */}
        <Link to="/employee" className="landing__card landing__card--employee">
          <span className="landing__card-icon">🧑‍💼</span>
          <h2 className="landing__card-title">我是员工</h2>
          <p className="landing__card-desc">
            AI主动引导，无需操作
          </p>
          <span className="landing__card-btn landing__card-btn--employee">
            进入工作台
          </span>
        </Link>

        {/* 辅导员入口 */}
        <Link to="/counselor" className="landing__card landing__card--counselor">
          <span className="landing__card-icon">👩‍🏫</span>
          <h2 className="landing__card-title">我是辅导员</h2>
          <p className="landing__card-desc">
            实时监控，远程介入
          </p>
          <span className="landing__card-btn landing__card-btn--counselor">
            进入监控台
          </span>
        </Link>
      </div>

      {/* === 底部版本信息 === */}
      <div className="landing__footer">
        <p className="landing__version">V2.0 — AI主动引导，员工零操作</p>
      </div>
    </div>
  )
}
