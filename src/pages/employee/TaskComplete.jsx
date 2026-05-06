/**
 * 任务完成庆祝页 - 心工坊V2
 *
 * 全屏庆祝页面，展示任务完成信息：
 * - 五彩纸屑CSS动画
 * - 大号庆祝emoji和文字
 * - 任务名称与用时统计
 * - 星星评级动画
 * - 自动倒计时回到首页
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Workstation.css';

/** 纸屑颜色列表 */
const CONFETTI_COLORS = [
  '#e74c3c', '#f39c12', '#2ecc71', '#3498db',
  '#9b59b6', '#e91e63', '#00bcd4', '#ff5722',
  '#ffeb3b', '#8bc34a',
];

/** 生成纸屑数据 */
function generateConfetti(count = 60) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    width: `${Math.random() * 8 + 6}px`,
    height: `${Math.random() * 8 + 6}px`,
    borderRadius: Math.random() > 0.5 ? '50%' : '2px',
    duration: `${Math.random() * 2 + 2}s`,
    delay: `${Math.random() * 2}s`,
  }));
}

/**
 * TaskComplete 组件
 * @param {Object} props
 * @param {string} props.taskName - 任务名称
 * @param {number} props.totalSteps - 总步骤数
 * @param {number} props.duration - 用时（秒）
 * @param {number} props.starCount - 星星评级数量（1-5）
 * @param {Function} [props.onRestart] - 重新开始回调
 * @param {Function} [props.onBackHome] - 返回首页回调
 * @param {number} [props.countdownSeconds=10] - 自动倒计时秒数
 */
export default function TaskComplete({
  taskName = '任务',
  totalSteps = 0,
  duration = 0,
  starCount = 5,
  onRestart,
  onBackHome = null,
  countdownSeconds = 10,
}) {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(countdownSeconds);

  // 生成纸屑数据（只生成一次）
  const confettiData = useMemo(() => generateConfetti(60), []);

  // 倒计时逻辑
  useEffect(() => {
    if (countdown <= 0) {
      // 不再强制进入下一题，而是返回首页
      if (onBackHome) {
        onBackHome();
      }
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, onBackHome]);

  // 格式化用时
  const formatDuration = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}秒`;
    return `${mins}分${secs}秒`;
  }, []);

  return (
    <div className="task-complete">
      {/* 五彩纸屑 */}
      <div className="task-complete__confetti-container">
        {confettiData.map((item) => (
          <div
            key={item.id}
            className="task-complete__confetti"
            style={{
              left: item.left,
              backgroundColor: item.color,
              width: item.width,
              height: item.height,
              borderRadius: item.borderRadius,
              animationDuration: item.duration,
              animationDelay: item.delay,
            }}
          />
        ))}
      </div>

      {/* 庆祝内容 */}
      <div className="task-complete__content">
        {/* 大号庆祝emoji */}
        <div className="task-complete__emoji">🎉</div>

        {/* 庆祝标题 */}
        <div className="task-complete__title">太棒了！</div>

        {/* 任务名称 */}
        <div className="task-complete__task-name">{taskName}</div>

        {/* 用时统计 */}
        <div className="task-complete__stats">
          <div className="task-complete__stat">
            <span className="task-complete__stat-value">{totalSteps}</span>
            <span className="task-complete__stat-label">完成步骤</span>
          </div>
          <div className="task-complete__stat">
            <span className="task-complete__stat-value">
              {formatDuration(duration)}
            </span>
            <span className="task-complete__stat-label">总用时</span>
          </div>
        </div>

        {/* 星星评级 */}
        <div className="task-complete__stars">
          {[1, 2, 3, 4, 5].map((star) => (
            <span
              key={star}
              className={`task-complete__star ${
                star <= starCount ? 'task-complete__star--active' : ''
              }`}
              style={{ animationDelay: `${star * 0.2}s` }}
            >
              ★
            </span>
          ))}
        </div>

        {/* 倒计时提示 */}
        <div className="task-complete__next-hint">任务已完成！</div>
        <div className="task-complete__next-countdown">
          {countdown}秒后自动返回首页...
        </div>

        {/* 返回首页按钮 */}
        <div className="task-complete__actions">
          <button
            className="task-complete__btn task-complete__btn--home"
            onClick={() => { if (onBackHome) onBackHome(); }}
          >
            🏠 返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
