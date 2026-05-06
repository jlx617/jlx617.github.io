/**
 * vision.js - MediaPipe 视觉检测模块
 *
 * 心工坊V2（Heart Workshop V2）AI辅助工作系统
 * 用于通过摄像头检测员工的肢体动作、手势和面部表情，
 * 判断员工是否正确完成了任务步骤。
 *
 * 功能模块：
 *   1. 手势检测（Hands）- 检测简单手势：竖大拇指、举手、挥手、指向
 *   2. 身体姿态检测（Pose）- 检测基本姿态：站立、伸手、弯腰、坐姿
 *   3. 面部表情检测（Face Mesh）- 检测基本情绪：微笑、困惑、平静、沮丧
 *
 * 依赖：MediaPipe CDN 脚本（动态加载）
 */

// ============================================================
// CDN 地址配置
// ============================================================

const CDN_URLS = {
  /** 手势检测 */
  hands: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
  /** 身体姿态检测 */
  pose: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js',
  /** 面部网格检测 */
  faceMesh: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js',
  /** 摄像头工具 */
  cameraUtils: 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
};

// ============================================================
// 全局标记：MediaPipe 是否加载成功
// ============================================================

let _mediaPipeLoaded = false;
let _loadAttempted = false;

// ============================================================
// 工具函数：动态加载脚本
// ============================================================

/**
 * 动态加载外部 JS 脚本
 * @param {string} src - 脚本 URL
 * @returns {Promise<void>}
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    // 如果脚本已经加载过，直接返回
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.onload = resolve;
    script.onerror = () => reject(new Error(`加载脚本失败: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * 加载所有 MediaPipe CDN 脚本
 * @returns {Promise<boolean>} 是否加载成功
 */
async function loadMediaPipeScripts() {
  if (_mediaPipeLoaded) return true;
  if (_loadAttempted) return false;

  _loadAttempted = true;
  try {
    await Promise.all([
      loadScript(CDN_URLS.hands),
      loadScript(CDN_URLS.pose),
      loadScript(CDN_URLS.faceMesh),
      loadScript(CDN_URLS.cameraUtils),
    ]);
    _mediaPipeLoaded = true;
    console.log('[Vision] MediaPipe CDN 脚本加载成功');
    return true;
  } catch (err) {
    console.warn('[Vision] MediaPipe CDN 脚本加载失败，将使用模拟数据:', err.message);
    return false;
  }
}

// ============================================================
// 摄像头工具函数
// ============================================================

/**
 * 初始化摄像头并绑定到 video 元素
 * @param {HTMLVideoElement} videoElement - 目标 video 元素
 * @param {Object} constraints - 摄像头约束（可选）
 * @returns {Promise<MediaStream>} 摄像头媒体流
 */
export async function initCamera(videoElement, constraints = {}) {
  const defaultConstraints = {
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user',
      ...constraints.video,
    },
    audio: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(defaultConstraints);
  videoElement.srcObject = stream;

  // 等待 video 元素就绪
  await new Promise((resolve) => {
    videoElement.onloadedmetadata = () => {
      videoElement.play();
      resolve();
    };
  });

  console.log('[Vision] 摄像头初始化成功');
  return stream;
}

/**
 * 停止摄像头并释放资源
 * @param {MediaStream} stream - 要停止的媒体流
 */
export function stopCamera(stream) {
  if (!stream) return;

  const tracks = stream.getTracks();
  tracks.forEach((track) => track.stop());
  console.log('[Vision] 摄像头已停止');
}

// ============================================================
// 手势识别逻辑
// ============================================================

/**
 * 手势类型枚举
 * 与中文含义对应：
 *   thumbs_up  - 竖大拇指（完成/好了）
 *   open_palm  - 张开手掌（举手/求助）
 *   wave       - 挥手
 *   pointing   - 指向
 *   unknown    - 未识别
 */
const GESTURES = {
  THUMBS_UP: 'thumbs_up',
  OPEN_PALM: 'open_palm',
  WAVE: 'wave',
  POINTING: 'pointing',
  UNKNOWN: 'unknown',
};

/**
 * 手势的中文标签映射
 */
