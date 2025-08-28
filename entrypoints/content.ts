// 声明chrome API类型
declare global {
  interface Window {
    chrome: any;
    __YOUTUBE_REVENUE_SCRIPT_LOADED__?: boolean;
  }
}

// 获取chrome API引用
const chrome = (window as any).chrome;

// 常量定义
const CONSTANTS = {
  INIT_DELAY: 100, // 减少到100ms，快速响应
  VIDEO_READY_TIMEOUT: 3000, // 减少到3秒，更快超时
  AD_REVENUE_MULTIPLIER: 0.55,
  EXCHANGE_RATE: 7.2,
  CHECK_INTERVAL: 200, // 减少到200ms，更快检查
  POSITION_CHECK_INTERVAL: 3000,
  DEFAULT_RPM: 5,
  DEFAULT_AD_RATE: 60
} as const;

// 防抖函数
function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(null, args), delay);
  };
}

export default defineContentScript({
  matches: ['*://*.youtube.com/watch*'],
  main() {
    try {
      console.log('YouTube视频页面检测到，开始收益计算...');
      console.log('[ 当前页面状态 ]', {
        readyState: document.readyState,
        url: window.location.href,
        hasChrome: typeof (window as any).chrome !== 'undefined',
        hasStorage: typeof (window as any).chrome?.storage !== 'undefined'
      });

      // 标记content script已加载
      window.__YOUTUBE_REVENUE_SCRIPT_LOADED__ = true;

      // 全局状态管理
      let isCardInitialized = false;
      let currentVideoId = getCurrentVideoId();
      let currentUrl = window.location.href;
      let navigateDebounceTimer: NodeJS.Timeout | null = null;
      let positionCheckInterval: NodeJS.Timeout | null = null;
      let updateInProgress = false; // 防止重复更新

    // 获取纯视频ID（去除时间戳等参数）
    function getPureVideoId(url: string): string | null {
      const match = url.match(/youtube\.com\/watch\?v=([^&]+)/);
      return match ? match[1] : null;
    }

    // 检查是否真正的视频切换（忽略时间戳等参数变化）
    function isRealVideoChange(oldUrl: string, newUrl: string): boolean {
      const oldVideoId = getPureVideoId(oldUrl);
      const newVideoId = getPureVideoId(newUrl);
      
      // 只有当视频ID真正改变时才认为是视频切换
      return oldVideoId !== newVideoId;
    }

    // 平滑更新卡片内容（不重建整个卡片）
    async function updateCardContentSmoothly() {
      // 防止重复更新
      if (updateInProgress) {
        console.log('[ 更新已在进行中，跳过 ]');
        return;
      }
      
      updateInProgress = true;
      
      try {
        // 如果卡片不存在，先创建卡片
        if (!document.querySelector('#youtube-revenue-card')) {
          console.log('[ 卡片不存在，先创建卡片 ]');
          await initRevenueCalculator();
          return;
        }

        console.log('[ 开始更新卡片内容，当前视频ID:', currentVideoId, ']');
        
        // 等待新视频数据加载完成，使用更严格的验证
        const isReady = await waitForVideoReady(currentVideoId, CONSTANTS.VIDEO_READY_TIMEOUT);
        if (!isReady) {
          console.warn('[ 视频数据未就绪，尝试继续更新 ]');
        }
        
        // 多次尝试获取观看量，确保数据准确性
        let views = null;
        let attempts = 0;
        const maxAttempts = 8;
        let lastViews = null;
        let stableViewsCount = 0;
        
        console.log('[ 开始获取观看量，最多尝试', maxAttempts, '次 ]');
        
        while (attempts < maxAttempts) {
          const currentViews = getVideoViews();
          
          if (currentViews && currentViews > 0) {
            if (currentViews === lastViews) {
              stableViewsCount++;
              console.log('[ 观看量稳定检查:', stableViewsCount, '/3, 值:', currentViews, ']');
              
              if (stableViewsCount >= 3) {
                views = currentViews;
                console.log('[ 观看量数据已稳定，最终值:', views, ']');
                break;
              }
            } else {
              stableViewsCount = 1;
              lastViews = currentViews;
              console.log('[ 观看量变化，新值:', currentViews, ']');
            }
          } else {
            console.log('[ 尝试获取观看量，第', attempts + 1, '次，未获取到数据 ]');
          }
          
          attempts++;
          await sleep(600); // 增加间隔，确保数据有足够时间更新
        }
        
        if (!views) {
          console.error('[ 无法获取稳定的观看量数据，已尝试', maxAttempts, '次 ]');
          updateLoadingState('无法获取新视频数据，请刷新页面重试', true);
          return;
        }

        console.log('[ 成功获取稳定观看量:', views, ']');

        // 最终验证：确保当前视频ID与期望的一致
        const currentVideoIdCheck = getCurrentVideoId();
        if (currentVideoIdCheck !== currentVideoId) {
          console.error('[ 视频ID验证失败 ] 期望:', currentVideoId, '实际:', currentVideoIdCheck);
          updateLoadingState('视频数据验证失败，请重试', true);
          return;
        }
        
        console.log('[ 视频ID验证通过，开始计算收益 ]');
        
        // 从存储中获取设置
        let rpm = CONSTANTS.DEFAULT_RPM;
        let adRate = CONSTANTS.DEFAULT_AD_RATE;
        
        try {
          if (typeof (window as any).chrome !== 'undefined' && (window as any).chrome.storage) {
            const result = await (window as any).chrome.storage.sync.get(['rpm', 'adRate']);
            if (result.rpm !== undefined) rpm = result.rpm;
            if (result.adRate !== undefined) adRate = result.adRate;
          }
        } catch (error) {
          console.log('[ 使用默认设置值 ]');
        }

        const revenueUSD = (views / 1000) * rpm * (adRate / 100) * CONSTANTS.AD_REVENUE_MULTIPLIER;
        const revenueCNY = revenueUSD * CONSTANTS.EXCHANGE_RATE;

        // 平滑更新显示内容
        updateRevenueDisplay(views, rpm, adRate, revenueUSD, revenueCNY);
        
        console.log('[ 卡片内容已平滑更新，观看量:', views, '收益:', revenueUSD, ']');
      } catch (error) {
        console.error('[ 更新卡片内容失败 ]', error);
        updateLoadingState('更新失败，请重试', true);
      } finally {
        updateInProgress = false;
      }
    }

    // 初始化收益计算器
    const initPage = async () => {
      try {
        if (!isCardInitialized) {
          console.log('[ 开始初始化页面，当前状态:', document.readyState, ']');
          
          // 确保页面完全加载
          if (document.readyState !== 'complete') {
            console.log('[ 等待页面完全加载... ]');
            await new Promise(resolve => {
              if (document.readyState === 'complete') {
                resolve(true);
              } else {
                window.addEventListener('load', resolve, { once: true });
              }
            });
          }
          
          console.log('[ 页面已完全加载，开始初始化收益计算器 ]');
          await initRevenueCalculator();
          isCardInitialized = true;
          console.log('[ 页面初始化完成 ]');
        }
      } catch (error) {
        console.error('[ 页面初始化失败 ]', error);
        // 如果初始化失败，5秒后重试
        setTimeout(() => {
          if (!isCardInitialized) {
            console.log('[ 重新尝试初始化页面 ]');
            initPage();
          }
        }, 5000);
      }
    };

    // 等待页面完全加载
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initPage, CONSTANTS.INIT_DELAY);
      });
    } else {
      setTimeout(initPage, CONSTANTS.INIT_DELAY);
    }

    // 统一视频切换处理函数
    let videoChangeInProgress = false;
    let videoChangeTimer: NodeJS.Timeout | null = null;
    
    function handleVideoChange(newVideoId: string | null, source: string) {
      if (videoChangeInProgress) {
        console.log('[ 视频切换已在进行中，跳过重复处理 ]', source);
        return;
      }
      
      if (!newVideoId || newVideoId === currentVideoId) {
        console.log('[ 视频ID未变化，跳过处理 ]', source);
        return;
      }
      
      console.log('[ 开始处理视频切换 ]', source, currentVideoId, '->', newVideoId);
      videoChangeInProgress = true;
      
      // 清除之前的定时器
      if (videoChangeTimer) {
        clearTimeout(videoChangeTimer);
      }
      
      // 更新状态
      currentVideoId = newVideoId;
      currentUrl = window.location.href;
      
      // 显示加载状态
      updateLoadingState('正在获取新视频数据...');
      
      // 使用统一的延迟处理，确保页面完全更新
      videoChangeTimer = setTimeout(async () => {
        try {
          await updateCardContentSmoothly();
        } finally {
          videoChangeInProgress = false;
          videoChangeTimer = null;
        }
      }, 1500); // 统一延迟1.5秒，确保DOM完全更新
    }

    // 优化后的URL变化检测（仅作为备用）
    const checkUrlChange = debounce(() => {
      if (window.location.href !== currentUrl) {
        const oldUrl = currentUrl;
        const newUrl = window.location.href;
        
        // 检查是否真正的视频切换
        if (isRealVideoChange(oldUrl, newUrl)) {
          console.log('[ URL检测: 视频切换 ]', oldUrl, '->', newUrl);
          const newVideoId = getCurrentVideoId();
          handleVideoChange(newVideoId, 'URL检测');
        } else {
          console.log('[ URL检测: 非视频切换，忽略 ]', newUrl);
          currentUrl = newUrl; // 更新当前URL记录
        }
      }
    }, 500); // 增加防抖延迟

    // 定期检查URL变化（降低频率）
    setInterval(checkUrlChange, 1000);

    // 监听popstate事件（浏览器前进/后退）
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        const newUrl = window.location.href;
        const newVideoId = getCurrentVideoId();
        
        // 检查是否真正的视频切换
        if (isRealVideoChange(currentUrl, newUrl)) {
          console.log('[ popstate: 视频切换 ]', currentUrl, '->', newUrl);
          handleVideoChange(newVideoId, 'popstate');
        } else {
          console.log('[ popstate: 非视频切换，忽略 ]', newUrl);
          currentUrl = newUrl; // 更新URL记录
        }
      }, 200);
    });

    // 监听页面变化
    const observer = new MutationObserver(() => {
      // 只在卡片未初始化时才处理页面变化
      if (!isCardInitialized && document.querySelector('#secondary') && !document.querySelector('#youtube-revenue-card')) {
        if (navigateDebounceTimer) clearTimeout(navigateDebounceTimer);
        navigateDebounceTimer = setTimeout(async () => {
          try {
            await waitForVideoReady(currentVideoId, CONSTANTS.VIDEO_READY_TIMEOUT);
            if (!isCardInitialized) {
              await initRevenueCalculator();
              isCardInitialized = true;
            }
          } catch (error) {
            console.warn('[ 视频就绪等待超时，尝试继续初始化 ]', error);
            if (!isCardInitialized) {
              await initRevenueCalculator();
              isCardInitialized = true;
            }
          }
        }, 300);
      } else if (document.querySelector('#youtube-revenue-card')) {
        // 检查并确保卡片位置
        ensureCardPosition();
      }
    });
    
    // 显式监听YouTube的SPA事件
    window.addEventListener('yt-navigate-finish', () => {
      const newVideoId = getCurrentVideoId();
      console.log('[ yt-navigate-finish: 事件触发 ]', newVideoId);
      console.log('[ 调试: 页面状态 ]');
      debugPageState();
      
      // 使用统一的视频切换处理函数
      handleVideoChange(newVideoId, 'yt-navigate-finish');
    });

    window.addEventListener('yt-page-data-updated', () => {
      const newVideoId = getCurrentVideoId();
      console.log('[ yt-page-data-updated: 事件触发 ]', newVideoId);
      console.log('[ 调试: 页面状态 ]');
      debugPageState();
      
      // 使用统一的视频切换处理函数
      handleVideoChange(newVideoId, 'yt-page-data-updated');
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // 启动位置监控，确保卡片始终在最顶部
    positionCheckInterval = startPositionMonitoring();

    // 添加消息监听器，用于响应popup的请求
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((
        request: { action: string },
        sender: any,
        sendResponse: (response: any) => void
      ) => {
        console.log('[ Content Script ] 收到消息:', request);

        if (request.action === 'getVideoData') {
          (async () => {
            try {
              // 检查是否在YouTube视频页面
              if (!window.location.href.includes('youtube.com/watch')) {
                sendResponse({
                  success: false,
                  error: '当前页面不是YouTube视频页面'
                });
                return;
              }

              const expectedId = getCurrentVideoId();
              await waitForVideoReady(expectedId, CONSTANTS.VIDEO_READY_TIMEOUT);
              const views = await fetchViewsWithRetry(6000);
              console.log('[ Content Script ] 获取到观看量:', views);

              sendResponse({
                success: true,
                views: views || 0
              });
            } catch (error: any) {
              console.error('[ Content Script ] 获取视频数据失败:', error);
              sendResponse({
                success: false,
                error: error.message || '获取视频数据失败'
              });
            }
          })();
          return true; // 保持消息通道开放
        }
      });

      console.log('[ Content Script ] 消息监听器已设置');
    } else {
      console.log('[ Content Script ] Chrome API 不可用');
    }

    // 监听设置变更（如RPM、广告投放率）并实时刷新展示
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes: any, area: string) => {
          if (area === 'sync' && (changes.rpm || changes.adRate)) {
            console.log('[ Content Script ] 监听到设置变更，重新计算收益');
            // 直接重算，不重建卡片
            setTimeout(calculateRevenue, 0);
          }
        });
      }
    } catch (error) {
      console.warn('[ Content Script ] 存储监听设置失败，使用降级方案:', error);
      // 降级方案：定期检查设置变化
      setInterval(async () => {
        try {
          await calculateRevenue();
        } catch (e) {
          // 忽略计算错误
        }
      }, 5000);
    }

    // 清理函数
    const cleanup = () => {
      if (navigateDebounceTimer) clearTimeout(navigateDebounceTimer);
      if (positionCheckInterval) clearInterval(positionCheckInterval);
      observer.disconnect();
      console.log('[ Content Script ] 清理完成');
    };

    // 在页面卸载时调用清理
    window.addEventListener('beforeunload', cleanup);
    
    // 在扩展卸载时调用清理
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onSuspend.addListener(cleanup);
    }
  } catch (error) {
    console.error('[ Content Script 初始化失败 ]', error);
  }
},
});

