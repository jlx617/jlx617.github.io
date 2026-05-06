/**
 * 员工全屏工作台 - 心工坊V2
 *
 * 核心设计理念：员工完全不需要操作，AI主动引导一切。
 * - 页面加载后自动开始任务
 * - AI语音播报每一步操作
 * - 自动检测步骤完成（原型中通过模拟按钮）
 * - 完成后展示庆祝动画
 *
 * V2 新增功能：
 * - 摄像头视图（手势/情绪检测）
 * - 语音识别（ASR）控制
 * - 从URL参数读取templateId
 * - 移动端响应式优化
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GuideEngineProvider, useGuideEngine } from '../../engine/GuideEngineContext';
import { speak, stopSpeech, isSpeaking, startListening, stopListening, isSpeechRecognitionSupported } from '../../utils/speech';
import { initStore, getEmployee, getTemplates, getTemplate } from '../../data/store';
import CameraView from '../../components/CameraView';
import TaskComplete from './TaskComplete';
import './Workstation.css';

/* ========================================
   AI状态枚举
   ======================================== */
const AI_STATUS = {
  SPEAKING: 'speaking',       // 播报中
  WAITING: 'waiting',         // 等待执行
  REMINDING: 'reminding',     // 温和提醒
  DEMO: 'demo',               // 播放示范
  ENCOURAGING: 'encouraging', // 鼓励中
  COMPLETED: 'completed',     // 已完成
};

/** AI状态对应的显示信息 */
const AI_STATUS_CONFIG = {
  [AI_STATUS.SPEAKING]: {
    icon: '🟢',
    text: 'AI正在说话...',
    className: 'workstation__ai-status--speaking',
  },
  [AI_STATUS.WAITING]: {
    icon: '🟡',
    text: '请按照AI说的做...',
    className: 'workstation__ai-status--waiting',
  },
  [AI_STATUS.REMINDING]: {
    icon: '🟡',
    text: 'AI再提醒你一下...',
    className: 'workstation__ai-status--reminding',
  },
  [AI_STATUS.DEMO]: {
    icon: '🔵',
    text: 'AI给你演示一下...',
    className: 'workstation__ai-status--demo',
  },
  [AI_STATUS.ENCOURAGING]: {
    icon: '⭐',
    text: '做得好！',
    className: 'workstation__ai-status--encouraging',
  },
  [AI_STATUS.COMPLETED]: {
    icon: '🎉',
    text: '太棒了！任务完成！',
    className: 'workstation__ai-status--completed',
  },
};

/** 情绪对应的emoji映射 */
const EMOTION_EMOJI_MAP = {
  '开心': '😊',
  'happy': '😊',
  '平静': '😐',
  'calm': '😐',
  '困惑': '😕',
  'confused': '😕',
  '生气': '😤',
  'angry': '😤',
  '难过': '😢',
  'sad': '😢',
  '焦虑': '😰',
  'anxious': '😰',
};

/* ========================================
   打字机效果Hook
   ======================================== */
function useTypewriter(text, speed = 50, enabled = true) {
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!text || !enabled) {
      setDisplayText(text || '');
      setIsTyping(false);
      return;
    }

    setDisplayText('');
    setIsTyping(true);
    let index = 0;

    const timer = setInterval(() => {
      index++;
      setDisplayText(text.slice(0, index));
      if (index >= text.length) {
        setIsTyping(false);
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed, enabled]);

  return { displayText, isTyping };
}

/* ========================================
   工作台内部组件（使用GuideEngine上下文）
   ======================================== */
