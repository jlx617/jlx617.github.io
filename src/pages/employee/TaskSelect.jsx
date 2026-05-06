/**
 * 任务选择页 - 心工坊V2
 *
 * 员工在此页面选择要执行的任务模板，选择后跳转到工作台。
 * 支持响应式布局（桌面2列、移动端1列），卡片带悬浮/点击动效。
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getTemplates, getEmployees, initStore } from '../../data/store';

/* ========================================
   常量 & 配置
   ======================================== */

/** 类别对应的代表性 Emoji */
const CATEGORY_ICONS = {
  '餐饮': '🍽️',
  '零售': '🛒',
  '清洁': '🧹',
  '物流': '📦',
  '手作': '🎨',
};

/** 默认类别图标 */
const DEFAULT_CATEGORY_ICON = '📋';

/** 难度配置 */
const DIFFICULTY_CONFIG = {
  easy:   { label: '简单', color: '#4CAF50', bg: '#E8F5E9' },
  medium: { label: '中等', color: '#FF9800', bg: '#FFF3E0' },
  hard:   { label: '困难', color: '#F44336', bg: '#FFEBEE' },
};

/** 根据步骤数量推断难度 */
function inferDifficulty(stepCount) {
  if (stepCount <= 4) return 'easy';
  if (stepCount <= 7) return 'medium';
  return 'hard';
}

/** 响应式断点：低于此宽度切换为单列 */
const MOBILE_BREAKPOINT = 520;

/* ========================================
   自定义 Hook：监听窗口宽度实现响应式
   ======================================== */
function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
}

/* ========================================
   主组件
   ======================================== */
