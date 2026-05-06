/**
 * AI引导状态机引擎 — 心工坊V2 核心模块
 * 管理AI引导的完整生命周期，包括指令播报、等待执行、温和提醒、
 * 示范演示、完成检测、鼓励反馈、错误纠正和求助处理。
 *
 * 引导策略时间线（每个步骤）：
 *   0s  → 播报指令（ANNOUNCING → WAITING）
 *   5s  → 如果未检测到动作 → 温和提醒（REMINDING）
 *  10s  → 如果仍未完成 → 详细分解指令
 *  15s  → 如果仍未完成 → 播放示范动画+语音（DEMONSTRATING）
 *  30s  → 如果仍未完成 → "需要帮助吗？"（CHECKING）
 *  45s  → 如果仍未完成 → 自动通知辅导员（HELPING）
 */

/**
 * 引导状态枚举
 */
const STATES = {
  IDLE: 'idle',                       // 空闲，等待开始
  ANNOUNCING: 'announcing',           // 正在播报指令
  WAITING: 'waiting',                 // 等待员工执行
  REMINDING: 'reminding',             // 温和提醒
  DEMONSTRATING: 'demonstrating',     // 播放示范
  CHECKING: 'checking',               // 检测是否完成
  ENCOURAGING: 'encouraging',         // 鼓励反馈
  COMPLETED: 'completed',             // 任务完成
  HELPING: 'helping',                 // 求助中
  ERROR_CORRECTING: 'error_correcting' // 错误纠正
};

/**
 * 时间线节点配置（单位：秒）— 基准值，实际值受难度系数影响
 */
const TIMELINE = {
  REMIND: 5,          // 5秒后温和提醒
  DETAIL: 10,         // 10秒后详细分解
  DEMONSTRATE: 15,    // 15秒后播放示范
  CHECK_HELP: 30,     // 30秒后询问是否需要帮助
  AUTO_HELP: 45       // 45秒后自动通知辅导员
};

/**
 * 难度系数映射
 */
const DIFFICULTY_MULTIPLIERS = {
  easy: 1.5,
  medium: 1.0,
  hard: 0.7
};

/**
 * 鼓励语库 — 至少20条不同的鼓励语
 */
const ENCOURAGEMENTS = [
  '你做得很好，继续保持！',
  '太棒了，你真厉害！',
  '非常好，你学得很快！',
  '你做得真漂亮！',
  '继续加油，你一定可以的！',
  '你今天表现特别好！',
  '做得对，就是这样！',
  '你真是个好帮手！',
  '很好很好，你越来越熟练了！',
  '你做得比上次更好了！',
  '太优秀了，大家都在为你鼓掌！',
  '你真的很努力，为你点赞！',
  '你完成得非常好，继续保持！',
  '你做得又快又好！',
  '你真聪明，一下子就学会了！',
  '做得好，你是最棒的！',
  '你进步好大，继续努力！',
  '你做得非常认真，值得表扬！',
  '你做得太好了，老师为你骄傲！',
  '你真了不起，又学会了一个新技能！',
  '你做得很细心，非常好！',
  '你做得越来越好了，真棒！',
  '你今天的表现让人刮目相看！',
  '你完成得很出色，给自己鼓个掌吧！'
];

/**
 * 庆祝语库 — 任务完成时的庆祝语音
 */
const CELEBRATIONS = [
  '太棒了！任务全部完成了！你真是最棒的！',
  '恭喜你！所有步骤都完成了！你做得非常好！',
  '任务完成啦！你今天表现太出色了！',
  '全部完成！你真了不起！给自己鼓个掌吧！'
];

/**
 * 提醒语库 — 温和提醒的语音文案
 */
const REMINDERS = [
  '还记得刚才说的吗？再试一次吧。',
  '别着急，慢慢来，你可以的。',
  '再看看提示，按照步骤来就好。',
  '没关系，我们再来一次。',
  '仔细看一下步骤说明，你可以做到的。'
];