const GESTURE_LABELS = {
  [GESTURES.THUMBS_UP]: '竖大拇指（完成）',
  [GESTURES.OPEN_PALM]: '举手（求助）',
  [GESTURES.WAVE]: '挥手',
  [GESTURES.POINTING]: '指向',
  [GESTURES.UNKNOWN]: '未识别手势',
};

/**
 * 计算两点之间的欧氏距离
 * @param {Object} landmark1 - 第一个关键点 {x, y, z}
 * @param {Object} landmark2 - 第二个关键点 {x, y, z}
 * @returns {number} 距离值
 */
function distance(landmark1, landmark2) {
  const dx = landmark1.x - landmark2.x;
  const dy = landmark1.y - landmark2.y;
  const dz = (landmark1.z || 0) - (landmark2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 判断手指是否伸直
 * 通过比较指尖与指根的距离来判断
 * @param {Array} landmarks - 手部21个关键点
 * @param {number[]} tipIndices - 指尖索引数组
 * @param {number[]} pipIndices - 指中关节索引数组
 * @returns {boolean} 手指是否伸直
 */
function isFingerExtended(landmarks, tipIndices, pipIndices) {
  // 指尖到手腕的距离 > 指中关节到手腕的距离，说明手指伸直
  const wrist = landmarks[0];
  for (let i = 0; i < tipIndices.length; i++) {
    const tipDist = distance(landmarks[tipIndices[i]], wrist);
    const pipDist = distance(landmarks[pipIndices[i]], wrist);
    if (tipDist < pipDist) {
      return false;
    }
  }
  return true;
}

/**
 * 从手部关键点识别手势
 *
 * MediaPipe Hands 关键点索引：
 *   0  - 手腕
 *   4  - 大拇指指尖
 *   8  - 食指指尖
 *   12 - 中指指尖
 *   16 - 无名指指尖
 *   20 - 小指指尖
 *   2  - 大拇指指根
 *   3  - 大拇指中间关节
 *   5  - 食指指根
 *   6  - 食指中间关节
 *   9  - 中指指根
 *   10 - 中指中间关节
 *   13 - 无名指指根
 *   14 - 无名指中间关节
 *   17 - 小指指根
 *   18 - 小指中间关节
 *
 * @param {Array} landmarks - 手部21个关键点
 * @returns {string} 手势类型
 */
function recognizeGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return GESTURES.UNKNOWN;

  const wrist = landmarks[0];

  // ---------- 竖大拇指检测 ----------
  // 大拇指指尖(4)在手腕(0)上方，且大拇指伸直，其余手指弯曲
  const thumbTip = landmarks[4];
  const thumbIP = landmarks[3];
  const thumbIsUp = thumbTip.y < wrist.y - 0.1; // 指尖明显高于手腕
  const thumbExtended = distance(thumbTip, wrist) > distance(thumbIP, wrist);

  // 检查食指到小指是否弯曲
  const otherFingersCurled =
    !isFingerExtended(landmarks, [8, 12, 16, 20], [6, 10, 14, 18]);

  if (thumbIsUp && thumbExtended && otherFingersCurled) {
    return GESTURES.THUMBS_UP;
  }

  // ---------- 张开手掌检测 ----------
  // 所有手指都伸直
  const allFingersExtended = isFingerExtended(
    landmarks,
    [4, 8, 12, 16, 20],
    [3, 6, 10, 14, 18]
  );

  if (allFingersExtended) {
    // 进一步判断是否是举手（手掌朝向摄像头，手指朝上）
    const palmCenter = landmarks[9]; // 中指根部作为手掌中心参考
    if (palmCenter.y < wrist.y - 0.05) {
      return GESTURES.OPEN_PALM;
    }
  }

  // ---------- 指向检测 ----------
  // 只有食指伸直，其余手指弯曲
  const indexExtended = isFingerExtended(landmarks, [8], [6]);
  const middleCurled = distance(landmarks[12], wrist) < distance(landmarks[10], wrist);
  const ringCurled = distance(landmarks[16], wrist) < distance(landmarks[14], wrist);
  const pinkyCurled = distance(landmarks[20], wrist) < distance(landmarks[18], wrist);

  if (indexExtended && middleCurled && ringCurled && pinkyCurled) {
    return GESTURES.POINTING;
  }

  // ---------- 挥手检测 ----------
  // 张开手掌 + 手在水平方向移动（需要多帧数据，这里用简化逻辑）
  // 简化判断：手掌张开且手腕位置较高（在画面上半部分）
  if (allFingersExtended && wrist.y < 0.5) {
    return GESTURES.WAVE;
  }

  return GESTURES.UNKNOWN;
}

// ============================================================
// 姿态识别逻辑
// ============================================================

/**
 * 姿态类型枚举
 * 与中文含义对应：
 *   standing    - 站立静止
 *   reaching    - 伸手（取物）
 *   bending     - 弯腰
 *   sitting     - 坐姿
 *   unknown     - 未识别
 */
const POSE_ACTIONS = {
  STANDING: 'standing',
  REACHING: 'reaching',
  BENDING: 'bending',
  SITTING: 'sitting',
  UNKNOWN: 'unknown',
};

/**
 * 姿态的中文标签映射
 */
const POSE_LABELS = {
  [POSE_ACTIONS.STANDING]: '站立静止',
  [POSE_ACTIONS.REACHING]: '伸手取物',
  [POSE_ACTIONS.BENDING]: '弯腰',
  [POSE_ACTIONS.SITTING]: '坐姿',
  [POSE_ACTIONS.UNKNOWN]: '未识别姿态',
};

/**
 * 从姿态关键点识别动作
 *
 * MediaPipe Pose 关键点索引（常用）：
 *   0  - 鼻子
 *   11 - 左肩
 *   12 - 右肩
 *   13 - 左肘
 *   14 - 右肘
 *   15 - 左手腕
 *   16 - 右手腕
 *   23 - 左髋
 *   24 - 右髋
 *   25 - 左膝
 *   26 - 右膝
 *   27 - 左脚踝
 *   28 - 右脚踝
 *
 * @param {Array} landmarks - 姿态33个关键点
 * @returns {string} 姿态类型
 */
function recognizePose(landmarks) {
  if (!landmarks || landmarks.length < 33) return POSE_ACTIONS.UNKNOWN;

  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];

  // 计算肩部中心点
  const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
  const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;

  // 计算髋部中心点
  const hipCenterY = (leftHip.y + rightHip.y) / 2;

  // ---------- 弯腰检测 ----------
  // 肩膀与髋部的垂直距离明显缩小（身体前倾）
  const torsoLength = hipCenterY - shoulderCenterY;
  // 正常站立时 torsoLength 约为 0.2~0.35，弯腰时 < 0.15
  if (torsoLength < 0.15 && nose.y > shoulderCenterY) {
    return POSE_ACTIONS.BENDING;
  }

  // ---------- 坐姿检测 ----------
  // 膝盖位置与髋部接近（弯曲），且髋部位置较低
  const kneeCenterY = (leftKnee.y + rightKnee.y) / 2;
  const hipToKneeLength = kneeCenterY - hipCenterY;
  // 坐姿时膝盖和髋部几乎在同一水平线
  if (hipToKneeLength < 0.1 && hipCenterY > 0.5) {
    return POSE_ACTIONS.SITTING;
  }

  // ---------- 伸手检测 ----------
  // 至少一只手腕明显高于肩膀（向上伸手）
  const leftWristUp = leftWrist.y < shoulderCenterY - 0.1;
  const rightWristUp = rightWrist.y < shoulderCenterY - 0.1;
  // 或者手腕远离身体中心（向侧面伸手）
  const leftWristSide = Math.abs(leftWrist.x - shoulderCenterX) > 0.25;
  const rightWristSide = Math.abs(rightWrist.x - shoulderCenterX) > 0.25;

  if (leftWristUp || rightWristUp || leftWristSide || rightWristSide) {
    return POSE_ACTIONS.REACHING;
  }

  // ---------- 站立静止 ----------
  // 默认姿态：身体直立，手臂自然下垂
  return POSE_ACTIONS.STANDING;
}