// 智能元素等待函数
function waitForElement(selector: string, timeout: number = 5000): Promise<Element> {
  return new Promise<Element>((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

// 指数退避重试函数
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, i);
      console.log(`[ 重试 ${i + 1}/${maxRetries}，延迟 ${delay}ms ]`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// 精细化更新加载状态显示
function updateLoadingState(message: string, isError: boolean = false) {
  const resultElement = document.querySelector('#revenue-result');
  if (!resultElement) return;

  const color = isError ? '#ff4d4f' : 'var(--yt-spec-text-secondary)';
  const expectedContent = `<div style="color: ${color}; text-align: center;">${message}</div>`;
  
  // 检查是否需要更新，避免不必要的DOM操作
  if (resultElement.innerHTML !== expectedContent) {
    resultElement.innerHTML = expectedContent;
    console.log('[ 加载状态已更新 ]', { message, isError });
  } else {
    console.log('[ 加载状态无需更新，内容相同 ]');
  }
}

// 优化后的初始化函数
async function initRevenueCalculator() {
  // 如果卡片已存在，直接返回，不重建
  if (document.querySelector('#youtube-revenue-card')) {
    console.log('[ 收益卡片已存在，跳过初始化 ]');
    return;
  }

  try {
    console.log('[ 开始初始化收益计算器 ]');
    
    // 检查页面是否已经准备好
    if (document.readyState !== 'complete') {
      console.log('[ 页面未完全加载，等待... ]');
      await new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve(true);
        } else {
          document.addEventListener('load', resolve, { once: true });
        }
      });
    }
    
    // 等待YouTube页面元素加载
    const secondary = await waitForElement('#secondary', 15000);
    const infoContainer = await waitForElement('#info-container', 15000);
    
    // 快速检查：确保观看量数据已经加载（减少等待时间）
    let viewsLoaded = false;
    let attempts = 0;
    const maxAttempts = 10; // 减少从20次到10次
    
    while (!viewsLoaded && attempts < maxAttempts) {
      const testViews = getVideoViews();
      if (testViews && testViews > 0) {
        viewsLoaded = true;
        console.log('[ 观看量数据已加载，值:', testViews, ']');
      } else {
        attempts++;
        console.log('[ 等待观看量数据加载，第', attempts, '次尝试 ]');
        await sleep(200); // 减少从500ms到200ms
      }
    }
    
    if (!viewsLoaded) {
      console.warn('[ 观看量数据加载超时，但继续创建卡片 ]');
    }

    const revenueCard = createRevenueCard();
    
    // 强制插入到最顶部，确保不被其他插件挤下去
    insertRevenueCardAtTop(secondary, revenueCard);

    // 显示加载状态
    updateLoadingState('正在获取视频数据...');

    // 延迟计算，确保所有元素都已渲染
    setTimeout(calculateRevenue, CONSTANTS.INIT_DELAY);
    
    console.log('[ 收益卡片初始化完成 ]');
  } catch (error) {
    console.error('[ 初始化收益计算器失败 ]', error);
    
    // 更友好的错误处理
    if (error instanceof Error) {
      if (error.message.includes('Element #secondary not found')) {
        console.log('[ 页面元素未就绪，将在页面完全加载后重试 ]');
        // 等待页面完全加载后重试
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initRevenueCalculator, 2000);
          });
        } else {
          setTimeout(initRevenueCalculator, 3000);
        }
      } else {
        console.log('[ 其他错误，将在3秒后重试 ]');
        setTimeout(initRevenueCalculator, 3000);
      }
    } else {
      console.log('[ 未知错误，将在3秒后重试 ]');
      setTimeout(initRevenueCalculator, 3000);
    }
  }
}