export default function TaskSelect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();

  // ---------- 状态 ----------
  const [templates, setTemplates] = useState([]);
  const [employeeName, setEmployeeName] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [loading, setLoading] = useState(true);

  // ---------- 从 URL 参数获取当前选中的模板 ----------
  const currentTemplateId = searchParams.get('templateId') || null;

  // ---------- 初始化 ----------
  useEffect(() => {
    initStore();

    // 加载模板列表
    const tplList = getTemplates();
    setTemplates(tplList || []);

    // 加载员工信息（默认取第一个员工）
    const employees = getEmployees();
    if (employees && employees.length > 0) {
      setEmployeeName(employees[0].name);
    }

    // 如果 URL 带有 templateId，标记为已选中
    if (currentTemplateId) {
      setSelectedId(currentTemplateId);
    }

    setLoading(false);
  }, []);

  // ---------- 选择任务 ----------
  const handleSelect = useCallback((templateId) => {
    setSelectedId(templateId);
    // 短暂延迟后跳转，让用户看到选中效果
    setTimeout(() => {
      navigate(`/employee?templateId=${templateId}`);
    }, 300);
  }, [navigate]);

  // ---------- 返回首页 ----------
  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // ---------- 计算网格样式（响应式） ----------
  const gridStyle = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
    gap: 16,
    padding: '12px 20px',
    maxWidth: 720,
    margin: '0 auto',
    boxSizing: 'border-box',
  }), [isMobile]);

  // ---------- 渲染：加载中 ----------
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingBox}>
          <div style={styles.loadingSpinner} />
          <p style={styles.loadingText}>正在加载任务列表...</p>
        </div>
      </div>
    );
  }

  // ---------- 渲染：无任务 ----------
  if (templates.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={handleBack}>
            ← 返回
          </button>
          <h1 style={styles.title}>选择任务</h1>
        </div>
        <div style={styles.emptyBox}>
          <span style={styles.emptyIcon}>📭</span>
          <p style={styles.emptyText}>暂无可用任务</p>
          <p style={styles.emptyHint}>请联系辅导员添加任务模板</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* ====== 顶部导航栏 ====== */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={handleBack}>
          ← 返回
        </button>
        <div style={styles.headerCenter}>
          <h1 style={styles.title}>选择任务</h1>
          {employeeName && (
            <span style={styles.employeeBadge}>
              {employeeName}
            </span>
          )}
        </div>
        <div style={styles.headerSpacer} />
      </div>

      {/* ====== 提示文字 ====== */}
      <p style={styles.hintText}>
        请选择一个任务开始工作
      </p>

      {/* ====== 任务卡片网格 ====== */}
      <div style={gridStyle}>
        {templates.map((tpl) => {
          const stepCount = tpl.steps ? tpl.steps.length : 0;
          const difficulty = inferDifficulty(stepCount);
          const diffCfg = DIFFICULTY_CONFIG[difficulty];
          const categoryIcon = CATEGORY_ICONS[tpl.category] || DEFAULT_CATEGORY_ICON;
          const isSelected = selectedId === tpl.id;
          const isHovered = hoveredId === tpl.id;

          // 动态合并卡片样式
          const cardStyle = {
            ...styles.card,
            ...(isSelected ? styles.cardSelected : {}),
            ...(isHovered && !isSelected ? styles.cardHover : {}),
          };

          return (
            <div
              key={tpl.id}
              onClick={() => handleSelect(tpl.id)}
              onMouseEnter={() => setHoveredId(tpl.id)}
              onMouseLeave={() => setHoveredId(null)}
              onTouchStart={() => setHoveredId(tpl.id)}
              onTouchEnd={() => setHoveredId(null)}
              role="button"
              tabIndex={0}
              aria-label={`选择任务：${tpl.name}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(tpl.id);
                }
              }}
              style={cardStyle}
            >
              {/* 选中勾选标记 */}
              {isSelected && (
                <div style={styles.checkmark}>
                  ✓
                </div>
              )}

              {/* 类别图标 */}
              <div style={styles.cardIcon}>
                {categoryIcon}
              </div>

              {/* 任务名称 */}
              <h2 style={styles.cardName}>
                {tpl.name}
              </h2>

              {/* 类别标签 */}
              <span style={styles.cardCategory}>
                {tpl.category || '通用'}
              </span>

              {/* 信息行：步骤数 + 难度 */}
              <div style={styles.cardMeta}>
                <span style={styles.cardSteps}>
                  {stepCount} 个步骤
                </span>
                <span
                  style={{
                    ...styles.cardDifficulty,
                    color: diffCfg.color,
                    backgroundColor: diffCfg.bg,
                  }}
                >
                  {diffCfg.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ====== 底部安全间距 ====== */}
      <div style={styles.bottomSpacer} />
    </div>
  );
}

/* ========================================
   内联样式
   ======================================== */
const styles = {
  /* 页面容器 */
  container: {
    minHeight: '100vh',
    backgroundColor: '#F5F7FA',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    paddingBottom: 24,
  },

  /* 加载状态 */
  loadingBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 16,
  },
  loadingSpinner: {
    width: 40,
    height: 40,
    border: '4px solid #E0E0E0',
    borderTopColor: '#5B8DEF',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
  },

  /* 空状态 */
  emptyBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 20,
    color: '#555',
    fontWeight: 600,
  },
  emptyHint: {
    fontSize: 14,
    color: '#999',
  },

  /* 顶部导航栏 */
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #E8ECF0',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  headerSpacer: {
    width: 64,
  },

  /* 返回按钮 */
  backBtn: {
    padding: '8px 16px',
    fontSize: 16,
    color: '#5B8DEF',
    backgroundColor: 'transparent',
    border: '1px solid #5B8DEF',
    borderRadius: 20,
    cursor: 'pointer',
    fontWeight: 500,
    minWidth: 64,
    minHeight: 48,
    lineHeight: '32px',
    textAlign: 'center',
    transition: 'all 0.2s ease',
  },

  /* 页面标题 */
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: '#333',
  },

  /* 员工名称标签 */
  employeeBadge: {
    fontSize: 13,
    color: '#888',
    backgroundColor: '#F0F2F5',
    padding: '2px 12px',
    borderRadius: 10,
  },

  /* 提示文字 */
  hintText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginTop: 20,
    marginBottom: 8,
    paddingLeft: 20,
    paddingRight: 20,
  },

  /* 任务卡片 */
  card: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: '24px 20px 20px',
    cursor: 'pointer',
    border: '2px solid transparent',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    minHeight: 160,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    boxSizing: 'border-box',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    outline: 'none',
  },

  /* 卡片悬浮效果 */
  cardHover: {
    transform: 'translateY(-4px) scale(1.02)',
    boxShadow: '0 8px 24px rgba(91, 141, 239, 0.15)',
    borderColor: '#B8D4FF',
  },

  /* 卡片选中效果 */
  cardSelected: {
    borderColor: '#5B8DEF',
    backgroundColor: '#F0F6FF',
    boxShadow: '0 4px 16px rgba(91, 141, 239, 0.2)',
    transform: 'scale(1.02)',
  },

  /* 选中勾选标记 */
  checkmark: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: '50%',
    backgroundColor: '#5B8DEF',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },

  /* 卡片图标 */
  cardIcon: {
    fontSize: 40,
    lineHeight: 1,
    marginBottom: 4,
  },

  /* 卡片任务名称 */
  cardName: {
    margin: 0,
    fontSize: 17,
    fontWeight: 600,
    color: '#333',
    lineHeight: 1.3,
  },

  /* 卡片类别标签 */
  cardCategory: {
    fontSize: 12,
    color: '#888',
    backgroundColor: '#F0F2F5',
    padding: '2px 10px',
    borderRadius: 8,
    fontWeight: 500,
  },

  /* 卡片信息行 */
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 4,
  },

  /* 步骤数 */
  cardSteps: {
    fontSize: 13,
    color: '#666',
  },

  /* 难度标签 */
  cardDifficulty: {
    fontSize: 12,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 8,
    lineHeight: 1.4,
  },

  /* 底部安全间距（避免被手机底部遮挡） */
  bottomSpacer: {
    height: 40,
  },
};
