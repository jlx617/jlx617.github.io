/**
 * 数据存储层 — 心工坊V2
 * 使用 localStorage 进行数据持久化
 * 管理任务模板、员工数据、告警信息和AI交互日志
 */

// ==================== localStorage 键名常量 ====================

const STORAGE_KEYS = {
  TEMPLATES: 'xgf_v2_templates',       // 任务模板列表
  EMPLOYEES: 'xgf_v2_employees',       // 员工列表
  ALERTS: 'xgf_v2_alerts',             // 告警列表
  SESSION_LOGS: 'xgf_v2_session_logs', // AI交互日志
  INITIALIZED: 'xgf_v2_initialized'    // 是否已初始化
};

// ==================== 默认任务模板 ====================

/**
 * 默认任务模板（3个）
 * 每个步骤包含 guideTips 字段，用于AI引导时的详细提示
 * 每个步骤包含 images 数组（4张图片），用于教学展示
 */
const DEFAULT_TEMPLATES = [
  {
    id: 'tpl_001',
    name: '咖啡店饮品制作',
    category: '餐饮',
    steps: [
      {
        id: 's1',
        title: '取杯子',
        description: '从杯子架取一个中号纸杯',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s1-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s1-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s1-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s1-4.jpg'
        ],
        voiceText: '小明，请从杯子架取一个中号纸杯',
        guideTips: '注意看杯子架上的标签，中号杯是蓝色的',
        duration: 30
      },
      {
        id: 's2',
        title: '放杯垫',
        description: '在杯托上放一张杯垫',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s2-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s2-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s2-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s2-4.jpg'
        ],
        voiceText: '很好！现在请把杯垫放在咖啡机上',
        guideTips: '杯垫就在咖啡机旁边的盒子里',
        duration: 15
      },
      {
        id: 's3',
        title: '按浓缩键',
        description: '按下咖啡机上的双份浓缩按钮',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s3-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s3-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s3-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s3-4.jpg'
        ],
        voiceText: '请按下咖啡机上标有双份浓缩的按钮',
        guideTips: '按钮在咖啡机右侧，上面有一个小小的咖啡杯图标',
        duration: 30
      },
      {
        id: 's4',
        title: '加热水',
        description: '向杯中加入热水至八分满',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s4-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s4-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s4-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s4-4.jpg'
        ],
        voiceText: '请向杯中加入热水，加到八分满的位置',
        guideTips: '慢慢倒，不要倒太满哦',
        duration: 20
      },
      {
        id: 's5',
        title: '搅拌',
        description: '用搅拌棒轻轻搅拌3圈',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s5-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s5-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s5-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s5-4.jpg'
        ],
        voiceText: '请用搅拌棒轻轻搅拌三圈',
        guideTips: '顺着一个方向搅拌就好',
        duration: 15
      },
      {
        id: 's6',
        title: '递给客人',
        description: '将咖啡放在取餐区',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s6-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s6-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s6-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/coffee/s6-4.jpg'
        ],
        voiceText: '太棒了！请把咖啡放在取餐区，微笑对客人说：您好，您的咖啡好了',
        guideTips: '记得要微笑哦',
        duration: 20
      }
    ]
  },
  {
    id: 'tpl_002',
    name: '超市货架整理',
    category: '零售',
    steps: [
      {
        id: 's1',
        title: '检查货架标签',
        description: '查看货架上每个区域的商品标签',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s1-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s1-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s1-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s1-4.jpg'
        ],
        voiceText: '请先看一下货架上的标签，确认每个区域应该放什么商品',
        guideTips: '标签在货架最上方的横条上，用不同颜色区分不同区域',
        duration: 20
      },
      {
        id: 's2',
        title: '取整理箱',
        description: '从仓库取一个整理箱',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s2-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s2-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s2-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s2-4.jpg'
        ],
        voiceText: '请去仓库取一个整理箱，用来装需要补货的商品',
        guideTips: '整理箱在仓库入口右手边，蓝色的大箱子',
        duration: 15
      },
      {
        id: 's3',
        title: '补货上架',
        description: '将商品按照标签放到对应位置',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s3-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s3-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s3-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s3-4.jpg'
        ],
        voiceText: '请把整理箱里的商品，按照标签放到对应的货架上',
        guideTips: '注意商品正面要朝外，价格标签要对着顾客',
        duration: 45
      },
      {
        id: 's4',
        title: '检查日期',
        description: '检查所有商品的生产日期',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s4-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s4-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s4-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s4-4.jpg'
        ],
        voiceText: '请检查一下货架上商品的生产日期，把快过期的放到前面',
        guideTips: '日期在商品包装的底部，找到印有"生产日期"的小字',
        duration: 30
      },
      {
        id: 's5',
        title: '整理外观',
        description: '把商品摆放整齐，正面朝外',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s5-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s5-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s5-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s5-4.jpg'
        ],
        voiceText: '请把商品摆放整齐，确保每个商品的正面都朝外',
        guideTips: '用手轻轻把商品往前推，让它们排成一条直线',
        duration: 20
      },
      {
        id: 's6',
        title: '归还整理箱',
        description: '将整理箱放回仓库',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s6-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s6-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s6-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/supermarket/s6-4.jpg'
        ],
        voiceText: '很好！最后请把整理箱放回仓库原来的位置',
        guideTips: '记得把整理箱叠放整齐，方便下次使用',
        duration: 15
      }
    ]
  },
  {
    id: 'tpl_003',
    name: '餐厅桌面清洁',
    category: '餐饮',
    steps: [
      {
        id: 's1',
        title: '收走餐具',
        description: '将桌面上的餐具收走',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s1-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s1-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s1-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s1-4.jpg'
        ],
        voiceText: '请把桌面上的碗、盘子、筷子收起来，放到收餐车上',
        guideTips: '小心碗是热的，用托盘端比较安全',
        duration: 30
      },
      {
        id: 's2',
        title: '清理残渣',
        description: '用抹布擦去桌面食物残渣',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s2-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s2-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s2-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s2-4.jpg'
        ],
        voiceText: '请用抹布把桌面上的食物残渣擦干净',
        guideTips: '从桌子的一边擦到另一边，不要来回擦',
        duration: 20
      },
      {
        id: 's3',
        title: '喷洒清洁剂',
        description: '在桌面均匀喷洒清洁剂',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s3-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s3-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s3-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s3-4.jpg'
        ],
        voiceText: '请拿清洁剂，在桌面上均匀地喷一下',
        guideTips: '距离桌面大约20厘米喷，不要喷太多',
        duration: 15
      },
      {
        id: 's4',
        title: '擦拭桌面',
        description: '用干净抹布擦拭整个桌面',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s4-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s4-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s4-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s4-4.jpg'
        ],
        voiceText: '请用干净的抹布把整个桌面擦一遍',
        guideTips: '用打圈的方式擦，确保每个角落都擦到',
        duration: 20
      },
      {
        id: 's5',
        title: '摆放餐具',
        description: '摆放新的餐具和纸巾',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s5-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s5-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s5-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s5-4.jpg'
        ],
        voiceText: '请摆放新的餐具和纸巾，按照标准位置放好',
        guideTips: '筷子放在碗的右边，纸巾放在碗的左边',
        duration: 25
      },
      {
        id: 's6',
        title: '检查确认',
        description: '检查桌面是否干净整洁',
        images: [
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s6-1.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s6-2.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s6-3.jpg',
          'https://raw.githubusercontent.com/jlx617/jlx617.github.io/gh-pages/steps/restaurant/s6-4.jpg'
        ],
        voiceText: '最后请检查一下桌面是否干净整洁，如果满意就完成啦！',
        guideTips: '站在桌子的对面看一眼，确认没有遗漏的地方',
        duration: 15
      }
    ]
  }
];

