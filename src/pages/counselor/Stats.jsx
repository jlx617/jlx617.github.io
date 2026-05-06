import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllSessionLogs, getEmployees } from '../../data/store'

/**
 * 辅导员统计报表页面
 * 展示所有员工当日工作统计数据，包括汇总卡片和员工明细表格
 */

/* --- 情绪颜色映射 --- */
const EMOTION_COLORS = {
  '开心': '#4CAF50',
  '平静': '#2196F3',
  '困惑': '#FF9800',
  '沮丧': '#f44336',
  '焦虑': '#FF5722',
  '疲惫': '#9E9E9E',
  '兴奋': '#E91E63',
}

/* --- 格式化日期为中文 --- */
function formatDateCN(date) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const w = weekDays[date.getDay()]
  return `${y}年${m}月${d}日 星期${w}`
}

/* --- 格式化秒数为可读时间 --- */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0秒'
  if (seconds < 60) return `${Math.round(seconds)}秒`
  const min = Math.floor(seconds / 60)
  const sec = Math.round(seconds % 60)
  if (min < 60) return sec > 0 ? `${min}分${sec}秒` : `${min}分钟`
  const hr = Math.floor(min / 60)
  const remainMin = min % 60
  return `${hr}小时${remainMin}分钟`
}

/* --- 判断是否为今天的日志 --- */
function isToday(timestamp) {
  const logDate = new Date(timestamp)
  const now = new Date()
  return (
    logDate.getFullYear() === now.getFullYear() &&
    logDate.getMonth() === now.getMonth() &&
    logDate.getDate() === now.getDate()
  )
}

