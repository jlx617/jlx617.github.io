/**
 * 心工坊V2 - 基于 BroadcastChannel 的实时数据同步模块
 *
 * 本模块用于在员工标签页和咨询师标签页之间实现实时数据同步。
 * 优先使用 BroadcastChannel API，在不支持的浏览器中自动降级为 localStorage storage 事件。
 *
 * 支持的消息类型：
 * - employee_state_update: 员工状态变更（工作中、空闲、告警、已完成）
 * - step_progress: 步骤进度更新（步骤完成或当前步骤切换）
 * - alert: 新告警产生
 * - emotion_update: 员工情绪检测/变更
 * - voice_intervention: 咨询师发起语音干预
 * - task_assigned: 咨询师向员工分配任务
 */

/** 广播频道名称 */
const CHANNEL_NAME = 'xgf_v2_sync'

/** 自动重连最大次数 */
const MAX_RECONNECT_ATTEMPTS = 5

/** 重连间隔（毫秒） */
const RECONNECT_INTERVAL = 3000

/**
 * 同步管理器类
 *
 * 通过 BroadcastChannel（或 localStorage 降级方案）在多个标签页之间
 * 广播和监听消息，实现员工端与咨询师端的实时数据同步。
 */
class SyncManager {
  constructor() {
    /** @type {BroadcastChannel|null} BroadcastChannel 实例 */
    this._channel = null

    /** @type {Map<string, Set<Function>>} 按消息类型分组的监听器集合 */
    this._listeners = new Map()

    /** @type {boolean} 是否已销毁 */
    this._destroyed = false

    /** @type {number} 当前重连次数 */
    this._reconnectAttempts = 0

    /** @type {number|null} 重连定时器 */
    this._reconnectTimer = null

    /** @type {boolean} 是否使用降级方案（localStorage） */
    this._useFallback = false

    /** @type {Function|null} 降级方案的 storage 事件处理函数 */
    this._storageHandler = null

    /** @type {string} 当前标签页唯一标识，用于过滤自身发出的消息 */
    this._tabId = this._generateTabId()

    this._init()
  }

  /**
   * 生成当前标签页的唯一标识
   * @returns {string} 唯一 ID
   * @private
   */
  _generateTabId() {
    return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }

