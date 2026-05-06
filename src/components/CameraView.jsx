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
  const [cameraStatus, setCameraStatus] = useState(DETECTION_STATUS.IDLE);  // 摄像头状态
  const [errorMessage, setErrorMessage] = useState('');                       // 错误信息
  const [handDetected, setHandDetected] = useState(false);                   // 是否检测到手部
  const [emotionDetected, setEmotionDetected] = useState(false);             // 是否检测到情绪
  const [currentGesture, setCurrentGesture] = useState('');                  // 当前手势
  const [currentEmotion, setCurrentEmotion] = useState('');                  // 当前情绪
  const [currentPose, setCurrentPose] = useState('');                        // 当前姿态

  // ---------- 引用 ----------
  const videoRef = useRef(null);                   // 视频元素引用
  const detectorRef = useRef(null);                // VisionDetector 实例引用
  const animationFrameRef = useRef(null);          // 动画帧引用
  const streamRef = useRef(null);                  // 媒体流引用
  const prevGestureRef = useRef('');               // 上一帧手势（用于去重）
  const prevEmotionRef = useRef('');               // 上一帧情绪（用于去重）

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
          facingMode: 'user',  // 使用前置摄像头
        },
        audio: false,
      });

      // 保存媒体流引用
      streamRef.current = stream;

      // 将视频流绑定到 video 元素
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // 初始化视觉检测器
      const detector = new VisionDetector();
      detectorRef.current = detector;

      // 标记为活跃状态
      setCameraStatus(DETECTION_STATUS.ACTIVE);

      // 启动检测循环
      startDetectionLoop();

    } catch (err) {
      console.error('[CameraView] 摄像头初始化失败:', err);

      // 根据错误类型设置不同的错误信息
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
  }, []);

  // ---------- 停止摄像头 ----------
  const stopCamera = useCallback(() => {
    // 停止检测循环
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
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

    // 销毁检测器
    if (detectorRef.current) {
      detectorRef.current = null;
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

  // ---------- 检测循环 ----------
  const startDetectionLoop = useCallback(() => {
    const detect = async () => {
      const detector = detectorRef.current;
      const video = videoRef.current;

      if (!detector || !video || video.readyState < 2) {
        // 视频未就绪，继续等待
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      try {
        // 执行视觉检测
        const results = await detector.detect(video);

        if (results) {
          // ---- 手势检测 ----
          if (results.gesture) {
            setHandDetected(true);
            const gesture = results.gesture;
            setCurrentGesture(gesture);

            // 手势变化时回调（去重：与上一帧不同才触发）
            if (gesture !== prevGestureRef.current) {
              prevGestureRef.current = gesture;

              // 将手势名称转换为下划线格式
              const gestureKey = gesture
                .toLowerCase()
                .replace(/\s+/g, '_');

              // 检测到"竖大拇指"手势时触发回调
              if (gestureKey === 'thumbs_up' || gestureKey === 'thumbsup') {
                onGestureDetected?.('thumbs_up');
              } else {
                onGestureDetected?.(gestureKey);
              }
            }
          } else {
            setHandDetected(false);
            setCurrentGesture('');
            prevGestureRef.current = '';
          }

          // ---- 情绪检测 ----
          if (results.emotion) {
            setEmotionDetected(true);
            const emotion = results.emotion;
            setCurrentEmotion(emotion);

            // 情绪变化时回调（去重：与上一帧不同才触发）
            if (emotion !== prevEmotionRef.current) {
              prevEmotionRef.current = emotion;
              onEmotionDetected?.(emotion);
            }
          } else {
            setEmotionDetected(false);
            setCurrentEmotion('');
            prevEmotionRef.current = '';
          }

          // ---- 姿态检测 ----
          if (results.pose) {
            setCurrentPose(results.pose);
            onPoseDetected?.(results.pose);
          } else {
            setCurrentPose('');
          }
        }
      } catch (err) {
        // 检测过程中出错，不中断循环，仅打印警告
        console.warn('[CameraView] 检测出错:', err);
      }

      // 继续下一帧检测
      animationFrameRef.current = requestAnimationFrame(detect);
    };

    // 启动检测循环
    animationFrameRef.current = requestAnimationFrame(detect);
  }, [onGestureDetected, onEmotionDetected, onPoseDetected]);

  // ---------- 生命周期：挂载时初始化摄像头 ----------
  useEffect(() => {
    if (visible) {
      initCamera();
    }

    // 卸载时停止摄像头
    return () => {
      stopCamera();
    };
    // 注意：仅在 visible 变化时重新初始化，避免回调变化导致重复初始化
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
        {/* 错误提示 */}
        <div className="camera-view__error-content">
          <div className="camera-view__error-icon">!</div>
          <div className="camera-view__error-text">{errorMessage || '摄像头异常'}</div>
        </div>
        {/* 切换按钮 */}
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
        {/* 加载动画 */}
        <div className="camera-view__loading-content">
          <div className="camera-view__loading-spinner" />
          <div className="camera-view__loading-text">正在启动摄像头...</div>
        </div>
        {/* 切换按钮 */}
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
      {/* 视频预览区域 */}
      <div className="camera-view__preview">
        <video
          ref={videoRef}
          className="camera-view__video"
          autoPlay
          playsInline
          muted
        />

        {/* 检测状态指示器 - 脉冲绿点 */}
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

        {/* 检测结果标签 */}
        <div className="camera-view__detection-labels">
          {/* 手势标签 */}
          {handDetected && currentGesture && (
            <span className="camera-view__label camera-view__label--gesture">
              {currentGesture}
            </span>
          )}
          {/* 情绪标签 */}
          {emotionDetected && currentEmotion && (
            <span className="camera-view__label camera-view__label--emotion">
              {currentEmotion}
            </span>
          )}
          {/* 姿态标签 */}
          {currentPose && (
            <span className="camera-view__label camera-view__label--pose">
              {currentPose}
            </span>
          )}
        </div>
      </div>

      {/* 切换按钮 */}
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