// 创建收益卡片（只在第一次创建时调用）
function createRevenueCard() {
  const revenueCard = document.createElement('div');
  revenueCard.id = 'youtube-revenue-card';
  
  // 基础样式
  revenueCard.style.margin = '16px auto';
  revenueCard.style.padding = '12px';
  revenueCard.style.background = 'var(--yt-spec-base-background)';
  revenueCard.style.borderRadius = '10px';
  revenueCard.style.border = '1px solid var(--yt-spec-10-percent-layer)';
  
  // 确保视觉优先级
  revenueCard.style.position = 'relative';
  revenueCard.style.zIndex = '9999';
  
  // 使用更结构化的HTML，便于后续更新
  revenueCard.innerHTML = `
    <div style="font-size: 16px; font-weight: 500; margin-bottom: 12px; color: var(--yt-spec-text-primary)">
      💰 预估收益
    </div>
    <div id="revenue-content" style="color: var(--yt-spec-text-secondary)">
      <div id="revenue-formula" style="text-align: center; margin-bottom: 16px;">
        <div id="revenue-result" style="font-size: 16px; font-weight: 600; color: var(--yt-spec-text-primary); margin-bottom: 12px;">
          正在计算中...
        </div>
        <div id="revenue-note" style="background-color: rgba(255, 215, 0, 0.3); font-size: 14px; color: var(--yt-spec-text-secondary);">
          (观看量 ÷ 1000) × RPM × 投放率 × 55% ≈ 预估收益（简化版）
        </div>
      </div>
    </div>
  `;

  return revenueCard;
}