  /**
   * 初始化广播通道
   * 优先尝试 BroadcastChannel，不支持时降级为 localStorage
   * @private
   */
  _init() {
    if (this._destroyed) return

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this._channel = new BroadcastChannel(CHANNEL_NAME)
        this._channel.onmessage = (event) => this._handleMessage(event.data)
        this._channel.onerror = (error) => this._handleError(error)
        this._useFallback = false
      } catch (error) {
        console.warn('[SyncManager] BroadcastChannel 创建失败，降级为 localStorage 方案:', error)
        this._useFallback = true
        this._initFallback()
      }
    } else {
      console.warn('[SyncManager] 当前浏览器不支持 BroadcastChannel，使用 localStorage 降级方案')
      this._useFallback = true
      this._initFallback()
    }
  }

  /**
   * 初始化 localStorage 降级方案
   * 通过监听 window 的 storage 事件实现跨标签页通信
   * @private
   */
  _initFallback() {
    this._storageHandler = (event) => {
      // 只处理同步通道的 key
      if (event.key !== CHANNEL_NAME) return
      if (!event.newValue) return

      try {
        const data = JSON.parse(event.newValue)
        // 忽略自身发出的消息
        if (data._tabId === this._tabId) return
        this._handleMessage(data)
      } catch (error) {
        console.warn('[SyncManager] 解析降级消息失败:', error)
      }
    }
    window.addEventListener('storage', this._storageHandler)
  }

  /**
   * 处理接收到的消息，分发给对应类型的监听器
   * @param {Object} data - 消息数据，包含 type、payload 和 _tabId
   * @private
   */
  _handleMessage(data) {
    if (this._destroyed) return

    const { type, payload } = data
    if (!type) return

    const callbacks = this._listeners.get(type)
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(payload)
        } catch (error) {
          console.error(`[SyncManager] 消息处理器执行出错 [${type}]:`, error)
        }
      })
    }
  }

  /**
   * 处理通道错误，尝试自动重连
   * @param {Error} error - 错误对象
   * @private
   */
  _handleError(error) {
    console.error('[SyncManager] 通道错误:', error)

    if (this._destroyed) return

    if (this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this._reconnectAttempts++
      console.warn(`[SyncManager] 尝试第 ${this._reconnectAttempts} 次重连...`)

      this._reconnectTimer = setTimeout(() => {
        this._cleanup()
        this._init()
      }, RECONNECT_INTERVAL)
    } else {
      console.error('[SyncManager] 已达到最大重连次数，停止重连')
      // 达到最大重连次数后降级为 localStorage 方案
      if (!this._useFallback) {
        this._useFallback = true
        this._initFallback()
      }
    }
  }

  /**
   * 清理当前通道资源（不销毁监听器）
   * @private
   */
  _cleanup() {
    if (this._channel) {
      this._channel.onmessage = null
      this._channel.onerror = null
      try {
        this._channel.close()
      } catch (e) {
        // 忽略关闭时的错误
      }
      this._channel = null
    }

    if (this._storageHandler) {
      window.removeEventListener('storage', this._storageHandler)
      this._storageHandler = null
    }

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
  }

  /**
   * 广播消息到所有其他标签页
   *
   * @param {string} type - 消息类型，支持以下值：
   *   - 'employee_state_update' : 员工状态变更
   *   - 'step_progress'         : 步骤进度更新
   *   - 'alert'                 : 新告警
   *   - 'emotion_update'        : 情绪变更
   *   - 'voice_intervention'    : 语音干预
   *   - 'task_assigned'         : 任务分配
   * @param {Object} data - 消息负载数据
   */
  broadcast(type, data) {
    if (this._destroyed) {
      console.warn('[SyncManager] 实例已销毁，无法发送消息')
      return
    }

    const message = {
      type,
      payload: data,
      _tabId: this._tabId,
      timestamp: Date.now(),
    }

    if (this._useFallback) {
      // 降级方案：通过 localStorage 写入触发 storage 事件
      try {
        localStorage.setItem(CHANNEL_NAME, JSON.stringify(message))
      } catch (error) {
        console.error('[SyncManager] localStorage 写入失败:', error)
      }
    } else if (this._channel) {
      try {
        this._channel.postMessage(message)
      } catch (error) {
        console.error('[SyncManager] 消息发送失败:', error)
        this._handleError(error)
      }
    }
  }

  /**
   * 注册指定消息类型的监听器
   *
   * @param {string} type - 消息类型
   * @param {Function} callback - 回调函数，接收 payload 作为参数
   * @returns {Function} 取消监听的函数（便于调用方快速移除）
   */
  onMessage(type, callback) {
    if (this._destroyed) {
      console.warn('[SyncManager] 实例已销毁，无法注册监听器')
      return () => {}
    }

    if (typeof callback !== 'function') {
      throw new TypeError('[SyncManager] 回调必须是函数')
    }

    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set())
    }

    this._listeners.get(type).add(callback)

    // 返回取消监听的便捷函数
    return () => this.removeListener(type, callback)
  }

  /**
   * subscribe 是 onMessage 的别名
   */
  subscribe(type, callback) {
    return this.onMessage(type, callback)
  }

  /**
   * 移除指定消息类型的某个监听器
   *
   * @param {string} type - 消息类型
   * @param {Function} callback - 要移除的回调函数
   */
  removeListener(type, callback) {
    const callbacks = this._listeners.get(type)
    if (!callbacks) return

    callbacks.delete(callback)

    // 如果该类型已无监听器，则删除整个集合以释放内存
    if (callbacks.size === 0) {
      this._listeners.delete(type)
    }
  }

  /**
   * 销毁同步管理器
   * 关闭通道、移除所有事件监听、清除定时器
   * 销毁后不可再使用
   */
  destroy() {
    this._destroyed = true
    this._cleanup()
    this._listeners.clear()
    this._reconnectAttempts = 0
  }
}

/** 单例实例，供应用全局使用 */
export const syncManager = new SyncManager()

/** 导出类，便于单元测试 */
export default SyncManager
