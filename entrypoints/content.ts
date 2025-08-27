export default defineContentScript({
  matches: ['*://*.youtube.com/watch*'],
  main() {
    console.log('YouTube视频页面检测到，开始收益计算...');
    
    // 等待页面完全加载
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initRevenueCalculator, 1000);
      });
    } else {
      setTimeout(initRevenueCalculator, 1000);
    }
    
    // 监听页面变化
    const observer = new MutationObserver(() => {
      if (document.querySelector('#secondary') && !document.querySelector('#youtube-revenue-card')) {
        setTimeout(initRevenueCalculator, 500);
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
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
  if (!document.querySelector('#info-container') || !document.querySelector('#view-count')) {
    console.log('[ 页面元素未完全加载，等待重试... ]');
    setTimeout(initRevenueCalculator, 1000);
    return;
  }
  
  // 等待评论区加载
  if (!document.querySelector('#comments')) {
    console.log('[ 评论区未加载，等待重试... ]');
    setTimeout(initRevenueCalculator, 1000);
    return;
  }
  
  console.log('[ 开始初始化收益计算器 ]');
  
  const revenueCard = document.createElement('div');
  revenueCard.id = 'youtube-revenue-card';
  revenueCard.style.marginTop = '16px';
  revenueCard.style.padding = '16px';
  revenueCard.style.background = 'var(--yt-spec-base-background)';
  revenueCard.style.borderRadius = '12px';
  revenueCard.style.border = '1px solid var(--yt-spec-10-percent-layer)';
  
  revenueCard.innerHTML = `
    <div style="font-size: 16px; font-weight: 500; margin-bottom: 12px; color: var(--yt-spec-text-primary)">
      💰 视频收益估算
    </div>
    <div id="revenue-content" style="color: var(--yt-spec-text-secondary)">
      正在计算中...
    </div>
  `;
  
  secondary.insertBefore(revenueCard, secondary.firstChild);
  
  // 延迟计算，确保所有元素都已渲染，包括评论区
  setTimeout(calculateRevenue, 1000);
}

function calculateRevenue() {
  // 首先检查评论区是否已加载
  if (!document.querySelector('#comments')) {
    console.log('[ 评论区未加载，等待重试... ]');
    setTimeout(calculateRevenue, 1000);
    return;
  }
  
  // 检查评论数元素是否已加载
  const countElement = document.querySelector('#comments #count yt-formatted-string');
  if (!countElement) {
    console.log('[ 评论数元素未加载，等待重试... ]');
    setTimeout(calculateRevenue, 1000);
    return;
  }
  
  const views = getVideoViews();
  console.log('[ views ]-50', views)
  const likes = getVideoLikes();
  console.log('[ likes ]-52', likes)
  const comments = getVideoComments();
  console.log('[ comments ]-54', comments)
  
  const contentElement = document.querySelector('#revenue-content');
  
  if (!views) {
    if (contentElement) {
      const infoContainer = document.querySelector('#info-container');
      const viewCountElement = document.querySelector('#view-count');
      const infoElement = document.querySelector('yt-formatted-string#info');
      
      contentElement.innerHTML = `
        <div style="color: #ff4d4f; margin-bottom: 8px;">
          无法获取观看量数据
        </div>
        <div style="font-size: 12px; color: var(--yt-spec-text-secondary); margin-bottom: 8px;">
          <strong>页面结构检查:</strong><br>
          • info-container: ${infoContainer ? '✅ 找到' : '❌ 未找到'}<br>
          • view-count: ${viewCountElement ? '✅ 找到' : '❌ 未找到'}<br>
          • info元素: ${infoElement ? '✅ 找到' : '❌ 未找到'}
        </div>
        <div style="font-size: 12px; color: var(--yt-spec-text-secondary); margin-bottom: 8px;">
          <strong>元素内容:</strong><br>
          • view-count内容: ${viewCountElement ? (viewCountElement.textContent || '空') : 'N/A'}<br>
          • info内容: ${infoElement ? (infoElement.textContent || '空') : 'N/A'}
        </div>
        <div style="font-size: 12px; color: var(--yt-spec-text-secondary);">
          <strong>调试信息:</strong> 请查看浏览器控制台的详细日志
        </div>
      `;
    }
    return;
  }
  
  if (contentElement) {
    contentElement.innerHTML = `
      <div style="margin-bottom: 8px;">
        <span style="font-weight: 500;">观看量:</span> ${views.toLocaleString()}
      </div>
      <div style="margin-bottom: 8px;">
        <span style="font-weight: 500;">点赞数:</span> ${likes.toLocaleString()}
      </div>
      <div style="margin-bottom: 8px;">
        <span style="font-weight: 500;">评论数:</span> ${comments.toLocaleString()}
      </div>
    `;
  }
  
  const revenueUSD = estimateRevenue(views, likes, comments);
  const revenueCNY = convertToCNY(revenueUSD);
  
  updateRevenueDisplay(revenueUSD, revenueCNY, views, likes, comments);
}

function getVideoViews() {
  // 方法1: 从 #view-count 元素获取
  const viewCountElement = document.querySelector('#view-count');
  if (viewCountElement) {
    const viewText = viewCountElement.textContent || '';
    console.log('[ viewCountElement text ]', viewText);
    
    // 尝试从 view-count 中直接获取数字
    const directMatch = viewText.match(/([\d.,]+[万亿]*)\s*次观看/);
    if (directMatch) {
      return parseViewCount(directMatch[1]);
    }
  }
  
  // 方法2: 从 #info 元素获取
  const infoContainer = document.querySelector('#info-container');
  if (infoContainer) {
    const infoElement = infoContainer.querySelector('yt-formatted-string#info');
    if (infoElement) {
      const infoText = infoElement.textContent || '';
      console.log('[ infoElement text ]', infoText);
      
      const viewMatch = infoText.match(/([\d.,]+[万亿]*)\s*次观看/);
      if (viewMatch) {
        return parseViewCount(viewMatch[1]);
      }
    }
  }
  
  // 方法3: 从整个页面搜索观看量文本
  const allText = document.body.textContent || '';
  const globalViewMatch = allText.match(/([\d.,]+[万亿]*)\s*次观看/);
  if (globalViewMatch) {
    console.log('[ global match ]', globalViewMatch[1]);
    return parseViewCount(globalViewMatch[1]);
  }
  
  // 方法4: 尝试英文格式
  const englishMatch = allText.match(/([\d.,]+[KMB]*)\s*views/);
  if (englishMatch) {
    console.log('[ english match ]', englishMatch[1]);
    return parseEnglishViewCount(englishMatch[1]);
  }
  
  console.log('[ 所有方法都失败，页面内容 ]', document.body.innerHTML.substring(0, 1000));
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

function getVideoLikes() {
  // 方法1: 从点赞按钮区域获取
  const likeButton = document.querySelector('ytd-toggle-button-renderer[aria-label*="点赞"]');
  if (likeButton) {
    const ariaLabel = likeButton.getAttribute('aria-label') || '';
    console.log('[ likeButton aria-label ]', ariaLabel);
    
    // 匹配 "点赞 1.2万" 格式
    const likeMatch = ariaLabel.match(/点赞\s*([\d.,]+[万亿]*)/);
    if (likeMatch) {
      const result = parseViewCount(likeMatch[1]);
      console.log('[ 点赞数匹配结果 ]', likeMatch[1], '->', result);
      return result;
    }
  }
  
  // 方法2: 从整个页面搜索点赞数
  const allText = document.body.textContent || '';
  const globalLikeMatch = allText.match(/点赞\s*([\d.,]+[万亿]*)/);
  if (globalLikeMatch) {
    console.log('[ 全局点赞数匹配 ]', globalLikeMatch[1]);
    return parseViewCount(globalLikeMatch[1]);
  }
  
  // 方法3: 尝试英文格式，但过滤掉无效值
  const englishLikeMatch = allText.match(/like\s*([\d.,]+[KMB]*)/gi);
  if (englishLikeMatch) {
    // 过滤掉无效的匹配，如 ".b"
    const validMatches = englishLikeMatch.filter(match => {
      const value = match.replace(/like\s*/i, '').trim();
      return value && value !== '.b' && value !== '.' && value !== 'b';
    });
    
    if (validMatches.length > 0) {
      const bestMatch = validMatches[0].replace(/like\s*/i, '').trim();
      console.log('[ 英文点赞数匹配 ]', bestMatch);
      return parseEnglishViewCount(bestMatch);
    }
  }
  
  // 方法4: 搜索数字+点赞的格式
  const numberLikeMatch = allText.match(/([\d.,]+[万亿]*)\s*点赞/);
  if (numberLikeMatch) {
    console.log('[ 数字+点赞匹配 ]', numberLikeMatch[1]);
    return parseViewCount(numberLikeMatch[1]);
  }
  
  // 方法5: 调试 - 搜索所有包含"点赞"的文本
  const likeElements = document.querySelectorAll('*');
  for (const element of likeElements) {
    if (element.textContent && element.textContent.includes('点赞')) {
      console.log('[ 找到点赞元素 ]', element.tagName, element.className, element.textContent);
    }
  }
  
  console.log('[ 无法获取点赞数 ]');
  return 0;
}

function getVideoComments() {
  // 方法1: 从评论头部的 #count 元素获取
  const countElement = document.querySelector('#comments #count yt-formatted-string');
  if (countElement) {
    const countText = countElement.textContent || '';
    console.log('[ countElement text ]', countText);
    
    // 匹配 "4,131 条评论" 格式
    const commentMatch = countText.match(/([\d,]+)\s*条评论/);
    if (commentMatch) {
      const result = parseInt(commentMatch[1].replace(/,/g, '')) || 0;
      console.log('[ 评论数匹配结果 ]', commentMatch[1], '->', result);
      return result;
    }
  }
  
  // 方法2: 尝试从 h2#count 直接获取
  const countH2 = document.querySelector('h2#count');
  if (countH2) {
    const countText = countH2.textContent || '';
    console.log('[ countH2 text ]', countText);
    
    const commentMatch = countText.match(/([\d,]+)\s*条评论/);
    if (commentMatch) {
      const result = parseInt(commentMatch[1].replace(/,/g, '')) || 0;
      console.log('[ countH2 评论数匹配结果 ]', commentMatch[1], '->', result);
      return result;
    }
  }
  
  // 方法3: 从整个页面搜索评论数
  const allText = document.body.textContent || '';
  const globalCommentMatch = allText.match(/([\d,]+)\s*条评论/);
  if (globalCommentMatch) {
    console.log('[ 全局评论数匹配 ]', globalCommentMatch[1]);
    return parseInt(globalCommentMatch[1].replace(/,/g, '')) || 0;
  }
  
  // 方法4: 尝试英文格式
  const englishCommentMatch = allText.match(/([\d,]+)\s*comments/);
  if (englishCommentMatch) {
    console.log('[ 英文评论数匹配 ]', englishCommentMatch[1]);
    return parseInt(englishCommentMatch[1].replace(/,/g, '')) || 0;
  }
  
  // 方法5: 调试 - 搜索所有包含"评论"的文本
  const commentElements = document.querySelectorAll('*');
  for (const element of commentElements) {
    if (element.textContent && element.textContent.includes('条评论')) {
      console.log('[ 找到评论元素 ]', element.tagName, element.className, element.textContent);
    }
  }
  
  console.log('[ 无法获取评论数 ]');
  return 0;
}

function estimateRevenue(views: number, likes: number, comments: number): number {
  const cpm = 2.5;
  const engagementRate = (likes + comments * 2) / views;
  const engagementMultiplier = Math.min(1 + engagementRate * 10, 3);
  
  return (views / 1000) * cpm * engagementMultiplier;
}

function convertToCNY(usd: number): number {
  const exchangeRate = 7.2;
  return usd * exchangeRate;
}

function updateRevenueDisplay(usd: number, cny: number, views: number, likes: number, comments: number) {
  const contentElement = document.querySelector('#revenue-content');
  if (!contentElement) return;
  
  contentElement.innerHTML = `
    <div style="margin-bottom: 8px;">
      <span style="font-weight: 500;">观看量:</span> ${views.toLocaleString()}
    </div>
    <div style="margin-bottom: 8px;">
      <span style="font-weight: 500;">点赞数:</span> ${likes.toLocaleString()}
    </div>
    <div style="margin-bottom: 8px;">
      <span style="font-weight: 500;">评论数:</span> ${comments.toLocaleString()}
    </div>
    <div style="border-top: 1px solid var(--yt-spec-10-percent-layer); padding-top: 12px; margin-top: 12px;">
      <div style="font-size: 18px; font-weight: 600; color: var(--yt-spec-text-primary); margin-bottom: 4px;">
        $${usd.toFixed(2)} USD
      </div>
      <div style="font-size: 14px; color: var(--yt-spec-text-secondary);">
        ¥${cny.toFixed(2)} CNY
      </div>
    </div>
    <div style="margin-top: 12px; font-size: 12px; color: var(--yt-spec-text-secondary);">
      * 此为估算值，实际收益可能有所不同
    </div>
  `;
}
