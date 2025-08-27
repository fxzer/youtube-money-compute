<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';

// 声明chrome API类型
declare global {
  interface Window {
    chrome: any;
  }
}
const chrome = (window as any).chrome;

// 响应式数据
const views = ref(0);
const rpm = ref(5); // 默认RPM值
const brandCollaboration = ref(0); // 品牌合作收入
const isLoading = ref(true);

// 从存储中加载RPM值
const loadRPMFromStorage = () => {
  chrome.storage.sync.get(['rpm'], (result: any) => {
    if (result.rpm !== undefined) {
      rpm.value = result.rpm;
    }
  });
};

// 保存RPM值到存储
const saveRPMToStorage = (newRPM: number) => {
  chrome.storage.sync.set({ rpm: newRPM });
};

// 监听RPM值变化并保存
const handleRPMChange = (newRPM: number) => {
  rpm.value = newRPM;
  saveRPMToStorage(newRPM);
};

// 计算属性
const estimatedRevenue = computed(() => {
  // 简化版收入计算：广告收入 + 品牌合作
  const adRevenue = (views.value / 1000) * rpm.value;
  return adRevenue + brandCollaboration.value;
});

const adRevenue = computed(() => {
  return (views.value / 1000) * rpm.value;
});

const totalRevenueCNY = computed(() => {
  // 转换为人民币（假设汇率1:7.2）
  return estimatedRevenue.value * 7.2;
});

// 格式化数字
const formatNumber = (num: number) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
};

// 获取当前页面数据
const getCurrentPageData = async () => {
  try {
    // 向content script发送消息获取数据
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoData' });
      if (response && response.success) {
        views.value = response.views || 0;
      }
    }
  } catch (error) {
    console.error('获取页面数据失败:', error);
  } finally {
    isLoading.value = false;
  }
};

// 组件挂载时获取数据
onMounted(() => {
  loadRPMFromStorage();
  getCurrentPageData();
});
</script>

<template>
  <div class="revenue-calculator">
    <div class="header">
      <h1>💰 YouTube收益计算器</h1>
      <p class="subtitle">基于观看量和RPM的收入估算</p>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading">
      <div class="spinner"></div>
      <p>正在获取视频数据...</p>
    </div>

    <!-- 主要内容 -->
    <div v-else class="content">
      <!-- 视频数据展示 -->
      <div class="video-stats">
        <div class="stat-card">
          <div class="stat-icon">👁️</div>
          <div class="stat-value">{{ formatNumber(views) }}</div>
          <div class="stat-label">观看量</div>
        </div>
      </div>

      <!-- 参数调整区域 -->
      <div class="parameters">
        <h3>收入参数调整</h3>
        
        <!-- RPM输入框 -->
        <div class="parameter-group">
          <label class="parameter-label">
            RPM (每千次观看收入): ${{ rpm.toFixed(2) }}
          </label>
          <input 
            type="number" 
            :value="rpm" 
            @input="(e) => handleRPMChange(parseFloat((e.target as HTMLInputElement).value) || 0)"
            min="0.1" 
            max="20" 
            step="0.1" 
            class="input-field"
            placeholder="输入RPM值 (0.1-20)"
          />
          <div class="rpm-info">
            <span class="rpm-tip">💡 通常范围: $1-$10</span>
          </div>
        </div>

        <!-- 品牌合作输入 -->
        <div class="parameter-group">
          <label class="parameter-label">
            品牌合作收入 ($)
          </label>
          <input 
            type="number" 
            v-model="brandCollaboration" 
            min="0" 
            step="100" 
            class="input-field"
            placeholder="输入品牌合作收入"
          />
        </div>
      </div>

      <!-- 收益计算结果 -->
      <div class="revenue-results">
        <h3>收益估算结果</h3>
        
        <div class="revenue-breakdown">
          <div class="revenue-item">
            <span class="revenue-label">广告收入:</span>
            <span class="revenue-value">${{ adRevenue.toFixed(2) }}</span>
          </div>
          <div class="revenue-item">
            <span class="revenue-label">品牌合作:</span>
            <span class="revenue-value">${{ brandCollaboration.toFixed(2) }}</span>
          </div>
          <div class="revenue-divider"></div>
          <div class="revenue-item total">
            <span class="revenue-label">总收入:</span>
            <span class="revenue-value">${{ estimatedRevenue.toFixed(2) }}</span>
          </div>
          <div class="revenue-item">
            <span class="revenue-label">人民币:</span>
            <span class="revenue-value">¥{{ totalRevenueCNY.toFixed(2) }}</span>
          </div>
        </div>
      </div>

      <!-- 刷新按钮 -->
      <div class="actions">
        <button @click="getCurrentPageData" class="refresh-btn">
          🔄 刷新数据
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.revenue-calculator {
  width: 400px;
  min-height: 600px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  margin: 0;
  padding: 0;
}

.header {
  text-align: center;
  padding: 20px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  margin: 0;
}

.header h1 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 700;
}

.subtitle {
  margin: 0;
  font-size: 14px;
  opacity: 0.9;
}

.loading {
  text-align: center;
  padding: 60px 20px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.content {
  padding: 0;
  margin: 0;
}

.video-stats {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
  padding: 0 16px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px 24px;
  text-align: center;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  min-width: 120px;
}

.stat-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  opacity: 0.8;
}

.parameters {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  margin: 0 16px 20px 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.parameters h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
}

.parameter-group {
  margin-bottom: 20px;
}

.parameter-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.rpm-info {
  text-align: center;
  margin-top: 8px;
}

.rpm-tip {
  font-size: 12px;
  opacity: 0.8;
  background: rgba(255, 215, 0, 0.2);
  padding: 4px 8px;
  border-radius: 6px;
}

.input-field {
  width: 100%;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 14px;
  box-sizing: border-box;
}

.input-field::placeholder {
  color: rgba(255, 255, 255, 0.6);
}

.input-field:focus {
  outline: none;
  border-color: #ffd700;
  box-shadow: 0 0 0 2px rgba(255, 215, 0, 0.2);
}

.revenue-results {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  margin: 0 16px 20px 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.revenue-results h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
}

.revenue-breakdown {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.revenue-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.revenue-item.total {
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  padding-top: 16px;
  margin-top: 8px;
  font-weight: 700;
  font-size: 16px;
}

.revenue-label {
  font-size: 14px;
  opacity: 0.9;
}

.revenue-value {
  font-weight: 600;
  color: #ffd700;
}

.revenue-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  margin: 8px 0;
}

.actions {
  padding: 0 16px 16px 16px;
  text-align: center;
}

.refresh-btn {
  width: 100%;
  padding: 12px 24px;
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(238, 90, 36, 0.3);
}

.refresh-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(238, 90, 36, 0.4);
}

.refresh-btn:active {
  transform: translateY(0);
}
</style>