// ==================== 默认员工数据 ====================

/**
 * 默认员工列表
 */
const DEFAULT_EMPLOYEES = [
  {
    id: 'emp_001',
    name: '小明',
    type: '孤独症谱系',
    status: 'idle',
    currentTask: null,
    emotion: '平静'
  },
  {
    id: 'emp_002',
    name: '小红',
    type: '智力发育迟缓',
    status: 'idle',
    currentTask: null,
    emotion: '开心'
  },
  {
    id: 'emp_003',
    name: '小华',
    type: '唐氏综合征',
    status: 'idle',
    currentTask: null,
    emotion: '平静'
  }
];

// ==================== 工具函数 ====================

/**
 * 从 localStorage 读取数据
 * @param {string} key - 存储键名
 * @param {*} defaultValue - 默认值
 * @returns {*} 解析后的数据
 */
function _load(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    console.error('读取 localStorage 失败:', key, e);
    return defaultValue;
  }
}

/**
 * 写入数据到 localStorage
 * @param {string} key - 存储键名
 * @param {*} value - 要存储的数据
 */
function _save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('写入 localStorage 失败:', key, e);
  }
}

/**
 * 生成唯一ID
 * @param {string} prefix - ID前缀
 * @returns {string} 唯一ID
 */
function _generateId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
}

