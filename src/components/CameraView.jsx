/**
 * CameraView - 摄像头预览组件（画中画风格）
 * 心工坊V2 - 员工工作台摄像头叠加层
 *
 * 功能：
 * - 在工作台右下角显示小型摄像头预览窗口
 * - 支持显示/隐藏切换
 * - 显示检测状态指示器（手势检测、情绪检测等）
 * - 显示当前检测到的手势/情绪标签
 * - 响应式设计：桌面端较大，移动端较小
 * - 加载状态与错误状态处理
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VisionDetector } from '../utils/vision';
import './CameraView.css';

/* ========================================
   检测状态常量
   ======================================== */
const DETECTION_STATUS = {
  IDLE: 'idle',           // 空闲 - 未启动
  LOADING: 'loading',     // 加载中 - 摄像头初始化
  ACTIVE: 'active',       // 活跃 - 正在检测
  ERROR: 'error',         // 错误 - 摄像头访问失败
};

/* ========================================
   检测状态对应的显示配置
   ======================================== */
const STATUS_CONFIG = {
  [DETECTION_STATUS.IDLE]: {
    label: '未启动',
    color: '#999',
  },
  [DETECTION_STATUS.LOADING]: {
    label: '初始化中...',
    color: '#f0ad4e',
  },
  [DETECTION_STATUS.ACTIVE]: {
    label: '检测中',
    color: '#5cb85c',
  },
  [DETECTION_STATUS.ERROR]: {
    label: '摄像头异常',
    color: '#d9534f',
  },
};

/* ========================================
   CameraView 组件
   ======================================== */
