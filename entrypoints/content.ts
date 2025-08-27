// 声明chrome API类型
declare global {
  interface Window {
    chrome: any;
  }
}

export default defineContentScript({
  matches: ['*://*.youtube.com/watch*'],
  main() {
    console.log('YouTube视频页面检测到，开始收益计算...');
    
    // 初始化收益计算器
    const initPage = () => {
      setTimeout(initRevenueCalculator, 1000);
    };
    
    // 等待页面完全加载
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPage);
    } else {
      initPage();
    }
    
    // 监听YouTube SPA导航事件
    let currentUrl = window.location.href;
    
    // 监听URL变化（YouTube使用History API进行导航）
    const checkUrlChange = () => {
      if (window.location.href !== currentUrl) {
        console.log('[ 检测到页面切换 ]', currentUrl, '->', window.location.href);
        currentUrl = window.location.href;
        
        // 移除旧的收益卡片
        const oldCard = document.querySelector('#youtube-revenue-card');
        if (oldCard) {
          oldCard.remove();
        }
        
        // 延迟初始化新的收益计算器
        setTimeout(initRevenueCalculator, 1500);
      }
    };
    
    // 定期检查URL变化
    setInterval(checkUrlChange, 500);
    
    // 监听popstate事件（浏览器前进/后退）
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        checkUrlChange();
      }, 100);
    });
    
    // 监听页面变化
    const observer = new MutationObserver(() => {
      if (document.querySelector('#secondary') && !document.querySelector('#youtube-revenue-card')) {
        setTimeout(initRevenueCalculator, 500);
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // 添加消息监听器，用于响应popup的请求
    if (typeof (window as any).chrome !== 'undefined' && (window as any).chrome.runtime) {
      (window as any).chrome.runtime.onMessage.addListener((
        request: { action: string }, 
        sender: any, 
        sendResponse: (response: any) => void
      ) => {
        if (request.action === 'getVideoData') {
          try {
            const views = getVideoViews();
            
            sendResponse({
              success: true,
              views: views || 0
            });
          } catch (error: any) {
            console.error('获取视频数据失败:', error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
          return true; // 保持消息通道开放
        }
      });
    }
  },
});

function initRevenueCalculator() {
  if (document.querySelector('#youtube-revenue-card')) return;
  
  const secondary = document.querySelector('#secondary');
  if (!secondary) {
    console.log('[ 未找到 #secondary 元素，等待重试... ]');
    setTimeout(initRevenueCalculator, 1000);
    return;
  }
  
  // 等待页面元素完全加载
  if (!document.querySelector('#info-container')) {
    console.log('[ 页面元素未完全加载，等待重试... ]');
    setTimeout(initRevenueCalculator, 1000);
    return;
  }
  
  console.log('[ 开始初始化收益计算器 ]');
  
  const revenueCard = document.createElement('div');
  revenueCard.id = 'youtube-revenue-card';
  revenueCard.style.margin = '16px auto';
  revenueCard.style.padding = '16px';
  revenueCard.style.background = 'var(--yt-spec-base-background)';
  revenueCard.style.borderRadius = '10px';
  revenueCard.style.border = '1px solid var(--yt-spec-10-percent-layer)';
  
  revenueCard.innerHTML = `
    <div style="font-size: 16px; font-weight: 500; margin-bottom: 12px; color: var(--yt-spec-text-primary)">
      💰 预估收益
    </div>
    <div id="revenue-content" style="color: var(--yt-spec-text-secondary)">
      正在计算中...
    </div>
  `;
  
  secondary.insertBefore(revenueCard, secondary.firstChild);
  
  // 延迟计算，确保所有元素都已渲染
  setTimeout(calculateRevenue, 1000);
}

async function calculateRevenue() {
  const views = getVideoViews();
  console.log('[ views ]', views)
  
  const contentElement = document.querySelector('#revenue-content');
  
  if (!views) {
    if (contentElement) {
      contentElement.innerHTML = `
        <div style="color: #ff4d4f; margin-bottom: 8px;">
          无法获取观看量数据
        </div>
        <div style="font-size: 12px; color: var(--yt-spec-text-secondary);">
          请刷新页面重试
        </div>
      `;
    }
    return;
  }
  
  // 从存储中获取RPM值
  let rpm = 5; // 默认RPM值
  try {
    if (typeof (window as any).chrome !== 'undefined' && (window as any).chrome.storage) {
      const result = await (window as any).chrome.storage.sync.get(['rpm']);
      if (result.rpm !== undefined) {
        rpm = result.rpm;
      }
    }
  } catch (error) {
    console.log('[ 使用默认RPM值 ]', rpm);
  }
  
  const revenueUSD = (views / 1000) * rpm;
  const revenueCNY = revenueUSD * 7.2;
  
  updateRevenueDisplay(views, rpm, revenueUSD, revenueCNY);
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
        return parseViewCount(viewMatch[1]);
      }
    }
  }
  
  // 尝试英文格式
  const allText = document.body.textContent || '';
  const englishMatch = allText.match(/([\d.,]+[KMB]*)\s*views/);
  if (englishMatch) {
    console.log('[ english match ]', englishMatch[1]);
    return parseEnglishViewCount(englishMatch[1]);
  }
  
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

function updateRevenueDisplay(views: number, rpm: number, usd: number, cny: number) {
  const contentElement = document.querySelector('#revenue-content');
  if (!contentElement) return;
  
  contentElement.innerHTML = `
    <div style="text-align: center; margin-bottom: 16px;">
      <div style="font-size: 16px; font-weight: 600; color: var(--yt-spec-text-primary); margin-bottom: 12px;">
        ( ${views.toLocaleString()} ÷ 1000 ) × $${rpm.toFixed(2)} ≈ <span style="color: #ffd700;">$${usd.toFixed(2)}</span> ≈ <span style="color: #ffd700;">¥${cny.toFixed(2)}</span>
      </div>
      <div style="background-color: rgba(255, 215, 0, 0.3); font-size: 14px; color: var(--yt-spec-text-secondary); margin-bottom: 8px;">
        (观看量 ÷ 1000) × RPM ≈ 预估收益
      </div>

    </div>
  `;
}
