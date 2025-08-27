<template>
  <div class="revenue-card">
    <div class="card-header">
      <span>
        💰 视频收益估算 
      </span>
      <button @click="refreshData" class="refresh-btn">
        🔄 刷新数据
      </button>
    </div>
    
    <div v-if="loading" class="loading">
      正在计算中...
    </div>
    
    <div v-else-if="error" class="error">
      {{ error }}
    </div>
    
    <div v-else class="revenue-content">
      <div class="stats">
        <div class="stat-item">
          <span class="stat-label">观看量:</span>
          <span class="stat-value">{{ formatNumber(stats.views) }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">点赞数:</span>
          <span class="stat-value">{{ formatNumber(stats.likes) }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">评论数:</span>
          <span class="stat-value">{{ formatNumber(stats.comments) }}</span>
        </div>
      </div>
      
      <div class="revenue-section">
        <div class="revenue-usd">
          ${{ formatCurrency(revenueUSD) }} USD
        </div>
        <div class="revenue-cny">
          ¥{{ formatCurrency(revenueCNY) }} CNY
        </div>
      </div>
      
      <div class="disclaimer">
        * 此为估算值，实际收益可能有所不同
      </div>
      
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface RevenueStats {
  views: number
  likes: number
  comments: number
}

const loading = ref(true)
const error = ref('')
const stats = ref<RevenueStats>({ views: 0, likes: 0, comments: 0 })
const revenueUSD = ref(0)
const revenueCNY = ref(0)

const formatNumber = (num: number) => {
  return num.toLocaleString()
}

const formatCurrency = (amount: number) => {
  return amount.toFixed(2)
}

const getVideoData = () => {
  try {
    const views = getVideoViews()
    console.log('[ views ]-77', views)
    const likes = getVideoLikes()
    const comments = getVideoComments()
    
    if (views === null) {
      throw new Error('无法获取观看量数据')
    }
    
    stats.value = { views, likes, comments }
    revenueUSD.value = estimateRevenue(views, likes, comments)
    revenueCNY.value = convertToCNY(revenueUSD.value)
    
    loading.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : '数据获取失败'
    loading.value = false
  }
}

const getVideoViews = (): number | null => {
  const infoContainer = document.querySelector('#info-container')
  if (!infoContainer) return null
  
  const infoElement = infoContainer.querySelector('yt-formatted-string#info span:first-child')
  if (!infoElement) return null
  
  const viewText = infoElement.textContent || ''
  console.log('[ viewText ]-106', viewText)
  
  const viewMatch = viewText.match(/([\d.,]+[万亿]*)\s*次观看/)
  if (!viewMatch) return null
  
  let viewCount = viewMatch[1]
  
  if (viewCount.includes('万')) {
    const num = parseFloat(viewCount.replace(/[^\d.]/g, ''))
    return Math.round(num * 10000)
  }
  
  if (viewCount.includes('亿')) {
    const num = parseFloat(viewCount.replace(/[^\d.]/g, ''))
    return Math.round(num * 100000000)
  }
  
  return parseInt(viewCount.replace(/[^\d]/g, '')) || 0
}

const getVideoLikes = (): number => {
  const likeButton = document.querySelector('ytd-toggle-button-renderer[aria-label*="喜欢"]') || 
                    document.querySelector('ytd-toggle-button-renderer[aria-label*="like"]')
  if (!likeButton) return 0
  
  const likeText = likeButton.getAttribute('aria-label') || ''
  const likesMatch = likeText.match(/(\d+[,.]?\d*)\s*(喜欢|likes)/)
  return likesMatch ? parseInt(likesMatch[1].replace(/[,.]/g, '')) : 0
}

const getVideoComments = (): number => {
  const commentCountElement = document.querySelector('ytd-comments-header-renderer h2')
  if (!commentCountElement) return 0
  
  const commentText = commentCountElement.textContent || ''
  const commentsMatch = commentText.match(/(\d+[,.]?\d*)\s*(评论|comments)/)
  return commentsMatch ? parseInt(commentsMatch[1].replace(/[,.]/g, '')) : 0
}

const estimateRevenue = (views: number, likes: number, comments: number): number => {
  const cpm = 2.5
  const engagementRate = (likes + comments * 2) / views
  const engagementMultiplier = Math.min(1 + engagementRate * 10, 3)
  
  return (views / 1000) * cpm * engagementMultiplier
}

const convertToCNY = (usd: number): number => {
  const exchangeRate = 7.2
  return usd * exchangeRate
}

const refreshData = () => {
  loading.value = true
  error.value = ''
  setTimeout(() => {
    getVideoData()
  }, 500)
}

onMounted(() => {
  getVideoData()
})
</script>

<style scoped>
.revenue-card {
  margin-top: 16px;
  padding: 16px;
  background: var(--yt-spec-base-background);
  border-radius: 12px;
  border: 1px solid var(--yt-spec-10-percent-layer);
  font-family: 'Roboto', 'Arial', sans-serif;
}

.card-header {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--yt-spec-text-primary);
}

.loading, .error {
  color: var(--yt-spec-text-secondary);
  text-align: center;
  padding: 20px 0;
}

.error {
  color: #ff4d4f;
}

.stats {
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
}

.stat-label {
  font-weight: 500;
  color: var(--yt-spec-text-primary);
}

.stat-value {
  color: var(--yt-spec-text-secondary);
}

.revenue-section {
  border-top: 1px solid var(--yt-spec-10-percent-layer);
  padding-top: 16px;
  margin-top: 16px;
}

.revenue-usd {
  font-size: 18px;
  font-weight: 600;
  color: var(--yt-spec-text-primary);
  margin-bottom: 4px;
}

.revenue-cny {
  font-size: 14px;
  color: var(--yt-spec-text-secondary);
}

.disclaimer {
  margin-top: 12px;
  font-size: 12px;
  color: var(--yt-spec-text-secondary);
  text-align: center;
}

.refresh-btn {
  width: 100%;
  margin-top: 12px;
  padding: 8px 16px;
  background: var(--yt-spec-badge-chip-background);
  border: 1px solid var(--yt-spec-10-percent-layer);
  border-radius: 8px;
  color: var(--yt-spec-text-primary);
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.refresh-btn:hover {
  background: var(--yt-spec-menu-background);
}
</style>
