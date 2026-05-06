/**
 * GuideEngineContext — 心工坊V2
 * React Context 用于在组件间共享 GuideEngine 实例
 * 提供引擎的创建、启动、控制和状态访问
 *
 * 集成功能V2：视觉检测、语音指令、BroadcastChannel 同步、情绪追踪
 */

import { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import GuideEngine, { STATES } from './GuideEngine';
import { speak as speechSpeak, speakWithCallback } from '../utils/speech';
import { updateEmployee, addAlert, addSessionLog, initStore, updateEmployeeActivity } from '../data/store';

/** BroadcastChannel 辅助函数，避免 minifier 优化导致的方法丢失 */
let _syncChannel = null;
function _getSyncChannel() {
  if (!_syncChannel) {
    try { _syncChannel = new BroadcastChannel('xgf_v2_sync'); } catch(e) { console.warn('BroadcastChannel不可用'); }
  }
  return _syncChannel;
}
function _syncBroadcast(type, data) {
  const ch = _getSyncChannel();
  if (ch) try { ch.postMessage({ type, payload: data }); } catch(e) {}
}

/**
 * React Context 对象
 * 子组件通过 useGuideEngine() 获取引擎实例和状态
 */
export const GuideEngineContext = createContext(null);

/**
 * GuideEngineProvider — 引擎上下文提供者
 * 包裹在组件树顶层，为所有子组件提供 GuideEngine 的访问能力
 *
 * @example
 * <GuideEngineProvider template={taskTemplate}>
 *   <App />
 * </GuideEngineProvider>
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - 子组件
 * @param {Object} props.template - 任务模板对象
 * @param {Function} props.onSpeak - 语音播报回调（可选，默认使用 speech 工具）
 * @param {Function} props.onAlert - 辅导员通知回调（可选）
 * @param {Function} props.onLog - 日志记录回调（可选）
 */
export function GuideEngineProvider({ children, template, employeeId = 'emp_001', onSpeak, onAlert, onLog }) {
  // 引擎实例引用（使用 ref 避免重新创建）
  const engineRef = useRef(null);

  // 引擎状态（使用 state 驱动UI更新）
  const [engineState, setEngineState] = useState({
    state: STATES.IDLE,
    currentStepIndex: 0,
    currentStep: null,
    completedSteps: [],
    totalSteps: 0,
    elapsedTime: 0,
    messages: [],
    isRunning: false
  });

  // 视觉检测相关状态
  const [visionActive, setVisionActive] = useState(false);
  const [detectedEmotion, setDetectedEmotion] = useState('');
  const [cameraVisible, setCameraVisible] = useState(false);

  // ======== 视觉检测结果处理 ========

  /**
   * 处理视觉检测结果（手势 + 情绪）
   * 注意：此函数使用 engineRef.current 直接调用引擎方法，避免循环依赖
   * @param {Object} result - 视觉检测结果
   * @param {string} [result.gesture] - 检测到的手势（如 'thumbs_up', 'open_palm'）
   * @param {string} [result.emotion] - 检测到的情绪（如 'happy', 'confused', 'frustrated'）
   */
  const handleVisionResult = useCallback((result) => {
    if (!result) return;

    // 处理手势 - 直接使用引擎引用，不依赖外部函数
    if (result.gesture === 'thumbs_up') {
      if (engineRef.current) {
        engineRef.current.simulateStepComplete();
        // 延迟同步状态（等鼓励动画播放完）
        setTimeout(() => {
          if (engineRef.current) {
            setEngineState(engineRef.current.getState());
          }
        }, 2500);
      }
    } else if (result.gesture === 'open_palm') {
      if (engineRef.current) {
        engineRef.current.requestHelp();
        setEngineState(engineRef.current.getState());
      }
    }

    // 处理情绪变化
    if (result.emotion && result.emotion !== detectedEmotion) {
      setDetectedEmotion(result.emotion);
      if (engineRef.current && typeof engineRef.current.setEmotion === 'function') {
        engineRef.current.setEmotion(result.emotion);
      }
      // 广播情绪更新给辅导员端
      _syncBroadcast('emotion_update', { employeeId, emotion: result.emotion });
    }
  }, [detectedEmotion, employeeId]);

  // ======== 语音指令处理 ========

  /** 完成相关关键词 */
  const COMPLETION_KEYWORDS = ['完成', '好了', '做完了', '下一步', 'ok', 'OK', '可以了', '搞定了', '结束'];
  /** 求助相关关键词 */
  const HELP_KEYWORDS = ['帮助', '帮忙', '不会', '不懂', '求助', '太难了', '教我', '怎么办'];

  /**
   * 处理语音识别结果（ASR 文本）
   * 注意：此函数使用 engineRef.current 直接调用引擎方法，避免循环依赖
   * @param {string} text - 语音识别文本
   */
  const handleVoiceResult = useCallback((text) => {
    if (!text) return;
    const normalized = text.toLowerCase().trim();

    // 检测完成关键词 - 直接使用引擎引用
    if (COMPLETION_KEYWORDS.some((kw) => normalized.includes(kw.toLowerCase()))) {
      if (engineRef.current) {
        engineRef.current.simulateStepComplete();
        // 延迟同步状态（等鼓励动画播放完）
        setTimeout(() => {
          if (engineRef.current) {
            setEngineState(engineRef.current.getState());
          }
        }, 2500);
      }
      return;
    }

    // 检测求助关键词 - 直接使用引擎引用
    if (HELP_KEYWORDS.some((kw) => normalized.includes(kw.toLowerCase()))) {
      if (engineRef.current) {
        engineRef.current.requestHelp();
        setEngineState(engineRef.current.getState());
      }
      return;
    }
  }, []);

  // ======== 摄像头切换 ========

  /**
   * 切换摄像头显示/隐藏
   */
  const toggleCamera = useCallback(() => {
    setCameraVisible((prev) => !prev);
  }, []);

  // ======== BroadcastChannel 同步监听 ========

  useEffect(() => {
    /**
     * 监听来自辅导员端的 voice_intervention 消息
     * 直接使用 BroadcastChannel API，避免 syncManager 方法名被 minifier 优化的问题
     */
    let channel = null;
    try {
      channel = new BroadcastChannel('xgf_v2_sync');
      channel.onmessage = (event) => {
        const { type, payload } = event.data || {};
        if (type === 'voice_intervention' && payload && payload.employeeId === employeeId && payload.text) {
          try {
            speakWithCallback(payload.text, () => {
              addSessionLog(employeeId, {
                type: 'intervention',
                content: '辅导员语音干预已播报: ' + payload.text
              });
            });
          } catch (e) {
            console.warn('辅导员语音干预播报失败:', e);
          }
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel 不可用:', e);
    }

    return () => {
      if (channel) {
        channel.close();
      }
    };
  }, [employeeId]);

  // 创建或重建引擎实例
  useEffect(() => {
    // 销毁旧引擎
    if (engineRef.current) {
      engineRef.current.destroy();
    }

    // 创建新引擎
    const engine = new GuideEngine({
      template: template || { id: '', name: '', steps: [] },
      onStateChange: (state) => {
        // 状态变化时同步完整引擎状态
        if (engineRef.current) {
          setEngineState(engineRef.current.getState());
          // 写入会话日志供辅导员端读取
          addSessionLog(employeeId, {
            type: 'state_change',
            content: 'AI状态变化: ' + state
          });
          // BroadcastChannel 同步：广播员工状态更新
          _syncBroadcast('employee_state_update', {
            employeeId,
            state,
            stepIndex: engineRef.current.getState().currentStepIndex
          });
        }
      },
      onSpeak: onSpeak || ((text) => {
        // 默认使用 Web Speech API 播报
        try {
          speechSpeak(text);
          addSessionLog(employeeId, { type: 'ai', content: text });
        } catch (e) {
          console.warn('语音播报不可用:', e);
        }
      }),
      onSpeakWithCallback: (text, onDone) => {
        try {
          speakWithCallback(text, onDone);
        } catch (e) {
          console.warn('带回调语音播报不可用:', e);
          onDone();
        }
      },
      onVisionResult: (result) => {
        // 视觉检测结果回调，转发给 handleVisionResult 处理
        handleVisionResult(result);
      },
      onAlert: (type, data) => {
        // 写入 localStorage 供辅导员端读取
        if (type === 'task_completed') {
          updateEmployee(employeeId, { status: 'completed', currentTask: null });
        } else if (type === 'help_request' || type === 'auto_help') {
          addAlert({
            type: type,
            employeeId: employeeId,
            message: data?.message || '员工需要帮助'
          });
          updateEmployee(employeeId, { status: 'alert' });
        } else if (type === 'error') {
          addAlert({
            type: 'error',
            employeeId: employeeId,
            message: data?.message || '检测到错误操作'
          });
        }
        // BroadcastChannel 同步：广播告警
        _syncBroadcast('alert', { employeeId, type, data });
        // 调用外部回调
        if (onAlert) onAlert(type, data);
      },
      onLog: onLog || ((message) => {
        console.log('[引擎日志]', message);
      }),
      onStepProgress: (stepIndex, totalSteps) => {
        // BroadcastChannel 同步：广播步骤进度
        _syncBroadcast('step_progress', { employeeId, stepIndex, totalSteps });
      }
    });

    engineRef.current = engine;

    // 初始化状态
    setEngineState(engine.getState());

    // 组件卸载时销毁引擎
    return () => {
      engine.destroy();
    };
  }, [template, onSpeak, onAlert, onLog, handleVisionResult]);

  /**
   * 启动任务
   */
  const start = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.start();
      // 启动后立即同步一次状态
      setEngineState(engineRef.current.getState());
      updateEmployee(employeeId, { status: 'working' });
      // 更新员工最近活动时间
      updateEmployeeActivity(employeeId);
    }
  }, [employeeId]);

  /**
   * 模拟步骤完成
   */
  const simulateStepComplete = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.simulateStepComplete();
      // 延迟同步状态（等鼓励动画播放完）
      setTimeout(() => {
        if (engineRef.current) {
          setEngineState(engineRef.current.getState());
        }
      }, 2500);
    }
  }, []);

  /**
   * 模拟检测到错误
   */
  const simulateError = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.simulateError();
      setEngineState(engineRef.current.getState());
    }
  }, []);

  /**
   * 员工求助
   */
  const requestHelp = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.requestHelp();
      setEngineState(engineRef.current.getState());
    }
  }, []);

  /**
   * 辅导员远程推进步骤
   */
  const advanceStep = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.advanceStep();
      setEngineState(engineRef.current.getState());
    }
  }, []);

  /**
   * 辅导员回退步骤
   */
  const goBackStep = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.goBackStep();
      setEngineState(engineRef.current.getState());
    }
  }, []);

  /**
   * 获取鼓励语
   */
  const getEncouragement = useCallback(() => {
    if (engineRef.current) {
      return engineRef.current.getEncouragement();
    }
    return '你做得很好！';
  }, []);

  /**
   * 刷新引擎状态（手动同步）
   */
  const refreshState = useCallback(() => {
    if (engineRef.current) {
      setEngineState(engineRef.current.getState());
    }
  }, []);

  // Context 值
  const contextValue = {
    engine: engineRef.current,
    engineState,
    start,
    simulateStepComplete,
    simulateError,
    requestHelp,
    advanceStep,
    goBackStep,
    getEncouragement,
    refreshState,
    // 视觉检测相关
    visionActive,
    detectedEmotion,
    cameraVisible,
    toggleCamera,
    handleVisionResult,
    handleVoiceResult
  };

  return (
    <GuideEngineContext.Provider value={contextValue}>
      {children}
    </GuideEngineContext.Provider>
  );
}