/**
 * 求助询问语库
 */
const HELP_CHECKS = [
  '需要帮助吗？可以举手告诉老师哦。',
  '如果觉得有点难，可以让老师来帮你。',
  '没关系，需要帮忙随时说哦。'
];

export { STATES };

/**
 * GuideEngine — AI引导状态机引擎
 *
 * @example
 * const engine = new GuideEngine({
 *   template: taskTemplate,
 *   difficulty: 'medium',          // 难度级别: 'easy' | 'medium' | 'hard'
 *   onStateChange: (state) => console.log('状态变化:', state),
 *   onSpeak: (text) => speech.speak(text),
 *   onSpeakWithCallback: (text, onDone) => speech.speak(text, { onEnd: onDone }),
 *   onVisionResult: (result) => console.log('视觉结果:', result),
 *   onAlert: (type, data) => console.log('通知辅导员:', type, data),
 *   onLog: (msg) => console.log('日志:', msg)
 * });
 * engine.start();
 */
class GuideEngine {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {Object} options.template - 任务模板对象
   * @param {string} options.template.id - 模板ID
   * @param {string} options.template.name - 模板名称
   * @param {Array} options.template.steps - 步骤数组
   * @param {Function} options.onStateChange - 状态变化回调
   * @param {Function} options.onSpeak - 语音播报回调
   * @param {Function} [options.onSpeakWithCallback] - 带完成回调的语音播报，参数为 (text, onDone)
   * @param {Function} [options.onVisionResult] - 视觉检测结果回调（预留，外部调用 handleVisionResult）
   * @param {Function} options.onAlert - 辅导员通知回调
   * @param {Function} options.onLog - 日志记录回调
   * @param {string} [options.difficulty='medium'] - 难度级别: 'easy' | 'medium' | 'hard'
   */
  constructor(options = {}) {
    this.template = options.template || { id: '', name: '', steps: [] };
    this.onStateChange = options.onStateChange || (() => {});
    this.onSpeak = options.onSpeak || (() => {});
    this.onSpeakWithCallback = options.onSpeakWithCallback || null;
    this.onVisionResult = options.onVisionResult || null;
    this.onAlert = options.onAlert || (() => {});
    this.onLog = options.onLog || (() => {});

    // 难度设置
    this.difficulty = options.difficulty || 'medium';
    const multiplier = DIFFICULTY_MULTIPLIERS[this.difficulty] || 1.0;
    this._timeline = {
      REMIND: Math.round(TIMELINE.REMIND * multiplier),
      DETAIL: Math.round(TIMELINE.DETAIL * multiplier),
      DEMONSTRATE: Math.round(TIMELINE.DEMONSTRATE * multiplier),
      CHECK_HELP: Math.round(TIMELINE.CHECK_HELP * multiplier),
      AUTO_HELP: Math.round(TIMELINE.AUTO_HELP * multiplier)
    };

    // 当前状态
    this._state = STATES.IDLE;
    this._currentStepIndex = 0;
    this._completedSteps = [];
    this._elapsedTime = 0;          // 当前步骤已等待时间（秒）
    this._messages = [];            // 交互消息记录
    this._timelineTriggered = {};   // 已触发的时间线节点
    this._isRunning = false;        // 引擎是否运行中

    // 情感状态
    this.currentEmotion = null;

    // 定时器引用
    this._tickInterval = null;
    this._tickRate = 1000;          // 每秒触发一次

    this._log('引擎初始化完成，任务模板: ' + this.template.name + '，难度: ' + this.difficulty);
  }

  /**
   * 启动任务
   */
  start() {
    if (!this.template.steps || this.template.steps.length === 0) {
      this._log('错误：任务模板没有步骤');
      return;
    }

    this._isRunning = true;
    this._currentStepIndex = 0;
    this._completedSteps = [];
    this._messages = [];
    this._elapsedTime = 0;
    this._timelineTriggered = {};
    this.currentEmotion = null;

    this._log('任务开始: ' + this.template.name);
    this._addMessage('system', '任务「' + this.template.name + '」已开始');

    // 启动第一个步骤
    this._startStep(0);

    // 启动计时器
    this._startTicker();
  }