// ==================== 导出函数 ====================

/**
 * 初始化数据存储
 * 如果是首次运行，将默认数据写入 localStorage
 */
export function initStore() {
  const initialized = _load(STORAGE_KEYS.INITIALIZED, false);

  if (!initialized) {
    _save(STORAGE_KEYS.TEMPLATES, DEFAULT_TEMPLATES);
    _save(STORAGE_KEYS.EMPLOYEES, DEFAULT_EMPLOYEES);
    _save(STORAGE_KEYS.ALERTS, []);
    _save(STORAGE_KEYS.SESSION_LOGS, {});
    _save(STORAGE_KEYS.INITIALIZED, true);
    console.log('数据存储初始化完成');
  }
}

/**
 * 获取所有任务模板
 * @returns {Array} 任务模板列表
 */
export function getTemplates() {
  return _load(STORAGE_KEYS.TEMPLATES, DEFAULT_TEMPLATES);
}

/**
 * 根据ID获取任务模板
 * @param {string} id - 模板ID
 * @returns {Object|null} 任务模板对象，未找到返回 null
 */
export function getTemplate(id) {
  const templates = getTemplates();
  return templates.find(t => t.id === id) || null;
}

/**
 * 获取所有员工
 * @returns {Array} 员工列表
 */
export function getEmployees() {
  return _load(STORAGE_KEYS.EMPLOYEES, DEFAULT_EMPLOYEES);
}

/**
 * 获取单个员工信息
 * @param {string} id - 员工ID
 * @returns {Object|null} 员工对象，未找到返回 null
 */
export function getEmployee(id) {
  const employees = getEmployees();
  return employees.find(e => e.id === id) || null;
}

/**
 * 更新员工信息
 * @param {string} id - 员工ID
 * @param {Object} updates - 要更新的字段
 * @returns {Object|null} 更新后的员工对象，未找到返回 null
 */
export function updateEmployee(id, updates) {
  const employees = getEmployees();
  const index = employees.findIndex(e => e.id === id);

  if (index === -1) {
    console.warn('员工不存在:', id);
    return null;
  }

  // 合并更新
  employees[index] = { ...employees[index], ...updates };
  _save(STORAGE_KEYS.EMPLOYEES, employees);
  return employees[index];
}

/**
 * 为员工分配任务
 * @param {string} employeeId - 员工ID
 * @param {string} templateId - 任务模板ID
 * @returns {Object|null} 更新后的员工对象
 */
export function assignTask(employeeId, templateId) {
  const template = getTemplate(templateId);
  if (!template) {
    console.warn('任务模板不存在:', templateId);
    return null;
  }

  return updateEmployee(employeeId, {
    status: 'working',
    currentTask: {
      templateId: templateId,
      templateName: template.name,
      startTime: new Date().toISOString(),
      stepIndex: 0
    }
  });
}

/**
 * 获取所有告警
 * @returns {Array} 告警列表
 */
export function getAlerts() {
  return _load(STORAGE_KEYS.ALERTS, []);
}

/**
 * 添加告警
 * @param {Object} alert - 告警对象
 * @param {string} alert.type - 告警类型（help_request, auto_help, error, task_completed 等）
 * @param {string} alert.employeeId - 员工ID
 * @param {string} alert.message - 告警消息
 * @param {Object} alert.data - 附加数据
 * @returns {Object} 新创建的告警对象
 */
export function addAlert(alert) {
  const alerts = getAlerts();
  const newAlert = {
    id: _generateId('alert'),
    type: alert.type || 'info',
    employeeId: alert.employeeId || '',
    message: alert.message || '',
    data: alert.data || {},
    time: new Date().toISOString(),
    resolved: false
  };

  alerts.unshift(newAlert); // 最新的告警放在前面
  _save(STORAGE_KEYS.ALERTS, alerts);
  return newAlert;
}