// 强制插入到最顶部，确保不被其他插件挤下去
function insertRevenueCardAtTop(secondary: Element, revenueCard: Element) {
  if (secondary.firstChild) {
    secondary.insertBefore(revenueCard, secondary.firstChild);
  } else {
    secondary.appendChild(revenueCard);
  }
  
  // 添加CSS样式确保优先级
  addPriorityStyles();
}

// 添加优先级CSS样式
function addPriorityStyles() {
  if (document.querySelector('#youtube-revenue-priority-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'youtube-revenue-priority-styles';
  style.textContent = `
    #youtube-revenue-card {
      order: -1 !important;
      z-index: 9999 !important;
      position: relative !important;
    }
    
    /* 确保在YouTube的flexbox布局中排在最前面 */
    #secondary > #youtube-revenue-card {
      order: -1 !important;
    }
  `;
  
  document.head.appendChild(style);
}

// 精细化更新：只更新需要变化的数值部分，不重建DOM
function updateRevenueDisplay(views: number, rpm: number, adRate: number, usd: number, cny: number) {
  const resultElement = document.querySelector('#revenue-result');
  if (!resultElement) return;

  // 使用更精细的更新方式，避免重建整个HTML结构
  const existingContent = resultElement.innerHTML;
  
  // 检查是否需要更新，避免不必要的DOM操作
  const expectedContent = `( ${views.toLocaleString()} ÷ 1000 ) × $${rpm.toFixed(2)} × ${adRate.toFixed(0)}% × 0.55 ≈ <span style="color: #ffd700;">$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> ≈ <span style="color: #ffd700;">¥${cny.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
  
  // 只有当内容真正发生变化时才更新
  if (existingContent !== expectedContent) {
    resultElement.innerHTML = expectedContent;
    console.log('[ 收益显示已更新 ]', { views, rpm, adRate, usd, cny });
  } else {
    console.log('[ 收益显示无需更新，内容相同 ]');
  }
}



// 优化后的收益计算函数
async function calculateRevenue() {
  try {
    const views = getVideoViews();
    console.log('[ views ]', views);

    if (!views) {
      updateLoadingState('无法获取观看量数据，请刷新页面重试', true);
      return;
    }

    // 从存储中获取RPM与广告投放率
    let rpm = CONSTANTS.DEFAULT_RPM;
    let adRate = CONSTANTS.DEFAULT_AD_RATE;
    
    if (typeof (window as any).chrome !== 'undefined' && (window as any).chrome.storage) {
      try {
        const result = await (window as any).chrome.storage.sync.get(['rpm', 'adRate']);
        if (result.rpm !== undefined) {
          rpm = result.rpm;
        }
        if (result.adRate !== undefined) {
          adRate = result.adRate;
        }
      } catch (error) {
        console.log('[ 使用默认RPM值 ]', rpm);
      }
    }

    const revenueUSD = (views / 1000) * rpm * (adRate / 100) * CONSTANTS.AD_REVENUE_MULTIPLIER;
    const revenueCNY = revenueUSD * CONSTANTS.EXCHANGE_RATE;

    updateRevenueDisplay(views, rpm, adRate, revenueUSD, revenueCNY);
  } catch (error) {
    console.error('[ 计算收益失败 ]', error);
    updateLoadingState('计算收益时发生错误，请重试', true);
  }
}

function getVideoViews() {
  // 从 #info 元素获取观看量
  const infoContainer = document.querySelector('#info-container');
  if (infoContainer) {
    const infoElement = infoContainer.querySelector('yt-formatted-string#info span:first-child');
    if (infoElement) {
      const infoText = infoElement.textContent || '';
      console.log('[ infoElement text ]', infoText);

      const viewMatch = infoText.match(/([\d.,]+[万亿]*)\s*次观看/);
      if (viewMatch) {
        const views = parseViewCount(viewMatch[1]);
        console.log('[ 解析到中文观看量 ]', viewMatch[1], '->', views);
        return views;
      }
    }
  }

  // 尝试英文格式
  const allText = document.body.textContent || '';
  const englishMatch = allText.match(/([\d.,]+[KMB]*)\s*views/);
  if (englishMatch) {
    console.log('[ english match ]', englishMatch[1]);
    const views = parseEnglishViewCount(englishMatch[1]);
    console.log('[ 解析到英文观看量 ]', englishMatch[1], '->', views);
    return views;
  }

  console.log('[ 未找到观看量数据 ]');
  return null;
}

function parseViewCount(viewCount: string): number {
  console.log('[ parseViewCount input ]', viewCount);

  if (viewCount.includes('万')) {
    const num = parseFloat(viewCount.replace(/[^\d.]/g, ''));
    const result = Math.round(num * 10000);
    console.log('[ 万转换结果 ]', num, '->', result);
    return result;
  }

  if (viewCount.includes('亿')) {
    const num = parseFloat(viewCount.replace(/[^\d.]/g, ''));
    const result = Math.round(num * 100000000);
    console.log('[ 亿转换结果 ]', num, '->', result);
    return result;
  }

  const result = parseInt(viewCount.replace(/[^\d]/g, '')) || 0;
  console.log('[ 数字转换结果 ]', viewCount, '->', result);
  return result;
}

function parseEnglishViewCount(viewCount: string): number {
  console.log('[ parseEnglishViewCount input ]', viewCount);

  if (viewCount.includes('K')) {
    const num = parseFloat(viewCount.replace(/[^\d.]/g, ''));
    return Math.round(num * 1000);
  }

  if (viewCount.includes('M')) {
    const num = parseFloat(viewCount.replace(/[^\d.]/g, ''));
    return Math.round(num * 1000000);
  }

  if (viewCount.includes('B')) {
    const num = parseFloat(viewCount.replace(/[^\d.]/g, ''));
    return Math.round(num * 1000000000);
  }

  return parseInt(viewCount.replace(/[^\d]/g, '')) || 0;
}

// 工具与等待函数
function getCurrentVideoId(): string | null {
  try {
    const url = new URL(window.location.href);
    const videoId = url.searchParams.get('v');
    console.log('[ 当前视频ID ]', videoId, 'URL:', window.location.href);
    return videoId;
  } catch {
    console.error('[ 获取视频ID失败 ]');
    return null;
  }
}

// 调试函数：检查页面状态
function debugPageState() {
  console.log('=== 页面状态调试信息 ===');
  console.log('当前URL:', window.location.href);
  console.log('视频ID:', getCurrentVideoId());
  console.log('info-container存在:', !!document.querySelector('#info-container'));
  console.log('secondary存在:', !!document.querySelector('#secondary'));
  
  const infoContainer = document.querySelector('#info-container');
  if (infoContainer) {
    const infoElement = infoContainer.querySelector('yt-formatted-string#info span:first-child');
    if (infoElement) {
      console.log('观看量文本:', infoElement.textContent);
    }
  }
  
  console.log('收益卡片存在:', !!document.querySelector('#youtube-revenue-card'));
  console.log('========================');
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForVideoReady(expectedVideoId: string | null, timeoutMs: number = CONSTANTS.VIDEO_READY_TIMEOUT) {
  const start = Date.now();
  let lastViews = null;
  let stableCount = 0;
  let lastVideoId = null;
  let videoIdStableCount = 0;
  
  console.log('[ 开始等待视频数据就绪，期望视频ID:', expectedVideoId, ']');
  
  while (Date.now() - start < timeoutMs) {
    const currentId = getCurrentVideoId();
    const hasInfo = !!document.querySelector('#info-container');
    const hasSecondary = !!document.querySelector('#secondary');
    
    // 首先确保视频ID稳定
    if (currentId === lastVideoId) {
      videoIdStableCount++;
    } else {
      videoIdStableCount = 0;
      lastVideoId = currentId;
    }
    
    // 要求视频ID稳定至少2次检查（减少从3次到2次）
    if (videoIdStableCount >= 2 && (expectedVideoId == null || currentId === expectedVideoId) && hasInfo && hasSecondary) {
      const views = getVideoViews();
      
      // 确保观看量数据稳定（连续2次读取到相同值，减少从3次到2次）
      if (views && views > 0) {
        if (lastViews === views) {
          stableCount++;
          console.log('[ 观看量数据稳定检查:', stableCount, '/2, 当前值:', views, ']');
          if (stableCount >= 2) {
            console.log('[ 视频数据已完全稳定，观看量:', views, '视频ID:', currentId, ']');
            return true;
          }
        } else {
          stableCount = 0;
          lastViews = views;
          console.log('[ 观看量数据变化，重置稳定性计数:', lastViews, '->', views, ']');
        }
      } else {
        console.log('[ 等待观看量数据加载... ]');
      }
    } else {
      console.log('[ 等待页面元素就绪，视频ID稳定:', videoIdStableCount, '/2 ]');
    }
    
    await sleep(150); // 减少检查间隔从300ms到150ms，更快响应
  }
  
  console.warn('[ 等待视频数据超时，已等待:', Date.now() - start, 'ms ]');
  return false;
}

async function fetchViewsWithRetry(timeoutMs: number = 3000): Promise<number | null> { // 减少超时从6秒到3秒
  const start = Date.now();
  let last: number | null = null;
  while (Date.now() - start < timeoutMs) {
    const v = getVideoViews();
    if (typeof v === 'number' && v >= 0) {
      // 避免读取到上个页面残留的值：要求连续两次一致
      if (last !== null && v === last) return v;
      last = v;
    }
    await sleep(150); // 减少从300ms到150ms
  }
  return last;
}
// 确保卡片始终在最顶部
function ensureCardPosition() {
  const secondary = document.querySelector('#secondary');
  const revenueCard = document.querySelector('#youtube-revenue-card');
  
  if (!secondary || !revenueCard) return;
  
  // 如果卡片不在第一个位置，强制移动到顶部
  if (secondary.firstChild !== revenueCard) {
    console.log('[ 检测到位置变化，重新定位收益卡片 ]');
    secondary.insertBefore(revenueCard, secondary.firstChild);
  }
}

// 启动位置监控，定期检查卡片位置
function startPositionMonitoring() {
  // 每3秒检查一次位置，确保卡片不被其他插件挤下去
  return setInterval(ensureCardPosition, CONSTANTS.POSITION_CHECK_INTERVAL);
}