  /**
   * 模拟步骤完成（原型中用按钮触发，真实环境由摄像头识别触发）
   */
  simulateStepComplete() {
    if (this._state === STATES.COMPLETED || this._state === STATES.IDLE) {
      return;
    }

    // 如果当前在求助或错误纠正状态，先恢复正常流程
    if (this._state === STATES.HELPING || this._state === STATES.ERROR_CORRECTING) {
      this._log('从异常状态恢复，继续执行');
    }

    const step = this.template.steps[this._currentStepIndex];
    this._completedSteps.push(this._currentStepIndex);
    this._addMessage('success', '步骤完成: ' + step.title);

    // 播放鼓励语
    const encouragement = this.getEncouragement();
    this._speak(encouragement);
    this._setState(STATES.ENCOURAGING);

    // 延迟后进入下一步
    setTimeout(() => {
      this._advanceToNextStep();
    }, 2000);
  }

  /**
   * 模拟检测到错误
   */
  simulateError() {
    if (this._state === STATES.COMPLETED || this._state === STATES.IDLE) {
      return;
    }

    this._log('检测到错误操作');
    this._setState(STATES.ERROR_CORRECTING);

    const step = this.template.steps[this._currentStepIndex];
    const errorMsg = '没关系，这个步骤我们再试一次。' + step.voiceText;
    this._addMessage('error', '检测到错误，正在纠正');
    this._speak(errorMsg);

    // 通知辅导员
    this.onAlert('error', {
      stepIndex: this._currentStepIndex,
      stepTitle: step.title,
      message: '员工在步骤「' + step.title + '」出现错误，已自动纠正'
    });

    // 3秒后重新播报当前步骤
    setTimeout(() => {
      this._elapsedTime = 0;
      this._timelineTriggered = {};
      this._startStep(this._currentStepIndex);
    }, 3000);
  }

  /**
   * 员工求助
   */
  requestHelp() {
    if (this._state === STATES.COMPLETED || this._state === STATES.IDLE) {
      return;
    }

    this._log('员工请求帮助');
    this._setState(STATES.HELPING);

    const step = this.template.steps[this._currentStepIndex];
    this._addMessage('help', '员工请求帮助，当前步骤: ' + step.title);
    this._speak('好的，老师马上过来帮你。');

    // 通知辅导员
    this.onAlert('help_request', {
      stepIndex: this._currentStepIndex,
      stepTitle: step.title,
      message: '员工在步骤「' + step.title + '」请求帮助'
    });
  }

  /**
   * 辅导员远程推进步骤
   */
  advanceStep() {
    if (this._state === STATES.COMPLETED) return;

    this._log('辅导员远程推进步骤');
    this._addMessage('system', '辅导员推进到下一步');

    // 停止当前计时
    this._stopTicker();

    // 标记当前步骤为已完成
    if (!this._completedSteps.includes(this._currentStepIndex)) {
      this._completedSteps.push(this._currentStepIndex);
    }

    this._advanceToNextStep();

    // 重启计时器
    this._startTicker();
  }

  /**
   * 辅导员回退步骤
   */
  goBackStep() {
    if (this._currentStepIndex <= 0 || this._state === STATES.IDLE) return;

    this._log('辅导员回退步骤');
    this._addMessage('system', '辅导员回退到上一步');

    // 停止当前计时
    this._stopTicker();

    // 从已完成列表中移除当前步骤
    this._completedSteps = this._completedSteps.filter(i => i !== this._currentStepIndex);

    // 回退
    this._currentStepIndex--;
    this._completedSteps = this._completedSteps.filter(i => i !== this._currentStepIndex);

    this._elapsedTime = 0;
    this._timelineTriggered = {};

    // 重新开始该步骤
    this._startStep(this._currentStepIndex);

    // 重启计时器
    this._startTicker();
  }

