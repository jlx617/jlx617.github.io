import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getEmployees,
  getTemplates,
  updateEmployee,
  assignTask,
  getAlerts,
  clearAlert,
  getAllSessionLogs,
  addSessionLog,
  addEmployee,
  deleteEmployee,
  updateEmployeeActivity
} from '../../data/store'
import { syncManager } from '../../utils/sync'
import { speak, speakWithCallback } from '../../utils/speech'
import './MonitorDashboard.css'

/**
 * 辅导员实时监控看板
 * 核心功能：实时监控所有员工的工作状态，支持远程介入
 */

/* --- 头像emoji映射 --- */
const AVATARS = ['👦', '👧', '🧑', '👨', '👩', '🧒', '👦🏻', '👧🏻']

/* --- 状态中文映射 --- */
const STATUS_MAP = {
  idle: '空闲',
  working: '工作中',
  alert: '需要帮助',
  completed: '已完成',
  offline: '离线'
}

/* --- 情绪emoji映射 --- */
const EMOTION_MAP = {
  '平静': '😌',
  '开心': '😊',
  '焦虑': '😰',
  '困惑': '😕',
  '沮丧': '😢',
  '愤怒': '😠',
  '疲惫': '😴',
  '专注': '🤔',
  '兴奋': '😄',
  '害怕': '😨'
}

