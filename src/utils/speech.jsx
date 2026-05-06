/**
 * 语音工具模块 — 心工坊V2
 * 使用 Web Speech API 实现语音合成（TTS）和语音识别（ASR）
 * 针对心智障碍员工优化：语速默认较慢，语音清晰
 */

// 当前活跃的语音合成实例
let currentUtterance = null;

// 当前活跃的语音识别实例
let currentRecognition = null;

// voices 是否已加载完成
let voicesLoaded = false;

// voices 加载的 resolve 回调队列（支持多次调用 preloadVoices）
let voicesResolveQueue = [];

/**
 * 预加载语音列表
 * 部分浏览器（如 Chrome）异步加载 voices，首次调用 getVoices() 可能返回空数组。
 * 调用此函数可确保 voices 加载完成后再执行后续逻辑。
 * @returns {Promise<SpeechSynthesisVoice[]>} 加载完成后的语音列表
 */
export function preloadVoices() {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      voicesLoaded = true;
      resolve(voices);
      return;
    }

    voicesResolveQueue.push(resolve);

    // onvoiceschanged 只绑定一次
    if (!voicesLoaded && window.speechSynthesis.onvoiceschanged !== _onVoicesChanged) {
      window.speechSynthesis.onvoiceschanged = _onVoicesChanged;
    }

    // 兜底：最多等 3 秒，防止某些浏览器不触发 onvoiceschanged
    setTimeout(() => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0 && !voicesLoaded) {
        voicesLoaded = true;
        _flushResolveQueue(v);
      }
    }, 3000);
  });
}

/** @private */
function _onVoicesChanged() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    voicesLoaded = true;
    window.speechSynthesis.onvoiceschanged = null;
    _flushResolveQueue(voices);
  }
}

/** @private */
function _flushResolveQueue(voices) {
  const queue = voicesResolveQueue;
  voicesResolveQueue = [];
  queue.forEach((resolve) => resolve(voices));
}

/**
 * 检查浏览器是否支持语音识别（ASR）
 * @returns {boolean}
 */
export function isSpeechRecognitionSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * 检查浏览器是否支持语音合成（TTS）
 * @returns {boolean}
 */
export function isSpeechSynthesisSupported() {
  return 'speechSynthesis' in window;
}

/**
 * 语音合成（TTS）- 将文字转为语音播报
 * @param {string} text - 要播报的文本
 * @param {Object} options - 配置选项
 * @param {number} options.rate - 语速，默认0.85（慢速，适合心智障碍者）
 * @param {number} options.pitch - 音调，默认1
 * @param {number} options.volume - 音量，默认1
 * @param {string} options.lang - 语言，默认 'zh-CN'
 * @param {Function} options.onEnd - 播报结束回调
 * @param {Function} options.onError - 播报出错回调
 * @returns {{ stop: Function }} 控制对象，可调用 stop() 停止播报
 */
export function speak(text, options = {}) {
  // 检查浏览器是否支持语音合成
  if (!('speechSynthesis' in window)) {
    console.warn('当前浏览器不支持语音合成（Web Speech API）');
    if (options.onError) {
      options.onError(new Error('浏览器不支持语音合成'));
    }
    // 即使不支持也触发 onEnd，确保流程不卡住
    if (options.onEnd) {
      setTimeout(() => options.onEnd(), 300);
    }
    return { stop: () => {} };
  }

  // 先停止当前正在播放的语音
  stopSpeech();

  // 创建语音合成实例
  const utterance = new SpeechSynthesisUtterance(text);

  // 设置参数
  utterance.rate = options.rate !== undefined ? options.rate : 0.85;
  utterance.pitch = options.pitch !== undefined ? options.pitch : 1;
  utterance.volume = options.volume !== undefined ? options.volume : 1;
  utterance.lang = options.lang || 'zh-CN';

  // 尝试选择中文语音
  const voices = window.speechSynthesis.getVoices();
  const zhVoice = voices.find(v => v.lang.startsWith('zh'));
  if (zhVoice) {
    utterance.voice = zhVoice;
  }

  let utteranceStarted = false;
  let fallbackTimer = null;

  // 绑定事件
  utterance.onstart = () => {
    utteranceStarted = true;
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
  };

  utterance.onend = () => {
    currentUtterance = null;
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    if (options.onEnd) options.onEnd();
  };

  utterance.onerror = (event) => {
    currentUtterance = null;
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    console.error('语音合成出错:', event);
    if (options.onError) options.onError(event);
    // 出错时也触发 onEnd，确保流程不卡住
    if (options.onEnd) options.onEnd();
  };

  // 兜底：某些浏览器（如夸克）API存在但不发声也不触发事件
  // 如果 2 秒内没有 onstart，直接触发 onEnd 让流程继续
  fallbackTimer = setTimeout(() => {
    if (!utteranceStarted) {
      console.warn('[TTS] 语音播报未响应，自动跳过');
      try { window.speechSynthesis.cancel(); } catch(e) {}
      currentUtterance = null;
      if (options.onEnd) options.onEnd();
    }
  }, 2000);

  // 保存引用并开始播报
  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);

  // 返回控制对象
  return {
    stop: () => {
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
      if (currentUtterance) {
        window.speechSynthesis.cancel();
        currentUtterance = null;
      }
    }
  };
}