export default function CameraView({
  onGestureDetected,
  onEmotionDetected,
  onPoseDetected,
  visible = true,
  onToggle,
}) {
  // ---------- 状态 ----------
  const [cameraStatus, setCameraStatus] = useState(DETECTION_STATUS.IDLE);
  const [errorMessage, setErrorMessage] = useState('');
  const [handDetected, setHandDetected] = useState(false);
  const [emotionDetected, setEmotionDetected] = useState(false);
  const [currentGesture, setCurrentGesture] = useState('');
  const [currentEmotion, setCurrentEmotion] = useState('');
  const [currentPose, setCurrentPose] = useState('');

  // ---------- 引用 ----------
  const videoRef = useRef(null);
  const detectorRef = useRef(null);
  const streamRef = useRef(null);
  const prevGestureRef = useRef('');
  const prevEmotionRef = useRef('');

  // ---------- 初始化摄像头 ----------
  const initCamera = useCallback(async () => {
    setCameraStatus(DETECTION_STATUS.LOADING);
    setErrorMessage('');

    try {
      // 请求摄像头权限
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;

      // 将视频流绑定到 video 元素
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // 等待视频元数据加载
        await new Promise((resolve, reject) => {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play()
              .then(resolve)
              .catch(reject);
          };
          videoRef.current.onerror = reject;
        });
      }

      // 初始化视觉检测器
      const detector = new VisionDetector();
      await detector.init(videoRef.current);
      detectorRef.current = detector;

      // 标记为活跃状态
      setCameraStatus(DETECTION_STATUS.ACTIVE);

      // 启动检测
      detector.startDetection((result) => {
        if (!result) return;

        // ---- 手势检测 ----
        if (result.hands && result.hands.detected) {
          setHandDetected(true);
          const gesture = result.hands.gesture;
          setCurrentGesture(result.hands.label || gesture);

          if (gesture && gesture !== 'unknown' && gesture !== prevGestureRef.current) {
            prevGestureRef.current = gesture;
            onGestureDetected?.(gesture);
          }
        } else {
          setHandDetected(false);
          setCurrentGesture('');
          prevGestureRef.current = '';
        }

        // ---- 情绪检测 ----
        if (result.face && result.face.detected) {
          setEmotionDetected(true);
          const emotion = result.face.emotion;
          setCurrentEmotion(result.face.label || emotion);

          if (emotion && emotion !== 'unknown' && emotion !== prevEmotionRef.current) {
            prevEmotionRef.current = emotion;
            onEmotionDetected?.(emotion);
          }
        } else {
          setEmotionDetected(false);
          setCurrentEmotion('');
          prevEmotionRef.current = '';
        }

        // ---- 姿态检测 ----
        if (result.pose && result.pose.detected) {
          setCurrentPose(result.pose.label || result.pose.action);
          onPoseDetected?.(result.pose.action);
        } else {
          setCurrentPose('');
        }
      });

    } catch (err) {
      console.error('[CameraView] 摄像头初始化失败:', err);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('摄像头权限被拒绝，请在浏览器设置中允许访问摄像头');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('未检测到摄像头设备');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setErrorMessage('摄像头被其他应用占用');
      } else {
        setErrorMessage(`摄像头初始化失败: ${err.message}`);
      }

      setCameraStatus(DETECTION_STATUS.ERROR);
    }
  }, [onGestureDetected, onEmotionDetected, onPoseDetected]);

  // ---------- 停止摄像头 ----------
  const stopCamera = useCallback(() => {
    // 停止检测器
    if (detectorRef.current) {
      detectorRef.current.destroy();
      detectorRef.current = null;
    }

    // 停止媒体流
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // 清空视频源
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // 重置状态
    setCameraStatus(DETECTION_STATUS.IDLE);
    setHandDetected(false);
    setEmotionDetected(false);
    setCurrentGesture('');
    setCurrentEmotion('');
    setCurrentPose('');
    prevGestureRef.current = '';
    prevEmotionRef.current = '';
  }, []);

  // ---------- 生命周期 ----------
  useEffect(() => {
    if (visible) {
      initCamera();
    }

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ---------- 获取状态配置 ----------
  const statusConfig = STATUS_CONFIG[cameraStatus] || STATUS_CONFIG[DETECTION_STATUS.IDLE];

  // ---------- 渲染：隐藏状态不渲染 ----------
  if (!visible) {
    return null;
  }

  // ---------- 渲染：错误状态 ----------
  if (cameraStatus === DETECTION_STATUS.ERROR) {
    return (
      <div className="camera-view camera-view--error">
        <div className="camera-view__error-content">
          <div className="camera-view__error-icon">!</div>
          <div className="camera-view__error-text">{errorMessage || '摄像头异常'}</div>
        </div>
        <button
          className="camera-view__toggle-btn"
          onClick={onToggle}
          title="隐藏摄像头"
        >
          x
        </button>
      </div>
    );
  }

  // ---------- 渲染：加载状态 ----------
  if (cameraStatus === DETECTION_STATUS.LOADING) {
    return (
      <div className="camera-view camera-view--loading">
        <div className="camera-view__loading-content">
          <div className="camera-view__loading-spinner" />
          <div className="camera-view__loading-text">正在启动摄像头...</div>
        </div>
        <button
          className="camera-view__toggle-btn"
          onClick={onToggle}
          title="隐藏摄像头"
        >
          x
        </button>
      </div>
    );
  }

  // ---------- 渲染：正常预览 ----------
  return (
    <div className="camera-view">
      <div className="camera-view__preview">
        <video
          ref={videoRef}
          className="camera-view__video"
          autoPlay
          playsInline
          muted
        />

        <div className="camera-view__status-indicator">
          <span
            className={`camera-view__status-dot ${
              cameraStatus === DETECTION_STATUS.ACTIVE
                ? 'camera-view__status-dot--active'
                : ''
            }`}
            style={{ backgroundColor: statusConfig.color }}
          />
          <span className="camera-view__status-label">{statusConfig.label}</span>
        </div>

        <div className="camera-view__detection-labels">
          {handDetected && currentGesture && (
            <span className="camera-view__label camera-view__label--gesture">
              {currentGesture}
            </span>
          )}
          {emotionDetected && currentEmotion && (
            <span className="camera-view__label camera-view__label--emotion">
              {currentEmotion}
            </span>
          )}
          {currentPose && (
            <span className="camera-view__label camera-view__label--pose">
              {currentPose}
            </span>
          )}
        </div>
      </div>

      <button
        className="camera-view__toggle-btn"
        onClick={onToggle}
        title="隐藏摄像头"
      >
        x
      </button>
    </div>
  );
}