  /**
   * 获取当前状态
   * @returns {Object} 当前引擎状态
   */
  getState() {
    return {
      state: this._state,
      currentStepIndex: this._currentStepIndex,
      currentStep: this.template.steps[this._currentStepIndex] || null,
      completedSteps: [...this._completedSteps],
      totalSteps: this.template.steps.length,
      elapsedTime: this._elapsedTime,
      messages: [...this._messages],
      isRunning: this._isRunning,
      currentEmotion: this.currentEmotion
    };
  }

  /**
   * 获取鼓励语
   * @returns {string} 随机一条鼓励语
   */
  getEncouragement() {
    const index = Math.floor(Math.random() * ENCOURAGEMENTS.length);
    return ENCOURAGEMENTS[index];
  }

  /**
   * 设置当前情感状态
   * @param {string} emotion - 情感类型，如 'frustrated', 'confused', 'happy' 等
   */
  setEmotion(emotion) {
    this.currentEmotion = emotion;
    this._log('情感状态更新: ' + emotion);
  }

  /**
   * 处理视觉检测结果
   * @param {Object} result - 视觉检测结果
   * @param {Object} result.hands - 手势检测结果
   * @param {string} result.hands.gesture - 手势类型，如 'thumbs_up', 'open_palm'
   * @param {Object} result.face - 面部表情检测结果
   * @param {string} result.face.emotion - 表情类型，如 'frustrated', 'confused', 'happy'
   */
  handleVisionResult(result) {
    if (!result) return;

    // 处理手势
    if (result.hands && result.hands.gesture) {
      if (result.hands.gesture === 'thumbs_up' && this._state === STATES.WAITING) {
        this._log('视觉检测到竖大拇指手势，自动完成步骤');
        this.simulateStepComplete();
        return;
      }

      if (result.hands.gesture === 'open_palm' && this._state === STATES.WAITING) {
        this._log('视觉检测到张开手掌手势，自动请求帮助');
        this.requestHelp();
        return;
      }
    }

    // 处理表情
    if (result.face && result.face.emotion) {
      if (result.face.emotion === 'frustrated') {
        this._log('视觉检测到沮丧表情');
        this.onAlert('emotion_alert', {
          emotion: 'frustrated',
          stepIndex: this._currentStepIndex,
          stepTitle: this.template.steps[this._currentStepIndex]
            ? this.template.steps[this._currentStepIndex].title
            : '',
          message: '检测到员工出现沮丧情绪'
        });
      }
    }
  }

  /**
   * 处理语音命令（ASR 识别结果）
   * @param {string} text - ASR 识别出的文本
   */
  handleVoiceCommand(text) {
    if (!text) return;

    this._log('收到语音命令: ' + text);

    // 完成相关指令
    if (text.includes('好了') || text.includes('完成') || text.includes('做完了')) {
      this._log('语音命令触发步骤完成');
      this.simulateStepComplete();
      return;
    }

    // 求助相关指令
    if (text.includes('帮帮我') || text.includes('帮助') || text.includes('不会')) {
      this._log('语音命令触发请求帮助');
      this.requestHelp();
      return;
    }
  }

  /**
   * 销毁引擎，清理所有定时器和状态
   */
  destroy() {
    this._stopTicker();
    this._isRunning = false;
    this._state = STATES.IDLE;
    this.currentEmotion = null;
    this._log('引擎已销毁');
  }

  // ==================== 内部方法 ====================