export default function Stats() {
  const navigate = useNavigate()
  const [employees, setEmployees] = useState([])
  const [allLogs, setAllLogs] = useState([])

  /* --- 加载数据 --- */
  useEffect(() => {
    try {
      setEmployees(getEmployees() || [])
      setAllLogs(getAllSessionLogs() || [])
    } catch (err) {
      console.error('加载统计数据失败:', err)
    }
  }, [])

  /* --- 筛选今日日志 --- */
  const todayLogs = useMemo(() => {
    return allLogs.filter(log => isToday(log.time))
  }, [allLogs])

  /* --- 按员工分组计算统计数据 --- */
  const employeeStats = useMemo(() => {
    const statsMap = {}

    // 初始化每个员工的统计
    employees.forEach(emp => {
      statsMap[emp.id] = {
        employeeId: emp.id,
        name: emp.name,
        type: emp.type || '未分类',
        tasksCompleted: 0,
        stepsCompleted: 0,
        helpRequests: 0,
        errorCount: 0,
        stepTimes: [],        // 每步耗时（秒）
        emotions: {},         // 情绪分布计数
        lastStepTime: null,   // 上次步骤完成时间
      }
    })

    // 遍历今日日志计算统计
    const sortedLogs = [...todayLogs].sort(
      (a, b) => new Date(a.time) - new Date(b.time)
    )

    sortedLogs.forEach(log => {
      const empId = log.employeeId
      if (!statsMap[empId]) return

      const stat = statsMap[empId]

      // 步骤完成
      if (log.type === 'step_complete') {
        stat.stepsCompleted += 1

        // 计算步骤耗时
        const logTime = new Date(log.time).getTime()
        if (stat.lastStepTime) {
          const elapsed = (logTime - stat.lastStepTime) / 1000
          if (elapsed > 0 && elapsed < 3600) { // 过滤异常值（超过1小时的忽略）
            stat.stepTimes.push(elapsed)
          }
        }
        stat.lastStepTime = logTime
      }

      // 任务完成（通过内容判断或特定类型）
      if (log.type === 'step_complete' && log.content && (
        log.content.includes('任务完成') ||
        log.content.includes('全部完成') ||
        log.content.includes('恭喜')
      )) {
        stat.tasksCompleted += 1
      }

      // 帮助请求
      if (log.type === 'alert' && log.content && (
        log.content.includes('帮助') ||
        log.content.includes('求助') ||
        log.content.includes('需要帮助') ||
        log.content.includes('help')
      )) {
        stat.helpRequests += 1
      }

      // 错误计数
      if (log.type === 'alert' && log.content && (
        log.content.includes('错误') ||
        log.content.includes('error') ||
        log.content.includes('异常') ||
        log.content.includes('失败')
      )) {
        stat.errorCount += 1
      }

      // 情绪记录（从 state_change 或 status 日志中提取）
      if (log.type === 'state_change' || log.type === 'status') {
        const content = log.content || ''
        Object.keys(EMOTION_COLORS).forEach(emotion => {
          if (content.includes(emotion)) {
            stat.emotions[emotion] = (stat.emotions[emotion] || 0) + 1
          }
        })
      }
    })

    // 如果没有通过内容检测到任务完成，则用步骤数估算（假设每个任务6步）
    Object.values(statsMap).forEach(stat => {
      if (stat.tasksCompleted === 0 && stat.stepsCompleted > 0) {
        stat.tasksCompleted = Math.floor(stat.stepsCompleted / 6)
        if (stat.stepsCompleted % 6 !== 0 && stat.stepsCompleted >= 6) {
          // 不额外加，保持保守估计
        }
      }
    })

    return Object.values(statsMap)
  }, [employees, todayLogs])

  /* --- 汇总统计 --- */
  const summary = useMemo(() => {
    const totalTasks = employeeStats.reduce((sum, s) => sum + s.tasksCompleted, 0)
    const totalSteps = employeeStats.reduce((sum, s) => sum + s.stepsCompleted, 0)
    const totalHelp = employeeStats.reduce((sum, s) => sum + s.helpRequests, 0)

    // 平均完成时间：所有步骤耗时的平均值
    const allStepTimes = employeeStats.flatMap(s => s.stepTimes)
    const avgTime = allStepTimes.length > 0
      ? allStepTimes.reduce((sum, t) => sum + t, 0) / allStepTimes.length
      : 0

    // 完成最多的员工
    const topEmployee = employeeStats.reduce((best, s) => {
      if (!best || s.stepsCompleted > best.stepsCompleted) return s
      return best
    }, null)

    return {
      totalTasks,
      totalSteps,
      avgTime,
      totalHelp,
      topEmployeeName: topEmployee && topEmployee.stepsCompleted > 0
        ? topEmployee.name
        : '暂无',
    }
  }, [employeeStats])

  /* --- 情绪分布百分比计算 --- */
  const getEmotionDistribution = (emotions) => {
    const total = Object.values(emotions).reduce((sum, c) => sum + c, 0)
    if (total === 0) return null

    const result = []
    // 按数量降序排列
    const sorted = Object.entries(emotions).sort((a, b) => b[1] - a[1])
    sorted.forEach(([emotion, count]) => {
      const pct = Math.round((count / total) * 100)
      result.push({
        emotion,
        count,
        pct,
        color: EMOTION_COLORS[emotion] || '#999',
      })
    })
    return result
  }

  /* --- 有数据的员工列表 --- */
  const activeEmployees = employeeStats.filter(
    s => s.stepsCompleted > 0 || s.helpRequests > 0 || s.errorCount > 0
  )

  const hasData = todayLogs.length > 0

  /* ==================== 渲染 ==================== */
  return (
    <div style={styles.container}>
      {/* === 顶部导航 === */}
      <header style={styles.header}>
        <button
          style={styles.backBtn}
          onClick={() => navigate('/counselor')}
        >
          ← 返回
        </button>
        <div style={styles.headerTitle}>心工坊 · 统计报表</div>
        <div style={styles.dateDisplay}>{formatDateCN(new Date())}</div>
      </header>

      {!hasData ? (
        /* === 无数据状态 === */
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📊</div>
          <div style={styles.emptyText}>暂无数据</div>
          <div style={styles.emptyHint}>今日暂无工作记录，请等待员工开始工作</div>
        </div>
      ) : (
        <>
          {/* === 汇总统计卡片 === */}
          <div style={styles.summaryRow}>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: '#4CAF50' }}>
                {summary.totalTasks}
              </div>
              <div style={styles.summaryLabel}>今日完成任务</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: '#2196F3' }}>
                {summary.totalSteps}
              </div>
              <div style={styles.summaryLabel}>今日完成步骤</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: '#FF9800' }}>
                {formatDuration(summary.avgTime)}
              </div>
              <div style={styles.summaryLabel}>平均每步耗时</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: '#f44336' }}>
                {summary.totalHelp}
              </div>
              <div style={styles.summaryLabel}>今日求助次数</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: '#9C27B0' }}>
                {summary.topEmployeeName}
              </div>
              <div style={styles.summaryLabel}>完成最多员工</div>
            </div>
          </div>

          {/* === 员工明细表格 === */}
          <div style={styles.tableSection}>
            <div style={styles.tableTitle}>员工工作明细</div>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>员工姓名</th>
                    <th style={styles.th}>类型</th>
                    <th style={{ ...styles.th, textAlign: 'center' }}>完成任务</th>
                    <th style={{ ...styles.th, textAlign: 'center' }}>完成步骤</th>
                    <th style={{ ...styles.th, textAlign: 'center' }}>平均每步耗时</th>
                    <th style={{ ...styles.th, textAlign: 'center' }}>求助次数</th>
                    <th style={{ ...styles.th, textAlign: 'center' }}>错误次数</th>
                    <th style={styles.th}>情绪分布</th>
                  </tr>
                </thead>
                <tbody>
                  {activeEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={styles.emptyTd}>
                        暂无员工工作记录
                      </td>
                    </tr>
                  ) : (
                    activeEmployees.map((stat) => {
                      const avgStepTime = stat.stepTimes.length > 0
                        ? stat.stepTimes.reduce((s, t) => s + t, 0) / stat.stepTimes.length
                        : 0
                      const emotionDist = getEmotionDistribution(stat.emotions)

                      return (
                        <tr key={stat.employeeId} style={styles.tr}>
                          <td style={styles.td}>
                            <span style={styles.empName}>{stat.name}</span>
                          </td>
                          <td style={styles.td}>
                            <span style={styles.empType}>{stat.type}</span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center' }}>
                            <span style={styles.number}>{stat.tasksCompleted}</span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center' }}>
                            <span style={styles.number}>{stat.stepsCompleted}</span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center' }}>
                            <span style={styles.duration}>
                              {formatDuration(avgStepTime)}
                            </span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center' }}>
                            <span style={{
                              ...styles.number,
                              color: stat.helpRequests > 0 ? '#FF9800' : '#999',
                            }}>
                              {stat.helpRequests}
                            </span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center' }}>
                            <span style={{
                              ...styles.number,
                              color: stat.errorCount > 0 ? '#f44336' : '#999',
                            }}>
                              {stat.errorCount}
                            </span>
                          </td>
                          <td style={styles.td}>
                            {emotionDist ? (
                              <div style={styles.emotionBar}>
                                {emotionDist.map((e) => (
                                  <div
                                    key={e.emotion}
                                    style={{
                                      ...styles.emotionSegment,
                                      width: `${e.pct}%`,
                                      backgroundColor: e.color,
                                    }}
                                    title={`${e.emotion}: ${e.pct}%`}
                                  />
                                ))}
                                <div style={styles.emotionLabels}>
                                  {emotionDist.map((e) => (
                                    <span
                                      key={e.emotion}
                                      style={{ ...styles.emotionLabel, color: e.color }}
                                    >
                                      {e.emotion} {e.pct}%
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <span style={styles.noData}>暂无记录</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* === 无活跃数据的员工列表 === */}
          {activeEmployees.length < employeeStats.length && (
            <div style={styles.idleSection}>
              <div style={styles.idleTitle}>今日未工作员工</div>
              <div style={styles.idleList}>
                {employeeStats
                  .filter(s => s.stepsCompleted === 0 && s.helpRequests === 0 && s.errorCount === 0)
                  .map(stat => (
                    <div key={stat.employeeId} style={styles.idleItem}>
                      <span style={styles.idleName}>{stat.name}</span>
                      <span style={styles.idleType}>{stat.type}</span>
                      <span style={styles.idleStatus}>未开始工作</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ==================== 内联样式 ==================== */

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f7fa',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    color: '#333',
    paddingBottom: '40px',
  },

  /* --- 顶部导航 --- */
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    backgroundColor: '#fff',
    borderBottom: '1px solid #e8e8e8',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    flexWrap: 'wrap',
    gap: '8px',
  },
  backBtn: {
    background: 'none',
    border: '1px solid #d9d9d9',
    borderRadius: '6px',
    padding: '6px 16px',
    fontSize: '14px',
    color: '#666',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1a1a2e',
  },
  dateDisplay: {
    fontSize: '14px',
    color: '#888',
  },

  /* --- 无数据状态 --- */
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '120px 20px',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  emptyText: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#999',
    marginBottom: '8px',
  },
  emptyHint: {
    fontSize: '14px',
    color: '#bbb',
  },

  /* --- 汇总统计卡片 --- */
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    textAlign: 'center',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  summaryValue: {
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '8px',
    lineHeight: 1.2,
  },
  summaryLabel: {
    fontSize: '13px',
    color: '#888',
  },

  /* --- 表格区域 --- */
  tableSection: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 24px',
  },
  tableTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#333',
    marginBottom: '12px',
    paddingLeft: '4px',
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    backgroundColor: '#fff',
    WebkitOverflowScrolling: 'touch',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '800px',
  },
  th: {
    padding: '14px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#666',
    backgroundColor: '#fafafa',
    borderBottom: '2px solid #eee',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  tr: {
    transition: 'background-color 0.15s',
  },
  td: {
    padding: '14px 16px',
    fontSize: '14px',
    borderBottom: '1px solid #f0f0f0',
    verticalAlign: 'middle',
  },
  emptyTd: {
    padding: '40px 16px',
    textAlign: 'center',
    color: '#999',
    fontSize: '14px',
  },

  /* --- 表格内元素 --- */
  empName: {
    fontWeight: 600,
    color: '#1a1a2e',
  },
  empType: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    backgroundColor: '#f0f5ff',
    color: '#2c5cc5',
  },
  number: {
    fontWeight: 600,
    fontSize: '16px',
  },
  duration: {
    fontSize: '13px',
    color: '#555',
  },
  noData: {
    fontSize: '12px',
    color: '#ccc',
  },

  /* --- 情绪分布条 --- */
  emotionBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  emotionSegment: {
    height: '6px',
    borderRadius: '3px',
    minWidth: '4px',
  },
  emotionLabels: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  emotionLabel: {
    fontSize: '11px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },

  /* --- 未工作员工 --- */
  idleSection: {
    maxWidth: '1200px',
    margin: '24px auto 0',
    padding: '0 24px',
  },
  idleTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#999',
    marginBottom: '12px',
    paddingLeft: '4px',
  },
  idleList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '12px',
  },
  idleItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  idleName: {
    fontWeight: 600,
    color: '#666',
  },
  idleType: {
    fontSize: '12px',
    color: '#aaa',
  },
  idleStatus: {
    marginLeft: 'auto',
    fontSize: '12px',
    color: '#ccc',
    backgroundColor: '#f9f9f9',
    padding: '2px 8px',
    borderRadius: '4px',
  },
}