// ============================================================
// 面部表情识别逻辑
// ============================================================

/**
 * 表情类型枚举
 * 与中文含义对应：
 *   happy      - 微笑/开心
 *   confused   - 困惑/皱眉
 *   calm       - 平静
 *   frustrated - 沮丧
 *   unknown    - 未识别
 */
const EMOTIONS = {
  HAPPY: 'happy',
  CONFUSED: 'confused',
  CALM: 'calm',
  FRUSTRATED: 'frustrated',
  UNKNOWN: 'unknown',
};

/**
 * 表情的中文标签映射
 */
const EMOTION_LABELS = {
  [EMOTIONS.HAPPY]: '微笑',
  [EMOTIONS.CONFUSED]: '困惑',
  [EMOTIONS.CALM]: '平静',
  [EMOTIONS.FRUSTRATED]: '沮丧',
  [EMOTIONS.UNKNOWN]: '未识别表情',
};

/**
 * 从面部网格关键点识别表情
 *
 * MediaPipe Face Mesh 关键点索引（常用）：
 *   嘴巴相关：
 *     13  - 上嘴唇中间
 *     14  - 下嘴唇中间
 *     61  - 左嘴角
 *     291 - 右嘴角
 *     78  - 上嘴唇左侧
 *     308 - 上嘴唇右侧
 *
 *   眉毛相关：
 *     70  - 左眉内侧
 *     107 - 左眉外侧
 *     300 - 右眉内侧
 *     336 - 右眉外侧
 *
 *   眼睛相关：
 *     159 - 左眼上眼睑
 *     145 - 左眼下眼睑
 *     386 - 右眼上眼睑
 *     374 - 右眼下眼睑
 *
 * @param {Array} landmarks - 面部468个关键点
 * @returns {string} 表情类型
 */