/**
 * 清除/解决告警
 * @param {string} id - 告警ID
 * @returns {boolean} 是否成功清除
 */
export function clearAlert(id) {
  const alerts = getAlerts();
  const index = alerts.findIndex(a => a.id === id);

  if (index === -1) {
    return false;
  }

  alerts[index].resolved = true;
  _save(STORAGE_KEYS.ALERTS, alerts);
  return true;
}

/**
 * 获取员工的AI交互日志
 * @param {string} employeeId - 员工ID
 * @returns {Array} 交互日志列表
 */
export function getSessionLog(employeeId) {
  const allLogs = _load(STORAGE_KEYS.SESSION_LOGS, {});
  return allLogs[employeeId] || [];
}

/**
 * 添加AI交互日志
 * @param {string} employeeId - 员工ID
 * @param {Object} log - 日志条目
 * @param {string} log.type - 日志类型（speak, listen, state_change, step_complete 等）
 * @param {string} log.content - 日志内容
 * @returns {Object} 新创建的日志条目
 */
export function addSessionLog(employeeId, log) {
  const allLogs = _load(STORAGE_KEYS.SESSION_LOGS, {});
  const entry = {
    id: _generateId('log'),
    type: log.type || 'info',
    content: log.content || '',
    time: new Date().toISOString(),
    stepIndex: log.stepIndex || 0
  };

  if (!allLogs[employeeId]) {
    allLogs[employeeId] = [];
  }

  allLogs[employeeId].push(entry);

  // 限制每个员工最多保留500条日志，防止存储溢出
  if (allLogs[employeeId].length > 500) {
    allLogs[employeeId] = allLogs[employeeId].slice(-500);
  }

  _save(STORAGE_KEYS.SESSION_LOGS, allLogs);
  return entry;
}

/**
 * 获取所有员工的AI交互日志
 * @returns {Array} 所有日志条目（按时间倒序）
 */
export function getAllSessionLogs() {
  const allLogs = _load(STORAGE_KEYS.SESSION_LOGS, {});
  let result = [];
  for (const employeeId in allLogs) {
    allLogs[employeeId].forEach(entry => {
      result.push({ ...entry, employeeId });
    });
  }
  // 按时间倒序排列（最新的在前）
  result.sort((a, b) => new Date(b.time) - new Date(a.time));
  return result;
}

// ==================== 员工 CRUD 扩展 ====================

/**
 * 添加新员工
 * @param {Object} employee - 员工数据（name, type 等）
 * @returns {Object} 新创建的员工对象
 */
export function addEmployee(employee) {
  const employees = getEmployees();
  const newEmployee = {
    ...employee,
    id: _generateId('emp'),
    status: 'idle',
    currentTask: null,
    emotion: '平静',
    lastActivity: new Date().toISOString()
  };
  employees.push(newEmployee);
  _save(STORAGE_KEYS.EMPLOYEES, employees);
  return newEmployee;
}

/**
 * 删除员工
 * @param {string} id - 员工ID
 * @returns {boolean} 是否成功删除
 */
export function deleteEmployee(id) {
  const employees = getEmployees();
  const index = employees.findIndex(e => e.id === id);

  if (index === -1) {
    return false;
  }

  employees.splice(index, 1);
  _save(STORAGE_KEYS.EMPLOYEES, employees);
  return true;
}

/**
 * 更新员工最后活动时间
 * @param {string} id - 员工ID
 * @returns {Object|null} 更新后的员工对象，未找到返回 null
 */
export function updateEmployeeActivity(id) {
  return updateEmployee(id, {
    lastActivity: new Date().toISOString()
  });
}

/**
 * 获取员工今日统计信息
 * @param {string} employeeId - 员工ID
 * @returns {Object} 统计数据 { stepsCompleted, helpRequests, errors, totalLogs }
 */
export function getEmployeeStats(employeeId) {
  const logs = getSessionLog(employeeId);
  const today = new Date().toISOString().slice(0, 10);

  const todayLogs = logs.filter(log => log.time && log.time.slice(0, 10) === today);

  return {
    stepsCompleted: todayLogs.filter(l => l.type === 'step_complete').length,
    helpRequests: todayLogs.filter(l => l.type === 'help_request').length,
    errors: todayLogs.filter(l => l.type === 'error').length,
    totalLogs: todayLogs.length
  };
}