/**
 * 带回调的语音合成 — 在播报结束时自动触发 onDone 回调
 * 便于 GuideEngine 精确感知语音播报完成时机。
 * @param {string} text - 要播报的文本
 * @param {Function} onDone - 播报结束回调
 * @param {Object} options - 同 speak() 的配置选项（onEnd 会被覆盖）
 * @returns {{ stop: Function }} 控制对象，可调用 stop() 停止播报
 */
export function speakWithCallback(text, onDone, options = {}) {
  return speak(text, {
    ...options,
    onEnd: onDone,
  });
}

/**
 * 异步等待语音合成完成 — 返回 Promise，适合 async/await 模式
 * @param {string} text - 要播报的文本
 * @param {Object} options - 同 speak() 的配置选项（onEnd 会被覆盖）
 * @returns {Promise<void>} 播报完成后 resolve
 */
export function speakAndWait(text, options = {}) {
  return new Promise((resolve) => {
    speakWithCallback(text, resolve, options);
  });
}

/**
 * 停止当前正在播放的语音
 */
export function stopSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
}

/**
 * 检查是否正在朗读
 * @returns {boolean} 是否正在朗读
 */
export function isSpeaking() {
  if (!('speechSynthesis' in window)) return false;
  return window.speechSynthesis.speaking;
}

/**
 * 语音识别（ASR）- 将语音转为文字
 * @param {Object} options - 配置选项
 * @param {string} options.lang - 识别语言，默认 'zh-CN'
 * @param {Function} options.onResult - 识别结果回调，参数为识别到的文字
 * @param {Function} options.onError - 识别出错回调
 * @param {Function} options.onEnd - 识别结束回调
 * @param {boolean} options.continuous - 是否持续识别，默认 false
 * @param {boolean} options.interimResults - 是否返回中间结果，默认 true
 * @param {number} options.maxDuration - 最大识别时长（毫秒），默认 30000，超时自动停止
 * @param {string[]} [options.keywords] - 关键词列表，仅当识别结果包含关键词时才触发 onResult
 * @returns {{ stop: Function }} 控制对象，可调用 stop() 停止监听
 */
export function startListening(options = {}) {
  // 检查浏览器是否支持语音识别
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('当前浏览器不支持语音识别（Web Speech API）');
    if (options.onError) {
      options.onError(new Error('浏览器不支持语音识别'));
    }
    return { stop: () => {} };
  }

  // 先停止当前正在进行的识别
  stopListening();

  // 创建语音识别实例
  const recognition = new SpeechRecognition();
  recognition.lang = options.lang || 'zh-CN';
  recognition.continuous = options.continuous !== undefined ? options.continuous : false;
  recognition.interimResults = options.interimResults !== undefined ? options.interimResults : true;

  // 是否被显式停止（用于区分自动结束和手动停止）
  let explicitlyStopped = false;

  // 最大识别时长，超时自动停止
  const maxDuration = options.maxDuration !== undefined ? options.maxDuration : 30000;
  let maxDurationTimer = null;

  if (maxDuration > 0) {
    maxDurationTimer = setTimeout(() => {
      if (!explicitlyStopped) {
        explicitlyStopped = true;
        try { recognition.stop(); } catch (e) { /* ignore */ }
      }
    }, maxDuration);
  }

  // 关键词检测配置
  const keywords = options.keywords || null;

  // 绑定事件
  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    // 如果设置了关键词过滤，仅在匹配时触发回调
    if (keywords && keywords.length > 0) {
      const matched = keywords.some((kw) => transcript.includes(kw));
      if (!matched) return;
    }

    if (options.onResult) options.onResult(transcript);
  };

  recognition.onerror = (event) => {
    console.error('语音识别出错:', event.error);
    if (maxDurationTimer) clearTimeout(maxDurationTimer);
    if (options.onError) options.onError(event);
  };

  recognition.onend = () => {
    if (maxDurationTimer) clearTimeout(maxDurationTimer);

    // continuous 模式下自动重启（除非显式停止）
    if (recognition.continuous && !explicitlyStopped) {
      try {
        recognition.start();
        // 重启后重新设置 maxDuration 计时器
        if (maxDuration > 0) {
          maxDurationTimer = setTimeout(() => {
            if (!explicitlyStopped) {
              explicitlyStopped = true;
              try { recognition.stop(); } catch (e) { /* ignore */ }
            }
          }, maxDuration);
        }
        return; // 不触发 onEnd，因为识别仍在继续
      } catch (e) {
        // 重启失败（例如浏览器限制），走正常结束流程
        console.warn('语音识别自动重启失败:', e);
      }
    }

    currentRecognition = null;
    if (options.onEnd) options.onEnd();
  };

  // 保存引用并开始识别
  currentRecognition = recognition;
  recognition.start();

  // 返回控制对象
  return {
    stop: () => {
      explicitlyStopped = true;
      if (maxDurationTimer) clearTimeout(maxDurationTimer);
      if (currentRecognition) {
        currentRecognition.stop();
        currentRecognition = null;
      }
    }
  };
}

/**
 * 停止当前正在进行的语音识别
 */
export function stopListening() {
  if (currentRecognition) {
    currentRecognition.stop();
    currentRecognition = null;
  }
}