function recognizeEmotion(landmarks) {
  if (!landmarks || landmarks.length < 468) return EMOTIONS.UNKNOWN;

  // ---------- 嘴巴分析 ----------
  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];
  const leftMouth = landmarks[61];
  const rightMouth = landmarks[291];

  // 嘴巴张开程度（上下嘴唇距离）
  const mouthOpenness = Math.abs(lowerLip.y - upperLip.y);
  // 嘴巴宽度
  const mouthWidth = distance(leftMouth, rightMouth);

  // ---------- 眉毛分析 ----------
  const leftBrowInner = landmarks[70];
  const leftBrowOuter = landmarks[107];
  const rightBrowInner = landmarks[300];
  const rightBrowOuter = landmarks[336];

  // 左眼位置（用于计算眉毛高度）
  const leftEyeUpper = landmarks[159];
  const rightEyeUpper = landmarks[386];

  // 眉毛到眼睛的距离（越小表示皱眉越严重）
  const leftBrowToEye = leftEyeUpper.y - leftBrowInner.y;
  const rightBrowToEye = rightEyeUpper.y - rightBrowInner.y;
  const avgBrowToEye = (leftBrowToEye + rightBrowToEye) / 2;

  // ---------- 眼睛分析 ----------
  const leftEyeLower = landmarks[145];
  const rightEyeLower = landmarks[374];

  // 眼睛张开程度
  const leftEyeOpenness = Math.abs(leftEyeUpper.y - leftEyeLower.y);
  const rightEyeOpenness = Math.abs(rightEyeUpper.y - rightEyeLower.y);
  const avgEyeOpenness = (leftEyeOpenness + rightEyeOpenness) / 2;

  // ---------- 微笑检测 ----------
  // 微笑特征：嘴角上扬（嘴角 y 坐标低于嘴唇中间），嘴巴宽度较大
  const mouthCornerAvgY = (leftMouth.y + rightMouth.y) / 2;
  const mouthCenterY = (upperLip.y + lowerLip.y) / 2;
  // 嘴角相对嘴巴中心上扬
  const smileScore = mouthCenterY - mouthCornerAvgY;

  if (smileScore > 0.005 && mouthWidth > 0.04) {
    return EMOTIONS.HAPPY;
  }

  // ---------- 困惑/皱眉检测 ----------
  // 皱眉特征：眉毛下压（眉毛到眼睛距离变小）
  if (avgBrowToEye < 0.02) {
    return EMOTIONS.CONFUSED;
  }

  // ---------- 沮丧检测 ----------
  // 沮丧特征：嘴角下垂 + 眉毛内侧下压 + 眼睛半闭
  const frownScore = mouthCornerAvgY - mouthCenterY; // 嘴角下垂
  if (frownScore > 0.003 && avgBrowToEye < 0.025 && avgEyeOpenness < 0.01) {
    return EMOTIONS.FRUSTRATED;
  }

  // ---------- 平静 ----------
  // 默认状态
  return EMOTIONS.CALM;
}