  /**
   * 开始一个新步骤
   * @param {number} stepIndex - 步骤索引
   */
  _startStep(stepIndex) {
    this._currentStepIndex = stepIndex;
    this._elapsedTime = 0;
    this._timelineTriggered = {};

    const step = this.template.steps[stepIndex];
    this._log('开始步骤 ' + (stepIndex + 1) + '/' + this.template.steps.length + ': ' + step.title);
    this._addMessage('step', '步骤 ' + (stepIndex + 1) + ': ' + step.title);

    // 进入播报状态
    this._setState(STATES.ANNOUNCING);

    // 播报语音指令
    this._speak(step.voiceText);

    // 播报结束后进入等待状态
    if (this.onSpeakWithCallback) {
      // 使用精确的语音完成回调
      this.onSpeakWithCallback(step.voiceText, () => {
        if (this._state === STATES.ANNOUNCING) {
          this._setState(STATES.WAITING);
          this._log('等待员工执行步骤: ' + step.title);
        }
      });
    } else {
      // 回退到 setTimeout 估算方式
      const estimatedDuration = Math.max(2000, (step.voiceText || '').length * 300);
      setTimeout(() => {
        if (this._state === STATES.ANNOUNCING) {
          this._setState(STATES.WAITING);
          this._log('等待员工执行步骤: ' + step.title);
        }
      }, estimatedDuration);
    }
  }

  /**
   * 推进到下一步骤
   */
  _advanceToNextStep() {
    const nextIndex = this._currentStepIndex + 1;

    if (nextIndex >= this.template.steps.length) {
      // 所有步骤完成
      this._completeTask();
    } else {
      // 开始下一步
      this._startStep(nextIndex);
    }
  }

