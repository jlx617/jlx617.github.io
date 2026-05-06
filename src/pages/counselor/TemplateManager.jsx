import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTemplates,
  getEmployees,
  assignTask,
  addSessionLog,
  saveTemplate,
  deleteTemplate,
  addTemplateStep,
  removeTemplateStep,
  updateTemplateStep,
  reorderTemplateSteps
} from '../../data/store'
import './MonitorDashboard.css'

/**
 * 任务模板管理页面
 * 支持模板的创建、编辑、删除，以及步骤的增删改查和排序
 */

/* --- 难度颜色映射 --- */
const DIFFICULTY_COLORS = {
  easy: '#4CAF50',
  medium: '#FF9800',
  hard: '#F44336'
}

const DIFFICULTY_LABELS = {
  easy: '简单',
  medium: '中等',
  hard: '困难'
}

/* --- 分类选项 --- */
const CATEGORY_OPTIONS = ['餐饮', '零售', '清洁', '其他']

/* --- 空步骤表单 --- */
const EMPTY_STEP_FORM = {
  title: '',
  description: '',
  imageUrl: '',
  voiceText: '',
  guideTips: '',
  duration: ''
}

export default function TemplateManager() {
  const navigate = useNavigate()

  /* --- 状态 --- */
  const [templates, setTemplates] = useState([])
  const [employees, setEmployees] = useState([])
  const [expandedId, setExpandedId] = useState(null) // 展开的模板ID
  const [assignModal, setAssignModal] = useState(null) // { templateId, templateName }

  /* --- 模板创建/编辑弹窗状态 --- */
  const [templateModal, setTemplateModal] = useState(null) // null | { mode: 'create' | 'edit', data: { id, name, category, difficulty } }

  /* --- 步骤创建/编辑弹窗状态 --- */
  const [stepModal, setStepModal] = useState(null) // null | { mode: 'add' | 'edit', templateId, stepIndex, data: {...} }

  /* --- 加载数据 --- */
  const refreshData = () => {
    try {
      const tplList = getTemplates()
      setTemplates(tplList || [])

      const empList = getEmployees()
      setEmployees(empList || [])
    } catch (err) {
      console.error('加载模板数据失败:', err)
    }
  }

  useEffect(() => {
    refreshData()
  }, [])

  /* --- 切换展开/收起 --- */
  const toggleExpand = (templateId) => {
    setExpandedId(expandedId === templateId ? null : templateId)
  }

  /* --- 分配模板给员工 --- */
  const handleAssignToEmployee = (templateId, employeeId) => {
    try {
      assignTask(employeeId, templateId)
      addSessionLog(employeeId, {
        type: 'status',
        content: '辅导员通过模板管理页面分配了任务'
      })
      setAssignModal(null)
    } catch (err) {
      console.error('分配任务失败:', err)
    }
  }

  /* --- 模板 CRUD --- */

  // 打开创建模板弹窗
  const handleOpenCreateTemplate = () => {
    setTemplateModal({
      mode: 'create',
      data: { id: '', name: '', category: '餐饮', difficulty: 'medium' }
    })
  }

  // 打开编辑模板弹窗
  const handleOpenEditTemplate = (tpl) => {
    setTemplateModal({
      mode: 'edit',
      data: { id: tpl.id, name: tpl.name, category: tpl.category || '餐饮', difficulty: tpl.difficulty || 'medium' }
    })
  }

  // 提交模板创建/编辑
  const handleTemplateModalSubmit = () => {
    const { mode, data } = templateModal
    if (!data.name.trim()) {
      alert('请输入模板名称')
      return
    }

    try {
      if (mode === 'create') {
        const newTpl = saveTemplate({
          name: data.name.trim(),
          category: data.category,
          difficulty: data.difficulty,
          steps: []
        })
        refreshData()
        setTemplateModal(null)
        // 自动展开新创建的模板
        setExpandedId(newTpl.id)
      } else {
        // 编辑模式：获取原模板的 steps 保留
        const original = templates.find(t => t.id === data.id)
        saveTemplate({
          ...original,
          name: data.name.trim(),
          category: data.category,
          difficulty: data.difficulty
        })
        refreshData()
        setTemplateModal(null)
      }
    } catch (err) {
      console.error('保存模板失败:', err)
    }
  }

  // 删除模板
  const handleDeleteTemplate = (tpl) => {
    if (!window.confirm(`确定要删除模板「${tpl.name}」吗？此操作不可撤销。`)) {
      return
    }
    try {
      deleteTemplate(tpl.id)
      if (expandedId === tpl.id) {
        setExpandedId(null)
      }
      refreshData()
    } catch (err) {
      console.error('删除模板失败:', err)
    }
  }

  /* --- 步骤 CRUD --- */

  // 打开添加步骤弹窗
  const handleOpenAddStep = (templateId) => {
    setStepModal({
      mode: 'add',
      templateId,
      stepIndex: -1,
      data: { ...EMPTY_STEP_FORM }
    })
  }

  // 打开编辑步骤弹窗
  const handleOpenEditStep = (templateId, stepIndex, stepData) => {
    setStepModal({
      mode: 'edit',
      templateId,
      stepIndex,
      data: {
        title: stepData.title || '',
        description: stepData.description || '',
        imageUrl: stepData.imageUrl || '',
        voiceText: stepData.voiceText || '',
        guideTips: stepData.guideTips || '',
        duration: stepData.duration || ''
      }
    })
  }

  // 提交步骤创建/编辑
  const handleStepModalSubmit = () => {
    const { mode, templateId, stepIndex, data } = stepModal
    if (!data.title.trim()) {
      alert('请输入步骤标题')
      return
    }

    const stepPayload = {
      title: data.title.trim(),
      description: data.description.trim(),
      imageUrl: data.imageUrl.trim(),
      voiceText: data.voiceText.trim(),
      guideTips: data.guideTips.trim(),
      duration: data.duration ? parseInt(data.duration, 10) : 0
    }

    try {
      if (mode === 'add') {
        addTemplateStep(templateId, stepPayload)
      } else {
        updateTemplateStep(templateId, stepIndex, stepPayload)
      }
      refreshData()
      setStepModal(null)
    } catch (err) {
      console.error('保存步骤失败:', err)
    }
  }

  // 删除步骤
  const handleDeleteStep = (templateId, stepIndex, stepTitle) => {
    if (!window.confirm(`确定要删除步骤「${stepTitle}」吗？此操作不可撤销。`)) {
      return
    }
    try {
      removeTemplateStep(templateId, stepIndex)
      refreshData()
    } catch (err) {
      console.error('删除步骤失败:', err)
    }
  }

  // 步骤上移
  const handleMoveStepUp = (templateId, stepIndex) => {
    if (stepIndex <= 0) return
    try {
      reorderTemplateSteps(templateId, stepIndex, stepIndex - 1)
      refreshData()
    } catch (err) {
      console.error('步骤排序失败:', err)
    }
  }

  // 步骤下移
  const handleMoveStepDown = (templateId, stepIndex, totalSteps) => {
    if (stepIndex >= totalSteps - 1) return
    try {
      reorderTemplateSteps(templateId, stepIndex, stepIndex + 1)
      refreshData()
    } catch (err) {
      console.error('步骤排序失败:', err)
    }
  }

  return (
    <div className="monitor-dashboard">
      {/* === 顶部导航栏 === */}
      <header className="monitor-header">
        <div className="monitor-header__title">
          心工坊 · 模板管理
        </div>
        <nav className="monitor-header__nav">
          <a
            href="#/counselor"
            className="monitor-header__nav-link"
            onClick={(e) => {
              e.preventDefault()
              navigate('/counselor')
            }}
          >
            监控台
          </a>
          <a
            href="#/counselor/templates"
            className="monitor-header__nav-link monitor-header__nav-link--active"
          >
            模板管理
          </a>
        </nav>
      </header>

      {/* === 主内容区域 === */}
      <main className="monitor-content">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <h2 style={{ margin: 0, color: '#333' }}>
            任务模板列表
            <span style={{ fontSize: '14px', color: '#888', fontWeight: 'normal', marginLeft: '12px' }}>
              共 {templates.length} 个模板
            </span>
          </h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <a
              href="#/counselor"
              style={{
                fontSize: '14px',
                color: '#1976d2',
                textDecoration: 'none',
                cursor: 'pointer'
              }}
              onClick={(e) => {
                e.preventDefault()
                navigate('/counselor')
              }}
            >
              &larr; 返回监控台
            </a>
            <button
              className="btn btn--primary"
              onClick={handleOpenCreateTemplate}
            >
              ➕ 创建新模板
            </button>
          </div>
        </div>

        {templates.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#999',
            background: '#fff',
            borderRadius: '12px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <div>暂无任务模板</div>
            <button
              className="btn btn--primary"
              style={{ marginTop: '16px' }}
              onClick={handleOpenCreateTemplate}
            >
              ➕ 创建新模板
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {templates.map((tpl) => {
              const isExpanded = expandedId === tpl.id
              const difficulty = tpl.difficulty || 'medium'
              const diffColor = DIFFICULTY_COLORS[difficulty] || DIFFICULTY_COLORS.medium
              const diffLabel = DIFFICULTY_LABELS[difficulty] || '中等'
              const steps = tpl.steps || []

              return (
                <div
                  key={tpl.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    overflow: 'hidden',
                    transition: 'box-shadow 0.2s'
                  }}
                >
                  {/* 模板卡片头部 */}
                  <div
                    style={{
                      padding: '20px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                    onClick={() => toggleExpand(tpl.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        color: '#333',
                        marginBottom: '6px'
                      }}>
                        {tpl.name}
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: '#888',
                        display: 'flex',
                        gap: '16px',
                        flexWrap: 'wrap'
                      }}>
                        <span>📂 {tpl.category || '未分类'}</span>
                        <span>📝 {steps.length} 个步骤</span>
                        <span style={{ color: diffColor }}>
                          难度：{diffLabel}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      <button
                        className="btn btn--primary btn--sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAssignModal({
                            templateId: tpl.id,
                            templateName: tpl.name
                          })
                        }}
                      >
                        分配给员工
                      </button>
                      <button
                        className="btn btn--outline btn--sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenEditTemplate(tpl)
                        }}
                      >
                        编辑
                      </button>
                      <button
                        className="btn btn--sm"
                        style={{
                          background: '#F44336',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteTemplate(tpl)
                        }}
                      >
                        删除
                      </button>
                      <button
                        className="btn btn--outline btn--sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(tpl.id)
                        }}
                      >
                        {isExpanded ? '收起 ▲' : '查看详情 ▼'}
                      </button>
                    </div>
                  </div>

                  {/* 展开的步骤列表 */}
                  {isExpanded && (
                    <div style={{
                      borderTop: '1px solid #f0f0f0',
                      background: '#fafafa',
                      padding: '16px 24px'
                    }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#555',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span>步骤详情</span>
                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => handleOpenAddStep(tpl.id)}
                        >
                          ➕ 添加步骤
                        </button>
                      </div>
                      {steps.length === 0 ? (
                        <div style={{ color: '#999', fontSize: '13px' }}>
                          该模板暂无步骤定义，点击上方按钮添加步骤
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {steps.map((step, idx) => (
                            <div
                              key={step.id || idx}
                              style={{
                                background: '#ffffff',
                                borderRadius: '8px',
                                padding: '12px 16px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                border: '1px solid #eeeeee'
                              }}
                            >
                              {/* 步骤序号 */}
                              <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: '#4CAF50',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '13px',
                                fontWeight: 700,
                                flexShrink: 0
                              }}>
                                {idx + 1}
                              </div>
                              {/* 步骤内容 */}
                              <div style={{ flex: 1 }}>
                                <div style={{
                                  fontSize: '14px',
                                  fontWeight: 600,
                                  color: '#333',
                                  marginBottom: '4px'
                                }}>
                                  {step.title || `步骤 ${idx + 1}`}
                                </div>
                                <div style={{
                                  fontSize: '13px',
                                  color: '#666',
                                  marginBottom: '4px'
                                }}>
                                  🗣️ {step.voiceText || '无语音提示'}
                                </div>
                                {step.description && (
                                  <div style={{
                                    fontSize: '13px',
                                    color: '#888',
                                    marginBottom: '4px'
                                  }}>
                                    📄 {step.description}
                                  </div>
                                )}
                                {step.guideTips && (
                                  <div style={{
                                    fontSize: '13px',
                                    color: '#888',
                                    marginBottom: '4px'
                                  }}>
                                    💡 {step.guideTips}
                                  </div>
                                )}
                                {step.duration && (
                                  <div style={{
                                    fontSize: '12px',
                                    color: '#999'
                                  }}>
                                    ⏱ 预计时长：{step.duration}秒
                                  </div>
                                )}
                              </div>
                              {/* 步骤操作按钮 */}
                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                flexShrink: 0,
                                alignItems: 'center'
                              }}>
                                {/* 上下移动按钮 */}
                                <button
                                  title="上移"
                                  disabled={idx === 0}
                                  style={{
                                    background: 'none',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    fontSize: '12px',
                                    cursor: idx === 0 ? 'not-allowed' : 'pointer',
                                    opacity: idx === 0 ? 0.3 : 1,
                                    lineHeight: '1.2'
                                  }}
                                  onClick={() => handleMoveStepUp(tpl.id, idx)}
                                >
                                  ▲
                                </button>
                                <button
                                  title="下移"
                                  disabled={idx === steps.length - 1}
                                  style={{
                                    background: 'none',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    fontSize: '12px',
                                    cursor: idx === steps.length - 1 ? 'not-allowed' : 'pointer',
                                    opacity: idx === steps.length - 1 ? 0.3 : 1,
                                    lineHeight: '1.2'
                                  }}
                                  onClick={() => handleMoveStepDown(tpl.id, idx, steps.length)}
                                >
                                  ▼
                                </button>
                                <div style={{ height: '4px' }} />
                                <button
                                  className="btn btn--outline btn--sm"
                                  style={{ padding: '2px 8px', fontSize: '12px' }}
                                  onClick={() => handleOpenEditStep(tpl.id, idx, step)}
                                >
                                  编辑
                                </button>
                                <button
                                  className="btn btn--sm"
                                  style={{
                                    background: '#F44336',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '2px 8px',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => handleDeleteStep(tpl.id, idx, step.title || `步骤 ${idx + 1}`)}
                                >
                                  删除
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* 底部添加步骤按钮 */}
                      {steps.length > 0 && (
                        <div style={{ marginTop: '12px', textAlign: 'center' }}>
                          <button
                            className="btn btn--outline btn--sm"
                            onClick={() => handleOpenAddStep(tpl.id)}
                          >
                            ➕ 添加步骤
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* === 分配给员工弹窗 === */}
      {assignModal && (
        <div
          className="modal-overlay"
          onClick={() => setAssignModal(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__title">
              <span>将「{assignModal.templateName}」分配给员工</span>
              <button
                className="modal__close"
                onClick={() => setAssignModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal__body">
              {employees.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                  暂无员工
                </div>
              ) : (
                <ul className="employee-select-list">
                  {employees.map((emp, index) => (
                    <li
                      key={emp.id}
                      className="employee-select-item"
                      onClick={() => handleAssignToEmployee(assignModal.templateId, emp.id)}
                    >
                      <span className="employee-select-item__avatar">
                        {['👦', '👧', '🧑', '👨', '👩'][index % 5]}
                      </span>
                      <div className="employee-select-item__info">
                        <div className="employee-select-item__name">{emp.name}</div>
                        <div className="employee-select-item__status">
                          {emp.status === 'idle' ? '空闲 - 可分配' :
                           emp.status === 'working' ? '工作中' :
                           emp.status === 'alert' ? '需要帮助' :
                           emp.status || '未知'}
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

      {/* === 模板创建/编辑弹窗 === */}
      {templateModal && (
        <div
          className="modal-overlay"
          onClick={() => setTemplateModal(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal__title">
              <span>{templateModal.mode === 'create' ? '创建新模板' : '编辑模板'}</span>
              <button
                className="modal__close"
                onClick={() => setTemplateModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal__body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 模板名称 */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                    模板名称 <span style={{ color: '#F44336' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={templateModal.data.name}
                    onChange={(e) => setTemplateModal({
                      ...templateModal,
                      data: { ...templateModal.data, name: e.target.value }
                    })}
                    placeholder="请输入模板名称"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>
                {/* 分类 */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                    分类
                  </label>
                  <select
                    value={templateModal.data.category}
                    onChange={(e) => setTemplateModal({
                      ...templateModal,
                      data: { ...templateModal.data, category: e.target.value }
                    })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      background: '#fff'
                    }}
                  >
                    {CATEGORY_OPTIONS.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                {/* 难度 */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                    难度
                  </label>
                  <select
                    value={templateModal.data.difficulty}
                    onChange={(e) => setTemplateModal({
                      ...templateModal,
                      data: { ...templateModal.data, difficulty: e.target.value }
                    })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      background: '#fff'
                    }}
                  >
                    <option value="easy">简单</option>
                    <option value="medium">中等</option>
                    <option value="hard">困难</option>
                  </select>
                </div>
              </div>
              {/* 操作按钮 */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '24px'
              }}>
                <button
                  className="btn btn--outline"
                  onClick={() => setTemplateModal(null)}
                >
                  取消
                </button>
                <button
                  className="btn btn--primary"
                  onClick={handleTemplateModalSubmit}
                >
                  {templateModal.mode === 'create' ? '创建' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === 步骤创建/编辑弹窗 === */}
      {stepModal && (
        <div
          className="modal-overlay"
          onClick={() => setStepModal(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal__title">
              <span>{stepModal.mode === 'add' ? '添加步骤' : '编辑步骤'}</span>
              <button
                className="modal__close"
                onClick={() => setStepModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal__body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 步骤标题 */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                    步骤标题 <span style={{ color: '#F44336' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={stepModal.data.title}
                    onChange={(e) => setStepModal({
                      ...stepModal,
                      data: { ...stepModal.data, title: e.target.value }
                    })}
                    placeholder="例如：取杯子"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>
                {/* 步骤描述 */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                    步骤描述
                  </label>
                  <textarea
                    value={stepModal.data.description}
                    onChange={(e) => setStepModal({
                      ...stepModal,
                      data: { ...stepModal.data, description: e.target.value }
                    })}
                    placeholder="详细描述该步骤的操作内容"
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>
                {/* 图片/Emoji */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                    图标（Emoji 或图片 URL）
                  </label>
                  <input
                    type="text"
                    value={stepModal.data.imageUrl}
                    onChange={(e) => setStepModal({
                      ...stepModal,
                      data: { ...stepModal.data, imageUrl: e.target.value }
                    })}
                    placeholder="输入 Emoji 或图片链接，例如 ☕"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>
                {/* 语音提示文本 */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                    语音提示文本
                  </label>
                  <textarea
                    value={stepModal.data.voiceText}
                    onChange={(e) => setStepModal({
                      ...stepModal,
                      data: { ...stepModal.data, voiceText: e.target.value }
                    })}
                    placeholder="AI 语音播报的提示内容"
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>
                {/* 引导提示 */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                    引导提示
                  </label>
                  <textarea
                    value={stepModal.data.guideTips}
                    onChange={(e) => setStepModal({
                      ...stepModal,
                      data: { ...stepModal.data, guideTips: e.target.value }
                    })}
                    placeholder="AI 引导时的详细提示信息"
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>
                {/* 预计时长 */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '6px' }}>
                    预计时长（秒）
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={stepModal.data.duration}
                    onChange={(e) => setStepModal({
                      ...stepModal,
                      data: { ...stepModal.data, duration: e.target.value }
                    })}
                    placeholder="例如：30"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>
              {/* 操作按钮 */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '24px'
              }}>
                <button
                  className="btn btn--outline"
                  onClick={() => setStepModal(null)}
                >
                  取消
                </button>
                <button
                  className="btn btn--primary"
                  onClick={handleStepModalSubmit}
                >
                  {stepModal.mode === 'add' ? '添加' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