// ============================================================
// 模拟数据生成器（MediaPipe 加载失败时的降级方案）
// ============================================================

/**
 * 生成模拟的检测结果
 * 用于 MediaPipe CDN 加载失败时的降级方案，
 * 确保系统仍然可以正常运行和测试。
 *
 * @returns {Object} 模拟检测结果
 */
function generateMockResult() {
  const gestures = [GESTURES.THUMBS_UP, GESTURES.OPEN_PALM, GESTURES.WAVE, GESTURES.POINTING, GESTURES.UNKNOWN];
  const poses = [POSE_ACTIONS.STANDING, POSE_ACTIONS.REACHING, POSE_ACTIONS.BENDING, POSE_ACTIONS.SITTING, POSE_ACTIONS.UNKNOWN];
  const emotions = [EMOTIONS.HAPPY, EMOTIONS.CONFUSED, EMOTIONS.CALM, EMOTIONS.FRUSTRATED, EMOTIONS.UNKNOWN];

  // 随机选择一个结果（偏向正常状态）
  const gesture = Math.random() > 0.7
    ? gestures[Math.floor(Math.random() * (gestures.length - 1))]
    : GESTURES.UNKNOWN;
  const pose = poses[Math.floor(Math.random() * (poses.length - 1))];
  const emotion = Math.random() > 0.6
    ? EMOTIONS.CALM
    : emotions[Math.floor(Math.random() * emotions.length)];

  return {
    hands: {
      detected: Math.random() > 0.5,
      gesture,
      label: GESTURE_LABELS[gesture],
    },
    pose: {
      detected: true,
      action: pose,
      label: POSE_LABELS[pose],
    },
    face: {
      detected: Math.random() > 0.3,
      emotion,
      label: EMOTION_LABELS[emotion],
    },
  };
}

// ============================================================
// VisionDetector 主类
// ============================================================

/**
 * 视觉检测器类
 *
 * 封装了 MediaPipe Hands、Pose 和 Face Mesh 三个检测模块，
 * 提供统一的初始化、检测和销毁接口。
 *
 * 使用示例：
 * ```js
 * import { VisionDetector, initCamera, stopCamera } from './vision';
 *
 * const detector = new VisionDetector();
 * const video = document.getElementById('camera');
 * const stream = await initCamera(video);
 *
 * await detector.init(video);
 * detector.startDetection((result) => {
 *   console.log('手势:', result.hands.label);
 *   console.log('姿态:', result.pose.label);
 *   console.log('表情:', result.face.label);
 * });
 *
 * // 停止检测
 * detector.stopDetection();
 * detector.destroy();
 * stopCamera(stream);
 * ```
 */
export class VisionDetector {
  constructor() {
    /** @type {HTMLVideoElement|null} 视频元素 */
    this._video = null;

    /** @type {Object|null} MediaPipe Hands 实例 */
    this._handsDetector = null;

    /** @type {Object|null} MediaPipe Pose 实例 */
    this._poseDetector = null;

    /** @type {Object|null} MediaPipe Face Mesh 实例 */
    this._faceDetector = null;

    /** @type {number|null} requestAnimationFrame 的 ID */
    this._animationFrameId = null;

    /** @type {boolean} 是否正在检测 */
    this._isDetecting = false;

    /** @type {Function|null} 结果回调函数 */
    this._onResult = null;

    /** @type {boolean} 是否使用模拟模式 */
    this._mockMode = false;

    /** @type {number} 模拟模式的检测间隔（毫秒） */
    this._mockInterval = null;

    /** @type {Object} 初始化选项 */
    this._options = {};

    // 用于平滑检测结果的缓冲区
    /** @type {string[]} 最近几帧的手势结果 */
    this._gestureBuffer = [];

    /** @type {string[]} 最近几帧的姿态结果 */
    this._poseBuffer = [];

    /** @type {string[]} 最近几帧的表情结果 */
    this._emotionBuffer = [];

    /** @type {number} 缓冲区大小（用于结果平滑） */
    this._bufferSize = 5;
  }