  /**
   * 完成任务
   */
  _completeTask() {
    this._stopTicker();
    this._isRunning = false;
    this._setState(STATES.COMPLETED);

    this._log('任务完成！');
    this._addMessage('success', '任务「' + this.template.name + '」全部完成！');

    // 播放庆祝语音
    const celebration = CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)];
    this._speak(celebration);

    // 通知辅导员
    this.onAlert('task_completed', {
      templateId: this.template.id,
      templateName: this.template.name,
      message: '员工已完成任务「' + this.template.name + '」'
    });
  }

  /**
   * 启动计时器（每秒触发一次）
   */
  _startTicker() {
    this._stopTicker();
    this._tickInterval = setInterval(() => {
      this._tick();
    }, this._tickRate);
  }

  /**
   * 停止计时器
   */
  _stopTicker() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
  }

  /**
   * 每秒触发的时间线检查
   */
  _tick() {
    // 仅在 WAITING 状态下执行时间线逻辑
    if (this._state !== STATES.WAITING) {
      return;
    }

    this._elapsedTime++;

    const step = this.template.steps[this._currentStepIndex];

    // 情感自适应：confused 状态下提前提醒（3秒而非默认值）
    const effectiveRemindTime = (this.currentEmotion === 'confused')
      ? 3
      : this._timeline.REMIND;

    // 情感自适应：frustrated 状态下跳过提醒步骤，直接进入示范
    const shouldSkipRemind = (this.currentEmotion === 'frustrated');

    // 温和提醒（frustrated 时跳过）
    if (!shouldSkipRemind &&
        this._elapsedTime >= effectiveRemindTime &&
        !this._timelineTriggered.remind) {
      this._timelineTriggered.remind = true;
      this._setState(STATES.REMINDING);
      const reminder = REMINDERS[Math.floor(Math.random() * REMINDERS.length)];
      this._addMessage('remind', reminder);
      this._speak(reminder);
      this._log('温和提醒（' + this._elapsedTime + 's）');

      // 提醒后回到等待状态
      setTimeout(() => {
        if (this._state === STATES.REMINDING) {
          this._setState(STATES.WAITING);
        }
      }, 3000);
    }

    // 10秒：详细分解指令（frustrated 时跳过）
    if (!shouldSkipRemind &&
        this._elapsedTime >= this._timeline.DETAIL &&
        !this._timelineTriggered.detail) {
      this._timelineTriggered.detail = true;
      this._setState(STATES.REMINDING);
      const detailText = '让我再详细说一下：' + step.description;
      this._addMessage('detail', detailText);
      this._speak(detailText);
      this._log('详细分解指令（' + this._elapsedTime + 's）');

      setTimeout(() => {
        if (this._state === STATES.REMINDING) {
          this._setState(STATES.WAITING);
        }
      }, 5000);
    }

    // 15秒：播放示范（frustrated 时提前触发，跳过 remind 和 detail）
    const effectiveDemonstrateTime = (this.currentEmotion === 'frustrated')
      ? 3
      : this._timeline.DEMONSTRATE;

    if (this._elapsedTime >= effectiveDemonstrateTime && !this._timelineTriggered.demonstrate) {
      this._timelineTriggered.demonstrate = true;
      this._setState(STATES.DEMONSTRATING);
      const demoText = '我来给你示范一下怎么做，请仔细看。' + step.guideTips;
      this._addMessage('demonstrate', '播放示范动画');
      this._speak(demoText);
      this._log('播放示范动画（' + this._elapsedTime + 's）');

      // 通知UI显示示范动画
      this.onAlert('demonstrate', {
        stepIndex: this._currentStepIndex,
        stepTitle: step.title,
        imageUrl: step.imageUrl,
        guideTips: step.guideTips
      });

      setTimeout(() => {
        if (this._state === STATES.DEMONSTRATING) {
          this._setState(STATES.WAITING);
        }
      }, 8000);
    }

    // 30秒：询问是否需要帮助
    if (this._elapsedTime >= this._timeline.CHECK_HELP && !this._timelineTriggered.checkHelp) {
      this._timelineTriggered.checkHelp = true;
      this._setState(STATES.CHECKING);
      const helpCheck = HELP_CHECKS[Math.floor(Math.random() * HELP_CHECKS.length)];
      this._addMessage('check', helpCheck);
      this._speak(helpCheck);
      this._log('询问是否需要帮助（' + this._elapsedTime + 's）');

      setTimeout(() => {
        if (this._state === STATES.CHECKING) {
          this._setState(STATES.WAITING);
        }
      }, 4000);
    }

    // 45秒：自动通知辅导员
    if (this._elapsedTime >= this._timeline.AUTO_HELP && !this._timelineTriggered.autoHelp) {
      this._timelineTriggered.autoHelp = true;
      this._setState(STATES.HELPING);
      this._addMessage('alert', '已自动通知辅导员');
      this._speak('老师已经知道了，马上过来帮你。');
      this._log('自动通知辅导员（' + this._elapsedTime + 's）');

      // 通知辅导员
      this.onAlert('auto_help', {
        stepIndex: this._currentStepIndex,
        stepTitle: step.title,
        elapsedTime: this._elapsedTime,
        message: '员工在步骤「' + step.title + '」等待超过' + this._timeline.AUTO_HELP + '秒，需要辅导员协助'
      });
    }
  }

  /**
   * 设置状态并通知
   * @param {string} newState - 新状态
   */
  _setState(newState) {
    if (this._state !== newState) {
      const oldState = this._state;
      this._state = newState;
      this._log('状态变化: ' + oldState + ' → ' + newState);
      this.onStateChange(newState);
    }
  }

  /**
   * 触发语音播报
   * @param {string} text - 播报文本
   */
  _speak(text) {
    this.onSpeak(text);
  }

  /**
   * 记录日志
   * @param {string} message - 日志消息
   */
  _log(message) {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    this.onLog('[' + timestamp + '] ' + message);
  }

  /**
   * 添加交互消息
   * @param {string} type - 消息类型（system, step, remind, detail, demonstrate, check, alert, success, error, help）
   * @param {string} content - 消息内容
   */
  _addMessage(type, content) {
    this._messages.push({
      type,
      text: content,
      timestamp: Date.now(),
      stepIndex: this._currentStepIndex
    });
  }
}

export default GuideEngine;