// ==================== 模板 CRUD 扩展 ====================

/**
 * 保存模板（创建或更新）
 * @param {Object} template - 模板数据
 * @returns {Object} 保存后的模板对象
 */
export function saveTemplate(template) {
  const templates = getTemplates();

  if (template.id) {
    // 更新已有模板
    const index = templates.findIndex(t => t.id === template.id);
    if (index !== -1) {
      templates[index] = { ...templates[index], ...template };
      _save(STORAGE_KEYS.TEMPLATES, templates);
      return templates[index];
    }
    // id 存在但未找到，回退到创建
  }

  // 创建新模板
  const newTemplate = {
    ...template,
    id: template.id || _generateId('tpl'),
    steps: template.steps || []
  };
  templates.push(newTemplate);
  _save(STORAGE_KEYS.TEMPLATES, templates);
  return newTemplate;
}

/**
 * 删除模板
 * @param {string} id - 模板ID
 * @returns {boolean} 是否成功删除
 */
export function deleteTemplate(id) {
  const templates = getTemplates();
  const index = templates.findIndex(t => t.id === id);

  if (index === -1) {
    return false;
  }

  templates.splice(index, 1);
  _save(STORAGE_KEYS.TEMPLATES, templates);
  return true;
}

/**
 * 更新模板中的某个步骤
 * @param {string} templateId - 模板ID
 * @param {number} stepIndex - 步骤索引
 * @param {Object} stepData - 新的步骤数据
 * @returns {Object|null} 更新后的模板对象，未找到返回 null
 */
export function updateTemplateStep(templateId, stepIndex, stepData) {
  const templates = getTemplates();
  const template = templates.find(t => t.id === templateId);

  if (!template || !template.steps || stepIndex < 0 || stepIndex >= template.steps.length) {
    return null;
  }

  template.steps[stepIndex] = { ...template.steps[stepIndex], ...stepData };
  _save(STORAGE_KEYS.TEMPLATES, templates);
  return template;
}

/**
 * 向模板添加新步骤
 * @param {string} templateId - 模板ID
 * @param {Object} stepData - 步骤数据
 * @returns {Object|null} 更新后的模板对象，未找到返回 null
 */
export function addTemplateStep(templateId, stepData) {
  const templates = getTemplates();
  const template = templates.find(t => t.id === templateId);

  if (!template) {
    return null;
  }

  if (!template.steps) {
    template.steps = [];
  }

  const newStep = {
    ...stepData,
    id: stepData.id || _generateId('s')
  };
  template.steps.push(newStep);
  _save(STORAGE_KEYS.TEMPLATES, templates);
  return template;
}

/**
 * 从模板中移除步骤
 * @param {string} templateId - 模板ID
 * @param {number} stepIndex - 步骤索引
 * @returns {Object|null} 更新后的模板对象，未找到返回 null
 */
export function removeTemplateStep(templateId, stepIndex) {
  const templates = getTemplates();
  const template = templates.find(t => t.id === templateId);

  if (!template || !template.steps || stepIndex < 0 || stepIndex >= template.steps.length) {
    return null;
  }

  template.steps.splice(stepIndex, 1);
  _save(STORAGE_KEYS.TEMPLATES, templates);
  return template;
}

/**
 * 重新排列模板中的步骤顺序
 * @param {string} templateId - 模板ID
 * @param {number} fromIndex - 原始索引
 * @param {number} toIndex - 目标索引
 * @returns {Object|null} 更新后的模板对象，未找到返回 null
 */
export function reorderTemplateSteps(templateId, fromIndex, toIndex) {
  const templates = getTemplates();
  const template = templates.find(t => t.id === templateId);

  if (!template || !template.steps) {
    return null;
  }

  const { steps } = template;
  if (fromIndex < 0 || fromIndex >= steps.length || toIndex < 0 || toIndex >= steps.length) {
    return null;
  }

  const [movedStep] = steps.splice(fromIndex, 1);
  steps.splice(toIndex, 0, movedStep);
  _save(STORAGE_KEYS.TEMPLATES, templates);
  return template;
}

// ==================== 存储管理 ====================

/**
 * 重置存储 — 清除所有数据并重新初始化为默认值
 * 适用于测试场景
 */
export function resetStore() {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
  initStore();
}