export default function MonitorDashboard() {
  const navigate = useNavigate()

  /* --- 状态 --- */
  const [employees, setEmployees] = useState([])
  const [templates, setTemplates] = useState([])
  const [alerts, setAlerts] = useState([])
  const [logs, setLogs] = useState([])
  const [alertPanelOpen, setAlertPanelOpen] = useState(false)

  /* --- 弹窗状态 --- */
  const [assignModal, setAssignModal] = useState(null) // { employeeId, employeeName }
  const [voiceIntervention, setVoiceIntervention] = useState(null) // employeeId
  const [voiceMessage, setVoiceMessage] = useState('') // 语音介入消息输入
  const [addEmployeeModal, setAddEmployeeModal] = useState(false) // 添加员工弹窗
  const [newEmployeeName, setNewEmployeeName] = useState('')
  const [newEmployeeType, setNewEmployeeType] = useState('孤独症谱系')

  /* --- 日志自动滚动 --- */
  const logEndRef = useRef(null)

  /* --- 刷新数据 --- */
  const refreshData = useCallback(() => {
    try {
      const empList = getEmployees()
      setEmployees(empList || [])

      const tplList = getTemplates()
      setTemplates(tplList || [])

      const alertList = getAlerts()
      setAlerts(alertList || [])

      const logList = getAllSessionLogs()
      setLogs(logList || [])
    } catch (err) {
      console.error('刷新数据失败:', err)
    }
  }, [])

  /* --- 首次加载 & BroadcastChannel 同步 + 降级轮询 --- */
  useEffect(() => {
    refreshData()

    // 监听 BroadcastChannel 消息，收到同步消息时刷新数据
    const unsubStateUpdate = syncManager.onMessage('employee_state_update', () => refreshData())
    const unsubStepProgress = syncManager.onMessage('step_progress', () => refreshData())
    const unsubAlert = syncManager.onMessage('alert', () => refreshData())
    const unsubEmotion = syncManager.onMessage('emotion_update', () => refreshData())

    // 降级轮询：每10秒刷新一次，确保可靠性
    const timer = setInterval(refreshData, 10000)

    return () => {
      unsubStateUpdate()
      unsubStepProgress()
      unsubAlert()
      unsubEmotion()
      clearInterval(timer)
    }
  }, [refreshData])

  /* --- 日志自动滚动到底部 --- */
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  /* --- 统计数据计算 --- */
  const stats = {
    online: employees.filter(e => e.status !== 'offline').length,
    working: employees.filter(e => e.status === 'working').length,
    completed: employees.filter(e => e.status === 'completed').length,
    alertCount: alerts.filter(a => !a.resolved).length
  }

  /* --- 分配任务 --- */
  const handleAssignTask = (employeeId, templateId) => {
    try {
      assignTask(employeeId, templateId)
      addSessionLog(employeeId, {
        type: 'status',
        content: '辅导员为员工分配了新任务'
      })
      setAssignModal(null)
      refreshData()
    } catch (err) {
      console.error('分配任务失败:', err)
    }
  }

  /* --- 推进步骤 --- */
  const handleAdvanceStep = (employeeId) => {
    try {
      const emp = employees.find(e => e.id === employeeId)
      if (!emp || !emp.currentTask) return

      const newStep = (emp.currentTask?.stepIndex || 0) + 1
      updateEmployee(employeeId, { currentTask: { ...emp.currentTask, stepIndex: newStep } })
      addSessionLog(employeeId, {
        type: 'status',
        content: '辅导员手动推进员工到步骤 ' + newStep
      })
      refreshData()
    } catch (err) {
      console.error('推进步骤失败:', err)
    }
  }

  /* --- 回退步骤 --- */
  const handleRetreatStep = (employeeId) => {
    try {
      const emp = employees.find(e => e.id === employeeId)
      if (!emp || !emp.currentTask) return

      const newStep = Math.max(0, (emp.currentTask?.stepIndex || 1) - 1)
      updateEmployee(employeeId, { currentTask: { ...emp.currentTask, stepIndex: newStep } })
      addSessionLog(employeeId, {
        type: 'status',
        content: '辅导员手动回退员工到步骤 ' + newStep
      })
      refreshData()
    } catch (err) {
      console.error('回退步骤失败:', err)
    }
  }

  /* --- 语音介入（真实语音） --- */
  const handleStartVoiceIntervention = (employeeId) => {
    setVoiceIntervention(employeeId)
    setVoiceMessage('')
    addSessionLog(employeeId, {
      type: 'ai',
      content: '辅导员发起语音介入...'
    })
  }

  const handleSendVoiceMessage = () => {
    if (!voiceIntervention || !voiceMessage.trim()) return

    const employeeId = voiceIntervention
    const text = voiceMessage.trim()

    // 本地语音播报
    speak(text)

    // 通过 BroadcastChannel 广播到员工标签页
    syncManager.broadcast('voice_intervention', {
      employeeId,
      message: text,
      text
    })

    addSessionLog(employeeId, {
      type: 'ai',
      content: `辅导员语音介入: "${text}"`
    })

    setVoiceMessage('')
  }

  const handleEndVoiceIntervention = () => {
    if (!voiceIntervention) return

    const employeeId = voiceIntervention
    setVoiceIntervention(null)
    setVoiceMessage('')

    addSessionLog(employeeId, {
      type: 'status',
      content: '辅导员语音介入结束'
    })

    refreshData()
  }

  /* --- 处理预警 --- */
  const handleResolveAlert = (alertId) => {
    try {
      clearAlert(alertId)
      refreshData()
    } catch (err) {
      console.error('处理预警失败:', err)
    }
  }

  /* --- 添加员工 --- */
  const handleAddEmployee = () => {
    if (!newEmployeeName.trim()) return

    try {
      addEmployee({ name: newEmployeeName.trim(), type: newEmployeeType })
      setNewEmployeeName('')
      setNewEmployeeType('孤独症谱系')
      setAddEmployeeModal(false)
      refreshData()
    } catch (err) {
      console.error('添加员工失败:', err)
    }
  }

  /* --- 删除员工 --- */
  const handleDeleteEmployee = (emp) => {
    if (!window.confirm(`确定要删除员工 ${emp.name} 吗？`)) return

    try {
      deleteEmployee(emp.id)
      refreshData()
    } catch (err) {
      console.error('删除员工失败:', err)
    }
  }

  /* --- 格式化时间 --- */
  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const d = new Date(timestamp)
    return d.toLocaleTimeString('zh-CN', { hour12: false })
  }

  /* --- 计算等待时间（秒） --- */
  const getWaitTime = (employee) => {
    if (!employee.lastActivity) return 0
    return Math.floor((Date.now() - new Date(employee.lastActivity).getTime()) / 1000)
  }

  /* --- 获取员工头像 --- */
  const getAvatar = (index) => AVATARS[index % AVATARS.length]

  /* --- 获取情绪 emoji --- */
  const getEmotionEmoji = (emotion) => {
    return EMOTION_MAP[emotion] || '😐'
  }

  /* --- 渲染日志条目 --- */
  const renderLogEntry = (log, index) => {
    const emp = employees.find(e => e.id === log.employeeId)
    const empName = emp ? emp.name : `员工${log.employeeId}`
    const isAlert = log.type === 'alert'

    return (
      <div
        key={index}
        className={`log-entry ${isAlert ? 'log-entry--alert' : ''}`}
      >
        <span className="log-entry__time">{formatTime(log.time)}</span>
        <span className="log-entry__employee">[{empName}]</span>
        <span className={`log-entry__type-${log.type}`}>
          {log.type === 'ai' ? 'AI: ' : log.type === 'status' ? '状态: ' : '⚠️ '}
          {log.content}
        </span>
      </div>
    )
  }

  return (
    <div className="monitor-dashboard">
      {/* === 顶部导航栏 === */}
      <header className="monitor-header">
        <div className="monitor-header__title">
          心工坊 · 辅导员监控台
        </div>
        <nav className="monitor-header__nav">
          <a
            href="#/counselor"
            className="monitor-header__nav-link monitor-header__nav-link--active"
          >
            监控台
          </a>
          <a
            href="#/counselor/templates"
            className="monitor-header__nav-link"
            onClick={(e) => {
              e.preventDefault()
              navigate('/counselor/templates')
            }}
          >
            模板管理
          </a>
          <a
            href="#/counselor/stats"
            className="monitor-header__nav-link"
            onClick={(e) => {
              e.preventDefault()
              navigate('/counselor/stats')
            }}
          >
            📊 数据统计
          </a>
          <button
            className="monitor-header__alert-btn"
            onClick={() => setAlertPanelOpen(!alertPanelOpen)}
          >
            🔔
            {stats.alertCount > 0 && (
              <span className="monitor-header__alert-badge">
                {stats.alertCount}
              </span>
            )}
          </button>
        </nav>
      </header>

      {/* === 主内容区域 === */}
      <main className="monitor-content">
        {/* --- 统计卡片行 --- */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-card__value stat-card__value--online">
              {stats.online}
            </div>
            <div className="stat-card__label">在线人数</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value stat-card__value--working">
              {stats.working}
            </div>
            <div className="stat-card__label">工作中</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value stat-card__value--completed">
              {stats.completed}
            </div>
            <div className="stat-card__label">已完成</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value stat-card__value--alert">
              {stats.alertCount}
            </div>
            <div className="stat-card__label">预警</div>
          </div>
        </div>

        {/* --- 员工监控宫格 --- */}
        <div className="employee-grid">
          {employees.map((emp, index) => {
            const isAlert = emp.status === 'alert'
            const isIdle = emp.status === 'idle'
            const isWorking = emp.status === 'working'
            const waitTime = getWaitTime(emp)
            const currentStep = emp.currentTask?.stepIndex || 0
            const taskTemplate = templates.find(t => t.id === emp.currentTask?.templateId)
            const totalSteps = taskTemplate ? taskTemplate.steps.length : (emp.currentTask ? 6 : 0)
            const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0

            return (
              <div
                key={emp.id}
                className={`employee-card ${
                  isAlert ? 'employee-card--alert' :
                  isIdle ? 'employee-card--idle' :
                  isWorking ? 'employee-card--working' : ''
                }`}
              >
                {/* 删除按钮 */}
                <button
                  className="employee-card__delete-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteEmployee(emp)
                  }}
                  title="删除员工"
                >
                  ×
                </button>

                {/* 卡片头部 */}
                <div className="employee-card__header">
                  <div className="employee-card__avatar">
                    {getAvatar(index)}
                  </div>
                  <div>
                    <div className="employee-card__name">{emp.name}</div>
                    <div className="employee-card__type">{emp.type || '员工'}</div>
                  </div>
                  <span className={`employee-card__status ${
                    isAlert ? 'employee-card__status--alert' :
                    isIdle ? 'employee-card__status--idle' :
                    'employee-card__status--working'
                  }`}>
                    {STATUS_MAP[emp.status] || emp.status}
                  </span>
                </div>

                {/* 情绪显示 */}
                <div className="employee-card__emotion">
                  <span className="employee-card__emotion-emoji">
                    {getEmotionEmoji(emp.emotion)}
                  </span>
                  <span className="employee-card__emotion-text">
                    {emp.emotion || '未知'}
                  </span>
                </div>

                {/* 当前任务信息 */}
                {isWorking && emp.currentTask && (
                  <>
                    <div className="employee-card__task-name">
                      {emp.currentTask.templateName || '进行中的任务'}
                    </div>
                    <div className="progress-bar__text">
                      步骤 {currentStep}/{totalSteps}
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-bar__fill ${isAlert ? 'progress-bar__fill--alert' : ''}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className={`wait-time ${waitTime > 30 ? 'wait-time--long' : ''}`}>
                      ⏱ 已等待{waitTime}秒
                    </div>
                  </>
                )}

                {isAlert && (
                  <div className="wait-time wait-time--long">
                    ⚠️ 等待辅导员...
                  </div>
                )}

                {/* 语音介入动画 */}
                {voiceIntervention === emp.id && (
                  <div className="voice-intervention">
                    <div className="voice-intervention__waves">
                      <div className="voice-intervention__wave" />
                      <div className="voice-intervention__wave" />
                      <div className="voice-intervention__wave" />
                      <div className="voice-intervention__wave" />
                      <div className="voice-intervention__wave" />
                    </div>
                    语音介入中...
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="employee-card__actions">
                  {(isIdle || isWorking) && (
                    <button
                      className="btn btn--primary btn--sm"
                      onClick={() => setAssignModal({
                        employeeId: emp.id,
                        employeeName: emp.name
                      })}
                    >
                      分配任务
                    </button>
                  )}
                  {isWorking && (
                    <>
                      <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => handleAdvanceStep(emp.id)}
                      >
                        推进步骤
                      </button>
                      <button
                        className="btn btn--outline btn--sm"
                        onClick={() => handleRetreatStep(emp.id)}
                      >
                        回退步骤
                      </button>
                    </>
                  )}
                  {(isWorking || isAlert) && (
                    <button
                      className="btn btn--warning btn--sm"
                      onClick={() => {
                        if (voiceIntervention === emp.id) {
                          handleEndVoiceIntervention()
                        } else {
                          handleStartVoiceIntervention(emp.id)
                        }
                      }}
                    >
                      {voiceIntervention === emp.id ? '介入中...' : '语音介入'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* 添加员工卡片 */}
          <div
            className="add-employee-card"
            onClick={() => setAddEmployeeModal(true)}
            style={{ cursor: 'pointer' }}
          >
            <div className="add-employee-card__icon">+</div>
            <div className="add-employee-card__text">添加员工</div>
          </div>
        </div>

        {/* --- AI交互日志 --- */}
        <div className="log-section">
          <div className="log-section__header">
            <span>
              <span className="log-section__header-dot" />
              AI交互日志
            </span>
            <span style={{ fontSize: '12px', opacity: 0.7 }}>
              实时更新
            </span>
          </div>
          <div className="log-section__body">
            {logs.length === 0 ? (
              <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                暂无日志记录
              </div>
            ) : (
              logs.map((log, index) => renderLogEntry(log, index))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </main>

      {/* === 预警侧边面板 === */}
      <div className={`alert-panel ${alertPanelOpen ? 'alert-panel--open' : ''}`}>
        <div className="alert-panel__header">
          <span>⚠️ 预警通知（{stats.alertCount}条）</span>
          <button
            className="alert-panel__close"
            onClick={() => setAlertPanelOpen(false)}
          >
            ✕
          </button>
        </div>
        {alerts.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
            暂无预警
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`alert-item ${alert.resolved ? 'alert-item--resolved' : ''}`}
            >
              <div className="alert-item__employee">
                {alert.employeeName || `员工${alert.employeeId}`}
              </div>
              <div className="alert-item__message">
                {alert.message}
              </div>
              <div className="alert-item__time">
                {formatTime(alert.time)}
              </div>
              {!alert.resolved && (
                <div className="alert-item__actions">
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => handleResolveAlert(alert.id)}
                  >
                    标记已处理
                  </button>
                  {alert.employeeId && (
                    <button
                      className="btn btn--warning btn--sm"
                      onClick={() => handleStartVoiceIntervention(alert.employeeId)}
                    >
                      语音介入
                    </button>
                  )}
                </div>
              )}
              {alert.resolved && (
                <div style={{ fontSize: '12px', color: '#4CAF50' }}>
                  ✓ 已处理
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* === 分配任务弹窗 === */}
      {assignModal && (
        <div
          className="modal-overlay"
          onClick={() => setAssignModal(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__title">
              <span>为 {assignModal.employeeName} 分配任务</span>
              <button
                className="modal__close"
                onClick={() => setAssignModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal__body">
              {templates.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                  暂无可用模板
                </div>
              ) : (
                <ul className="template-select-list">
                  {templates.map((tpl) => (
                    <li
                      key={tpl.id}
                      className="template-select-item"
                      onClick={() => handleAssignTask(assignModal.employeeId, tpl.id)}
                    >
                      <div>
                        <div className="template-select-item__name">
                          {tpl.name}
                        </div>
                        <div className="template-select-item__meta">
                          {tpl.category || '未分类'} · {tpl.steps ? tpl.steps.length : 0}个步骤
                        </div>
                      </div>
                      <button className="btn btn--primary btn--sm">
                        分配
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === 添加员工弹窗 === */}
      {addEmployeeModal && (
        <div
          className="modal-overlay"
          onClick={() => setAddEmployeeModal(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__title">
              <span>添加新员工</span>
              <button
                className="modal__close"
                onClick={() => setAddEmployeeModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal__body">
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                  姓名
                </label>
                <input
                  type="text"
                  value={newEmployeeName}
                  onChange={(e) => setNewEmployeeName(e.target.value)}
                  placeholder="请输入员工姓名"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddEmployee()
                  }}
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                  类型
                </label>
                <select
                  value={newEmployeeType}
                  onChange={(e) => setNewEmployeeType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="孤独症谱系">孤独症谱系</option>
                  <option value="智力发育迟缓">智力发育迟缓</option>
                  <option value="唐氏综合征">唐氏综合征</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <button
                className="btn btn--primary"
                onClick={handleAddEmployee}
                disabled={!newEmployeeName.trim()}
                style={{ width: '100%' }}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === 语音介入弹窗 === */}
      {voiceIntervention && (
        <div
          className="modal-overlay"
          onClick={handleEndVoiceIntervention}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__title">
              <span>语音介入 - {employees.find(e => e.id === voiceIntervention)?.name || ''}</span>
              <button
                className="modal__close"
                onClick={handleEndVoiceIntervention}
              >
                ✕
              </button>
            </div>
            <div className="modal__body">
              <div className="voice-intervention">
                <div className="voice-intervention__waves">
                  <div className="voice-intervention__wave" />
                  <div className="voice-intervention__wave" />
                  <div className="voice-intervention__wave" />
                  <div className="voice-intervention__wave" />
                  <div className="voice-intervention__wave" />
                </div>
                <div style={{ marginTop: '8px', fontWeight: 'bold', color: '#FF9800' }}>
                  介入中
                </div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <textarea
                  value={voiceMessage}
                  onChange={(e) => setVoiceMessage(e.target.value)}
                  placeholder="输入要发送的语音消息..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    resize: 'vertical'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendVoiceMessage()
                    }
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  className="btn btn--primary"
                  onClick={handleSendVoiceMessage}
                  disabled={!voiceMessage.trim()}
                  style={{ flex: 1 }}
                >
                  发送
                </button>
                <button
                  className="btn btn--outline"
                  onClick={handleEndVoiceIntervention}
                  style={{ flex: 1 }}
                >
                  结束介入
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
