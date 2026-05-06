import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Workstation from './pages/employee/Workstation'
import TaskSelect from './pages/employee/TaskSelect'
import MonitorDashboard from './pages/counselor/MonitorDashboard'
import TemplateManager from './pages/counselor/TemplateManager'
import Stats from './pages/counselor/Stats'
import { initStore } from './data/store'

// 初始化数据存储
initStore()

/**
 * 心工坊V2 - 应用路由配置
 * 包含首页、员工工作台、员工任务选择、辅导员监控台、辅导员统计、模板管理
 */
function App() {
  return (
    <Routes>
      {/* 首页 - 角色选择 */}
      <Route path="/" element={<Landing />} />
      {/* 员工端 - AI引导工作台（Workstation内部自带GuideEngineProvider） */}
      <Route path="/employee" element={<Workstation />} />
      {/* 员工端 - 任务选择 */}
      <Route path="/employee/select" element={<TaskSelect />} />
      {/* 辅导员端 - 实时监控看板 */}
      <Route path="/counselor" element={<MonitorDashboard />} />
      {/* 辅导员端 - 统计分析 */}
      <Route path="/counselor/stats" element={<Stats />} />
      {/* 辅导员端 - 模板管理 */}
      <Route path="/counselor/templates" element={<TemplateManager />} />
      {/* 未匹配路由 - 重定向到首页 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