function WorkstationInner({ templateName }) {
  const { engineState, start, simulateStepComplete, simulateError, requestHelp } = useGuideEngine();
  const navigate = useNavigate();

  // ---------- 状态 ----------
  const [countdown, setCountdown] = useState(2); // 准备倒计时
  const [isReady, setIsReady] = useState(false); // 是否已准备就绪
  const [isCompleted, setIsCompleted] = useState(false); // 任务是否完成
  const [aiStatus, setAiStatus] = useState(AI_STATUS.SPEAKING); // AI当前状态
  const [currentSpeechText, setCurrentSpeechText] = useState(''); // 当前语音文字
  const [stepExiting, setStepExiting] = useState(false); // 步骤切换动画
  const [waitSeconds, setWaitSeconds] = useState(0); // 等待计时
  const [taskStartTime, setTaskStartTime] = useState(null); // 任务开始时间

  // ---------- 摄像头相关状态 ----------
  const [cameraVisible, setCameraVisible] = useState(false);
  const [detectedEmotion, setDetectedEmotion] = useState('');

  // ---------- 语音识别相关状态 ----------
  const [isListening, setIsListening] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true); // 语音识别是否支持
  const [voiceToast, setVoiceToast] = useState(''); // 语音提示消息

  // ---------- 图片轮播状态 ----------
  const [currentImageIndex, setCurrentImageIndex] = useState(0); // 当前显示的图片索引
  const [loadedImages, setLoadedImages] = useState({}); // 记录已加载的图片

  // ---------- 引用 ----------
  const waitTimerRef = useRef(null);
  const prevStepIndexRef = useRef(-1);
  const voiceTimerRef = useRef(null);
  const moreMenuRef = useRef(null);
  const imageTimerRef = useRef(null);

  // ---------- 从引擎状态获取数据 ----------
  const currentStep = engineState?.currentStep || null;
  const currentStepIndex = engineState?.currentStepIndex ?? -1;
  const totalSteps = engineState?.totalSteps || 0;
  const completedSteps = engineState?.completedSteps || [];
  const taskName = templateName || '咖啡店饮品制作';
  const progress = totalSteps > 0 ? completedSteps.length / totalSteps : 0;

  // 获取完整步骤列表（用于底部缩略图）
  const [allSteps, setAllSteps] = useState([]);
  useEffect(() => {
    const templates = getTemplates();
    if (templates && templates.length > 0) {
      // 尝试找到匹配当前模板名称的模板
      const matched = templates.find(t => t.name === taskName);
      setAllSteps((matched || templates[0]).steps || []);
    }
  }, [taskName]);

  // ---------- 图片轮播自动切换 ----------
  useEffect(() => {
    const step = engineState?.currentStep || null;
    if (!step || !step.images || step.images.length === 0) return;

    const imageCount = step.images.length;

    // 步骤变化时重置到第一张图
    if (prevStepIndexRef.current !== currentStepIndex) {
      setCurrentImageIndex(0);
      prevStepIndexRef.current = currentStepIndex;
    }

    // 清除之前的定时器
    if (imageTimerRef.current) {
      clearInterval(imageTimerRef.current);
    }

    // 如果有多张图片，自动轮播（每5秒切换）
    if (imageCount > 1) {
      imageTimerRef.current = setInterval(() => {
        setCurrentImageIndex(prev => (prev + 1) % imageCount);
      }, 5000);
    }

    return () => {
      if (imageTimerRef.current) {
        clearInterval(imageTimerRef.current);
      }
    };
  }, [currentStepIndex, engineState?.currentStep]);

  // ---------- 打字机效果 ----------
  const { displayText, isTyping } = useTypewriter(
    currentSpeechText,
    50,
    !!currentSpeechText
  );

  // ---------- 初始化 ----------
  useEffect(() => {
    // 初始化数据存储
    initStore?.();

    // 设置任务开始时间
    setTaskStartTime(Date.now());

    // 检测语音识别是否支持
    const supported = isSpeechRecognitionSupported();
    setVoiceSupported(supported);
    if (!supported) {
      console.log('[Workstation] 当前浏览器不支持语音识别');
    }
  }, []);

  // ---------- 准备倒计时 ----------
  useEffect(() => {
    if (countdown <= 0) {
      setIsReady(true);
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // ---------- 准备就绪后启动任务 ----------
  useEffect(() => {
    if (isReady && start) {
      setTaskStartTime(Date.now());
      const timer = setTimeout(() => {
        start();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isReady, start]);

  // ---------- 监听引擎状态变化，驱动UI和语音 ----------
  const prevStateRef = useRef(null);
  useEffect(() => {
    if (!engineState) return;
    const prevState = prevStateRef.current;
    prevStateRef.current = engineState;

    const state = engineState.state;

    // 根据状态更新AI状态指示器
    if (state === 'announcing' || state === 'encouraging') {
      setAiStatus(AI_STATUS.SPEAKING);
    } else if (state === 'waiting') {
      setAiStatus(AI_STATUS.WAITING);
    } else if (state === 'reminding') {
      setAiStatus(AI_STATUS.REMINDING);
    } else if (state === 'demonstrating') {
      setAiStatus(AI_STATUS.DEMO);
    } else if (state === 'completed') {
      setAiStatus(AI_STATUS.COMPLETED);
      setIsCompleted(true);
      stopSpeech();
    } else if (state === 'helping') {
      setAiStatus(AI_STATUS.REMINDING);
    }

    // 从消息列表中获取最新的语音文字
    const msgs = engineState.messages || [];
    if (msgs.length > 0) {
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.text) {
        setCurrentSpeechText(lastMsg.text);
        // 如果是新的播报类消息，触发语音
        if (lastMsg.type === 'speak' || lastMsg.type === 'remind' || lastMsg.type === 'encourage') {
          speak(lastMsg.text);
        }
      }
    }

    // 步骤变化时触发切换动画
    if (prevState && prevState.currentStepIndex !== engineState.currentStepIndex) {
      setStepExiting(true);
      setTimeout(() => setStepExiting(false), 400);
    }
  }, [engineState]);

  // ---------- 等待计时器 ----------
  useEffect(() => {
    if (aiStatus !== AI_STATUS.WAITING) {
      setWaitSeconds(0);
      if (waitTimerRef.current) {
        clearInterval(waitTimerRef.current);
        waitTimerRef.current = null;
      }
      return;
    }

    waitTimerRef.current = setInterval(() => {
      setWaitSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (waitTimerRef.current) {
        clearInterval(waitTimerRef.current);
      }
    };
  }, [aiStatus]);

  // ---------- 模拟完成当前步骤 ----------
  const handleSimulateComplete = useCallback(() => {
    if (simulateStepComplete) {
      simulateStepComplete();
    }
  }, [simulateStepComplete]);

  // ---------- 模拟求助 ----------
  const handleSimulateHelp = useCallback(() => {
    if (requestHelp) {
      requestHelp();
    } else if (currentStep) {
      const helpText = `没关系，让我再告诉你一次。${currentStep.voiceText || currentStep.description || ''}`;
      setCurrentSpeechText(helpText);
      speak(helpText);
    }
  }, [requestHelp, currentStep]);

  // ---------- 手势检测回调 ----------
  const handleGestureDetected = useCallback((gesture) => {
    if (gesture === 'thumbs_up') {
      handleSimulateComplete();
    } else if (gesture === 'open_palm') {
      handleSimulateHelp();
    }
  }, [handleSimulateComplete, handleSimulateHelp]);

  // ---------- 情绪检测回调 ----------
  const handleEmotionDetected = useCallback((emotion) => {
    setDetectedEmotion(emotion);
  }, []);

  // ---------- 摄像头切换 ----------
  const toggleCamera = useCallback(() => {
    setCameraVisible((prev) => !prev);
  }, []);

  // ---------- 语音识别结果处理 ----------
  const handleVoiceResult = useCallback((transcript) => {
    const text = transcript.trim();
    if (!text) return;

    // 检测完成关键词
    if (text.includes('好了') || text.includes('完成') || text.includes('做完了')) {
      handleSimulateComplete();
    }
    // 检测求助关键词
    else if (text.includes('帮帮我') || text.includes('帮助') || text.includes('不会')) {
      handleSimulateHelp();
    }
  }, [handleSimulateComplete, handleSimulateHelp]);

  // ---------- 开始语音识别 ----------
  const handleStartListening = useCallback(() => {
    if (isListening) return;

    // 检查浏览器是否支持语音识别
    if (!voiceSupported) {
      setVoiceToast('当前浏览器不支持语音识别，请使用Chrome/Safari浏览器');
      setTimeout(() => setVoiceToast(''), 3000);
      return;
    }

    setIsListening(true);
    setVoiceToast('请说话...');

    // 5秒后自动停止
    if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
    voiceTimerRef.current = setTimeout(() => {
      stopListening();
      setIsListening(false);
      setVoiceToast('');
      voiceTimerRef.current = null;
    }, 5000);

    startListening({
      continuous: false,
      onResult: (text) => {
        handleVoiceResult(text);
        setVoiceToast(`识别到: ${text}`);
        setTimeout(() => setVoiceToast(''), 2000);
      },
      onEnd: () => {
        setIsListening(false);
        setVoiceToast('');
        if (voiceTimerRef.current) {
          clearTimeout(voiceTimerRef.current);
          voiceTimerRef.current = null;
        }
      },
      onError: (err) => {
        setIsListening(false);
        setVoiceToast('语音识别出错，请重试');
        setTimeout(() => setVoiceToast(''), 2000);
        if (voiceTimerRef.current) {
          clearTimeout(voiceTimerRef.current);
          voiceTimerRef.current = null;
        }
      },
    });
  }, [isListening, handleVoiceResult, voiceSupported]);

  // ---------- 停止语音识别 ----------
  const handleStopListening = useCallback(() => {
    stopListening();
    setIsListening(false);
    if (voiceTimerRef.current) {
      clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }, []);

  // ---------- 清理语音识别计时器 ----------
  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) {
        clearTimeout(voiceTimerRef.current);
      }
      stopListening();
    };
  }, []);

  // ---------- 点击外部关闭更多菜单 ----------
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showMoreMenu]);

  // ---------- 任务名称（从引擎消息中提取）----------
  const handleRestart = useCallback(() => {
    stopSpeech();
    navigate('/');
  }, [navigate]);

  // ---------- 计算用时 ----------
  const durationSeconds = useMemo(() => {
    if (!taskStartTime) return 0;
    return Math.floor((Date.now() - taskStartTime) / 1000);
  }, [taskStartTime, isCompleted]);

  // ---------- 计算进度百分比 ----------
  const progressPercent = useMemo(() => {
    if (allSteps.length === 0) return 0;
    return ((currentStepIndex + 1) / allSteps.length) * 100;
  }, [currentStepIndex, allSteps.length]);

  // ---------- AI状态配置 ----------
  const statusConfig = AI_STATUS_CONFIG[aiStatus] || AI_STATUS_CONFIG[AI_STATUS.WAITING];

  // ---------- 情绪emoji ----------
  const emotionEmoji = useMemo(() => {
    if (!detectedEmotion) return '';
    return EMOTION_EMOJI_MAP[detectedEmotion] || '😐';
  }, [detectedEmotion]);

  // ---------- 渲染：准备倒计时 ----------
  if (!isReady) {
    return (
      <div className="workstation">
        <div className="workstation__countdown">
          <div className="workstation__countdown-text">即将开始任务</div>
          <div className="workstation__countdown-number">{countdown}</div>
          <div className="workstation__countdown-task">{taskName}</div>
        </div>
      </div>
    );
  }

  // ---------- 渲染：任务完成 ----------
  if (isCompleted) {
    return (
      <TaskComplete
        taskName={taskName}
        totalSteps={allSteps.length}
        duration={durationSeconds}
        starCount={5}
        onBackHome={handleRestart}
        countdownSeconds={10}
      />
    );
  }

  // ---------- 渲染：正常工作台 ----------
  return (
    <div className="workstation">
      {/* ====== 摄像头视图 ====== */}
      <CameraView
        visible={cameraVisible}
        onToggle={toggleCamera}
        onGestureDetected={handleGestureDetected}
        onEmotionDetected={handleEmotionDetected}
      />

      {/* ====== 顶部状态栏 ====== */}
      <div className="workstation__header">
        <div className="workstation__header-top">
          <button
            className="workstation__back-btn"
            onClick={() => { stopSpeech(); navigate('/'); }}
            title="返回首页"
          >
            ← 返回
          </button>
          <div className="workstation__header-info">
            <span className="workstation__task-name">
              任务名称: {taskName}
            </span>
            <span className="workstation__step-counter">
              步骤 {currentStepIndex + 1}/{allSteps.length}
            </span>
          </div>
          <div className="workstation__header-actions">
            {/* 情绪指示器 */}
            {emotionEmoji && (
              <span className="workstation__emotion-indicator" title={`情绪: ${detectedEmotion}`}>
                {emotionEmoji}
              </span>
            )}
            {/* 摄像头切换按钮 */}
            <button
              className="workstation__camera-toggle"
              onClick={toggleCamera}
              title={cameraVisible ? '关闭摄像头' : '开启摄像头'}
            >
              📷
            </button>
          </div>
        </div>
        {/* 红黄绿渐变进度条 */}
        <div className="workstation__progress-bar">
          <div
            className="workstation__progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* ====== 主显示区域 ====== */}
      <div className="workstation__main">
        {currentStep && (
          <div
            className={`workstation__step-content ${
              stepExiting ? 'workstation__step-content--exiting' : ''
            }`}
            key={currentStepIndex}
          >
            {/* 步骤指导图片轮播 */}
            <div className="workstation__step-image">
              {currentStep.images && currentStep.images.length > 0 ? (
                <>
                  <img
                    src={currentStep.images[currentImageIndex]}
                    alt={`步骤${currentImageIndex + 1}/${currentStep.images.length}`}
                    className="workstation__step-img"
                    key={currentImageIndex}
                    onError={(e) => {
                      // 图片加载失败时隐藏
                      e.target.style.display = 'none';
                    }}
                  />
                  {/* 图片指示器 */}
                  {currentStep.images.length > 1 && (
                    <div className="workstation__image-dots">
                      {currentStep.images.map((_, idx) => (
                        <span
                          key={idx}
                          className={`workstation__image-dot ${idx === currentImageIndex ? 'workstation__image-dot--active' : ''}`}
                          onClick={() => setCurrentImageIndex(idx)}
                        />
                      ))}
                    </div>
                  )}
                  {/* 图片计数 */}
                  {currentStep.images.length > 1 && (
                    <div className="workstation__image-counter">
                      {currentImageIndex + 1} / {currentStep.images.length}
                    </div>
                  )}
                </>
              ) : (
                <div className="workstation__step-emoji">
                  {currentStep.imageUrl || '📋'}
                </div>
              )}
            </div>

            {/* 步骤标题（超大字体） */}
            <div className="workstation__step-title">
              {currentStep.title || '进行中...'}
            </div>

            {/* 步骤描述（大字体） */}
            <div className="workstation__step-desc">
              {currentStep.description || ''}
            </div>

            {/* 语音文字气泡（带打字机效果） */}
            {displayText && (
              <div
                className={`workstation__speech-bubble ${
                  aiStatus === AI_STATUS.SPEAKING
                    ? 'workstation__speech-bubble--speaking'
                    : ''
                }`}
              >
                🔊 &quot;{displayText}&quot;
                {isTyping && <span className="workstation__speech-cursor" />}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====== AI状态指示器 ====== */}
      <div className={`workstation__ai-status ${statusConfig.className}`}>
        <span className="workstation__ai-status-icon">
          {statusConfig.icon}
        </span>
        <span>{statusConfig.text}</span>
        {aiStatus === AI_STATUS.WAITING && waitSeconds > 0 && (
          <span className="workstation__ai-timer">
            已等待 {waitSeconds}秒
          </span>
        )}
      </div>

      {/* ====== 底部区域 ====== */}
      <div className="workstation__footer">
        {/* 步骤缩略图（横向滚动） */}
        <div className="workstation__steps-thumbs">
          {allSteps.map((step, index) => {
            // 确定步骤状态
            let thumbClass = 'workstation__step-thumb--future';
            if (index < currentStepIndex) {
              thumbClass = 'workstation__step-thumb--completed';
            } else if (index === currentStepIndex) {
              thumbClass = 'workstation__step-thumb--current';
            }

            // 步骤之间的连接线
            const connector = index < allSteps.length - 1 && (
              <div
                key={`conn-${index}`}
                className={`workstation__step-connector ${
                  index < currentStepIndex
                    ? 'workstation__step-connector--completed'
                    : ''
                }`}
              />
            );

            return (
              <React.Fragment key={index}>
                <div className={`workstation__step-thumb ${thumbClass}`}>
                  <div className="workstation__step-thumb-icon">
                    {index < currentStepIndex ? '✓' : (step.imageUrl || step.emoji || '○')}
                  </div>
                  <span className="workstation__step-thumb-label">
                    {step.title || `步骤${index + 1}`}
                  </span>
                </div>
                {connector}
              </React.Fragment>
            );
          })}
        </div>

        {/* 底部操作按钮 */}
        <div className="workstation__action-bar">
          {/* 语音识别按钮 */}
          <button
            className={`workstation__voice-btn ${isListening ? 'workstation__voice-btn--listening' : ''} ${!voiceSupported ? 'workstation__voice-btn--disabled' : ''}`}
            onClick={isListening ? handleStopListening : handleStartListening}
            title={!voiceSupported ? '当前浏览器不支持语音识别' : (isListening ? '停止语音识别' : '点击说话')}
            disabled={!voiceSupported}
          >
            {isListening ? (
              <span className="workstation__voice-btn-pulse">
                🎤
                <span className="workstation__voice-btn-ring" />
              </span>
            ) : (
              '🎤'
            )}
            <span className="workstation__voice-btn-label">
              {isListening ? '正在听...' : (voiceSupported ? '语音' : '不支持')}
            </span>
          </button>

          {/* 语音提示 Toast */}
          {voiceToast && (
            <div className="workstation__voice-toast">
              {voiceToast}
            </div>
          )}

          {/* 模拟按钮（桌面端直接显示，移动端折叠到"更多"菜单） */}
          <div className="workstation__demo-buttons">
            <button
              className="workstation__demo-btn workstation__demo-btn--complete"
              onClick={handleSimulateComplete}
            >
              模拟完成当前步骤
            </button>
            <button
              className="workstation__demo-btn workstation__demo-btn--help"
              onClick={handleSimulateHelp}
            >
              模拟求助
            </button>
          </div>

          {/* 移动端"更多"菜单按钮 */}
          <div className="workstation__more-menu-wrapper" ref={moreMenuRef}>
            <button
              className="workstation__more-btn"
              onClick={() => setShowMoreMenu((prev) => !prev)}
            >
              更多
            </button>
            {showMoreMenu && (
              <div className="workstation__more-menu">
                <button
                  className="workstation__demo-btn workstation__demo-btn--complete"
                  onClick={() => { handleSimulateComplete(); setShowMoreMenu(false); }}
                >
                  模拟完成当前步骤
                </button>
                <button
                  className="workstation__demo-btn workstation__demo-btn--help"
                  onClick={() => { handleSimulateHelp(); setShowMoreMenu(false); }}
                >
                  模拟求助
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================
   Workstation 主组件
   先加载模板数据，再传入 GuideEngineProvider
   ======================================== */
export default function Workstation() {
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    initStore();

    const templateId = searchParams.get('templateId');

    if (templateId) {
      // 根据URL参数查找指定模板
      const tpl = getTemplate(templateId);
      if (tpl) {
        setTemplate(tpl);
      } else {
        // 模板不存在，跳转到任务选择页
        navigate('/employee/select', { replace: true });
        return;
      }
    } else {
      // 没有提供templateId，跳转到任务选择页
      navigate('/employee/select', { replace: true });
      return;
    }

    setLoading(false);
  }, [searchParams, navigate]);

  if (loading) {
    return (
      <div className="workstation">
        <div className="workstation__loading">
          <div className="workstation__loading-spinner" />
          <p>正在准备工作台...</p>
        </div>
      </div>
    );
  }

  if (!template) {
    return null; // 正在跳转中
  }

  return (
    <GuideEngineProvider template={template}>
      <WorkstationInner templateName={template.name} />
    </GuideEngineProvider>
  );
}