/**
 * useGuideEngine — 自定义 Hook
 * 在组件中获取 GuideEngine 的实例和方法
 *
 * @example
 * function MyComponent() {
 *   const { engineState, start, simulateStepComplete } = useGuideEngine();
 *   return <button onClick={start}>开始任务</button>;
 * }
 *
 * @returns {Object} 引擎上下文值
 * @returns {Object} return.engineState - 当前引擎状态
 * @returns {Function} return.start - 启动任务
 * @returns {Function} return.simulateStepComplete - 模拟步骤完成
 * @returns {Function} return.simulateError - 模拟检测到错误
 * @returns {Function} return.requestHelp - 员工求助
 * @returns {Function} return.advanceStep - 辅导员推进步骤
 * @returns {Function} return.goBackStep - 辅导员回退步骤
 * @returns {Function} return.getEncouragement - 获取鼓励语
 * @returns {Function} return.refreshState - 刷新引擎状态
 * @returns {boolean} return.visionActive - 视觉检测是否激活
 * @returns {string} return.detectedEmotion - 当前检测到的情绪
 * @returns {boolean} return.cameraVisible - 摄像头是否可见
 * @returns {Function} return.toggleCamera - 切换摄像头显示/隐藏
 * @returns {Function} return.handleVisionResult - 处理视觉检测结果（手势 + 情绪）
 * @returns {Function} return.handleVoiceResult - 处理语音识别结果（ASR 文本）
 */
export function useGuideEngine() {
  const context = useContext(GuideEngineContext);

  if (!context) {
    throw new Error('useGuideEngine 必须在 GuideEngineProvider 内部使用');
  }

  return context;
}

export default GuideEngineContext;