  /**
   * 初始化检测器
   *
   * 加载 MediaPipe CDN 脚本，创建 Hands、Pose 和 Face Mesh 检测器实例。
   * 如果 CDN 加载失败，自动切换到模拟模式。
   *
   * @param {HTMLVideoElement} videoElement - 摄像头视频元素
   * @param {Object} [options={}] - 配置选项
   * @param {number} [options.maxNumHands=2] - 最大检测手数
   * @param {number} [options.minDetectionConfidence=0.5] - 手势检测最小置信度
   * @param {number} [options.minTrackingConfidence=0.5] - 手势追踪最小置信度
   * @param {boolean} [options.selfieMode=true] - 是否使用自拍模式（镜像）
   * @param {number} [options.smoothLandmarks=true] - 是否平滑关键点
   * @param {number} [options.detectionInterval=100] - 模拟模式下的检测间隔（毫秒）
   * @returns {Promise<void>}
   */
  async init(videoElement, options = {}) {
    this._video = videoElement;
    this._options = {
      maxNumHands: 2,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      selfieMode: true,
      smoothLandmarks: true,
      detectionInterval: 100,
      ...options,
    };

    // 尝试加载 MediaPipe
    const loaded = await loadMediaPipeScripts();

    if (!loaded) {
      // CDN 加载失败，使用模拟模式
      this._mockMode = true;
      console.warn('[Vision] 已切换到模拟模式，将返回随机模拟数据');
      return;
    }

    try {
      // ---------- 初始化 Hands 检测器 ----------
      this._handsDetector = new window.Hands({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      this._handsDetector.setOptions({
        maxNumHands: this._options.maxNumHands,
        modelComplexity: 1,
        minDetectionConfidence: this._options.minDetectionConfidence,
        minTrackingConfidence: this._options.minTrackingConfidence,
      });

      // ---------- 初始化 Pose 检测器 ----------
      this._poseDetector = new window.Pose({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      this._poseDetector.setOptions({
        modelComplexity: 1,
        smoothLandmarks: this._options.smoothLandmarks,
        enableSegmentation: false,
        minDetectionConfidence: this._options.minDetectionConfidence,
        minTrackingConfidence: this._options.minTrackingConfidence,
      });

      // ---------- 初始化 Face Mesh 检测器 ----------
      this._faceDetector = new window.FaceMesh({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      this._faceDetector.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: this._options.minDetectionConfidence,
        minTrackingConfidence: this._options.minTrackingConfidence,
      });

      // 初始化所有检测器模型
      await Promise.all([
        this._handsDetector.initialize(),
        this._poseDetector.initialize(),
        this._faceDetector.initialize(),
      ]);

      console.log('[Vision] 所有检测器初始化成功');
    } catch (err) {
      console.warn('[Vision] 检测器初始化失败，切换到模拟模式:', err.message);
      this._mockMode = true;
    }
  }

  /**
   * 开始持续检测
   *
   * 启动检测循环，每帧通过 requestAnimationFrame 调用检测逻辑，
   * 并将结果通过 onResult 回调返回。
   *
   * @param {Function} onResult - 结果回调函数
   *   回调参数格式：
   *   {
   *     hands: { detected: boolean, gesture: string, label: string },
   *     pose:  { detected: boolean, action: string, label: string },
   *     face:  { detected: boolean, emotion: string, label: string }
   *   }
   */
  startDetection(onResult) {
    if (!onResult || typeof onResult !== 'function') {
      throw new Error('[Vision] startDetection 需要传入有效的回调函数');
    }

    this._onResult = onResult;
    this._isDetecting = true;

    if (this._mockMode) {
      // 模拟模式：使用定时器生成模拟数据
      console.log('[Vision] 模拟模式：开始生成模拟检测数据');
      this._mockInterval = setInterval(() => {
        if (!this._isDetecting) return;
        const result = generateMockResult();
        this._onResult(result);
      }, this._options.detectionInterval || 100);
    } else {
      // 真实模式：使用 requestAnimationFrame 进行逐帧检测
      console.log('[Vision] 开始实时检测');
      this._detectLoop();
    }
  }

  /**
   * 检测循环（真实模式）
   * 使用 requestAnimationFrame 逐帧执行检测
   * @private
   */
  _detectLoop() {
    if (!this._isDetecting) return;

    this._animationFrameId = requestAnimationFrame(async () => {
      if (!this._isDetecting || !this._video) return;

      try {
        // 并行执行三个检测任务
        const [handsResults, poseResults, faceResults] = await Promise.all([
          this._detectHands(),
          this._detectPose(),
          this._detectFace(),
        ]);

        // 组装检测结果
        const result = {
          hands: this._processHandsResult(handsResults),
          pose: this._processPoseResult(poseResults),
          face: this._processFaceResult(faceResults),
        };

        // 通过回调返回结果
        if (this._onResult) {
          this._onResult(result);
        }
      } catch (err) {
        // 单帧检测失败不应中断整个循环
        console.warn('[Vision] 单帧检测出错:', err.message);
      }

      // 继续下一帧
      this._detectLoop();
    });
  }

  /**
   * 执行手部检测
   * @private
   * @returns {Promise<Object|null} MediaPipe Hands 检测结果
   */
  async _detectHands() {
    if (!this._handsDetector || !this._video) return null;
    return new Promise((resolve) => {
      this._handsDetector.send(
        { image: this._video },
        (results) => resolve(results)
      );
    });
  }

  /**
   * 执行姿态检测
   * @private
   * @returns {Promise<Object|null} MediaPipe Pose 检测结果
   */
  async _detectPose() {
    if (!this._poseDetector || !this._video) return null;
    return new Promise((resolve) => {
      this._poseDetector.send(
        { image: this._video },
        (results) => resolve(results)
      );
    });
  }

  /**
   * 执行面部检测
   * @private
   * @returns {Promise<Object|null} MediaPipe Face Mesh 检测结果
   */
  async _detectFace() {
    if (!this._faceDetector || !this._video) return null;
    return new Promise((resolve) => {
      this._faceDetector.send(
        { image: this._video },
        (results) => resolve(results)
      );
    });
  }

  /**
   * 处理手部检测结果
   * @private
   * @param {Object|null} results - MediaPipe Hands 原始结果
   * @returns {Object} 处理后的手部结果
   */
  _processHandsResult(results) {
    if (!results || !results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this._gestureBuffer = [];
      return {
        detected: false,
        gesture: GESTURES.UNKNOWN,
        label: GESTURE_LABELS[GESTURES.UNKNOWN],
      };
    }

    // 取第一只检测到的手进行手势识别
    const landmarks = results.multiHandLandmarks[0];
    const gesture = recognizeGesture(landmarks);

    // 使用缓冲区进行结果平滑，避免频繁跳变
    this._gestureBuffer.push(gesture);
    if (this._gestureBuffer.length > this._bufferSize) {
      this._gestureBuffer.shift();
    }
    const stableGesture = this._getMostFrequent(this._gestureBuffer);

    return {
      detected: true,
      gesture: stableGesture,
      label: GESTURE_LABELS[stableGesture],
    };
  }

  /**
   * 处理姿态检测结果
   * @private
   * @param {Object|null} results - MediaPipe Pose 原始结果
   * @returns {Object} 处理后的姿态结果
   */
  _processPoseResult(results) {
    if (!results || !results.poseLandmarks || results.poseLandmarks.length === 0) {
      this._poseBuffer = [];
      return {
        detected: false,
        action: POSE_ACTIONS.UNKNOWN,
        label: POSE_LABELS[POSE_ACTIONS.UNKNOWN],
      };
    }

    const landmarks = results.poseLandmarks;
    const action = recognizePose(landmarks);

    // 使用缓冲区进行结果平滑
    this._poseBuffer.push(action);
    if (this._poseBuffer.length > this._bufferSize) {
      this._poseBuffer.shift();
    }
    const stableAction = this._getMostFrequent(this._poseBuffer);

    return {
      detected: true,
      action: stableAction,
      label: POSE_LABELS[stableAction],
    };
  }

  /**
   * 处理面部检测结果
   * @private
   * @param {Object|null} results - MediaPipe Face Mesh 原始结果
   * @returns {Object} 处理后的面部结果
   */
  _processFaceResult(results) {
    if (!results || !results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      this._emotionBuffer = [];
      return {
        detected: false,
        emotion: EMOTIONS.UNKNOWN,
        label: EMOTION_LABELS[EMOTIONS.UNKNOWN],
      };
    }

    const landmarks = results.multiFaceLandmarks[0];
    const emotion = recognizeEmotion(landmarks);

    // 使用缓冲区进行结果平滑
    this._emotionBuffer.push(emotion);
    if (this._emotionBuffer.length > this._bufferSize) {
      this._emotionBuffer.shift();
    }
    const stableEmotion = this._getMostFrequent(this._emotionBuffer);

    return {
      detected: true,
      emotion: stableEmotion,
      label: EMOTION_LABELS[stableEmotion],
    };
  }

  /**
   * 从缓冲区中获取出现频率最高的值（众数）
   * 用于平滑检测结果，避免单帧噪声导致频繁跳变
   * @private
   * @param {string[]} buffer - 结果缓冲区
   * @returns {string} 出现频率最高的值
   */
  _getMostFrequent(buffer) {
    if (buffer.length === 0) return '';
    const frequency = {};
    let maxCount = 0;
    let mostFrequent = buffer[0];

    for (const item of buffer) {
      frequency[item] = (frequency[item] || 0) + 1;
      if (frequency[item] > maxCount) {
        maxCount = frequency[item];
        mostFrequent = item;
      }
    }

    return mostFrequent;
  }

  /**
   * 停止检测
   *
   * 停止检测循环，释放 requestAnimationFrame 或清除定时器。
   * 不会销毁检测器实例，可以再次调用 startDetection 恢复检测。
   */
  stopDetection() {
    this._isDetecting = false;

    // 停止 requestAnimationFrame 循环
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    // 停止模拟模式的定时器
    if (this._mockInterval !== null) {
      clearInterval(this._mockInterval);
      this._mockInterval = null;
    }

    // 清空缓冲区
    this._gestureBuffer = [];
    this._poseBuffer = [];
    this._emotionBuffer = [];

    console.log('[Vision] 检测已停止');
  }

  /**
   * 销毁检测器
   *
   * 完全释放所有资源，包括：
   * - 停止检测循环
   * - 关闭 MediaPipe 检测器实例
   * - 清空所有内部状态
   *
   * 销毁后需要重新调用 init() 才能再次使用。
   */
  destroy() {
    // 先停止检测
    this.stopDetection();

    // 关闭 MediaPipe 实例
    if (this._handsDetector) {
      try {
        this._handsDetector.close();
      } catch (e) {
        // 忽略关闭时的错误
      }
      this._handsDetector = null;
    }

    if (this._poseDetector) {
      try {
        this._poseDetector.close();
      } catch (e) {
        // 忽略关闭时的错误
      }
      this._poseDetector = null;
    }

    if (this._faceDetector) {
      try {
        this._faceDetector.close();
      } catch (e) {
        // 忽略关闭时的错误
      }
      this._faceDetector = null;
    }

    // 清空引用
    this._video = null;
    this._onResult = null;

    console.log('[Vision] 检测器已销毁');
  }

  /**
   * 获取当前是否处于模拟模式
   * @returns {boolean}
   */
  get isMockMode() {
    return this._mockMode;
  }

  /**
   * 获取当前是否正在检测
   * @returns {boolean}
   */
  get isDetecting() {
    return this._isDetecting;
  }
}

// ============================================================
// 导出常量枚举（供外部使用）
// ============================================================

/**
 * 手势类型常量
 */
export const Gestures = Object.freeze({
  ...GESTURES,
  LABELS: Object.freeze({ ...GESTURE_LABELS }),
});

/**
 * 姿态类型常量
 */
export const Poses = Object.freeze({
  ...POSE_ACTIONS,
  LABELS: Object.freeze({ ...POSE_LABELS }),
});

/**
 * 表情类型常量
 */
export const Emotions = Object.freeze({
  ...EMOTIONS,
  LABELS: Object.freeze({ ...EMOTION_LABELS }),
});
