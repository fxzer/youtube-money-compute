<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';

// 声明chrome API类型
declare global {
  interface Window {
    chrome: any;
  }
}

// 获取chrome API引用
const chrome = (window as any).chrome;

// 响应式数据
const views = ref(0);
const rpm = ref(5); // 默认RPM值
const adRate = ref(60); // 广告投放率 40%-80%
const brandCollaboration = ref(0); // 品牌合作收入
const premiumShare = ref(0); // Premium分成
const membershipCount = ref(0); // 会员数
const membershipFee = ref(4.99); // 会员费
const superChat = ref(0); // 打赏收入
const merchandise = ref(0); // 带货收入
const isLoading = ref(true);
const errorMessage = ref('');

// 从存储中加载设置值
const loadSettingsFromStorage = () => {
  try {
    chrome.storage.sync.get(['rpm', 'adRate', 'membershipFee'], (result: any) => {
      if (result.rpm !== undefined) rpm.value = result.rpm;
      if (result.adRate !== undefined) adRate.value = result.adRate;
      if (result.membershipFee !== undefined) membershipFee.value = result.membershipFee;
    });
  } catch (error) {
    console.log('加载设置失败，使用默认值');
  }
};

// 保存设置到存储
const saveSettingsToStorage = () => {
  try {
    chrome.storage.sync.set({ 
      rpm: rpm.value, 
      adRate: adRate.value, 
      membershipFee: membershipFee.value 
    });
  } catch (error) {
    console.error('保存设置失败:', error);
  }
};

// 监听设置变化并保存
watch([rpm, adRate, membershipFee], () => {
  saveSettingsToStorage();
});

// 计算属性
const adRevenue = computed(() => {
  return (views.value / 1000) * rpm.value * (adRate.value / 100) * 0.55;
});

const membershipRevenue = computed(() => {
  return membershipCount.value * membershipFee.value * 0.7;
});

const superChatRevenue = computed(() => {
  return superChat.value * 0.7;
});

const merchandiseRevenue = computed(() => {
  return merchandise.value * 0.5; // 假设50%净利润
});

const totalRevenue = computed(() => {
  return adRevenue.value + brandCollaboration.value + premiumShare.value + 
         membershipRevenue.value + superChatRevenue.value + merchandiseRevenue.value;
});

const totalRevenueCNY = computed(() => {
  return totalRevenue.value * 7.2; // 转换为人民币（假设汇率1:7.2）
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
    isLoading.value = true;
    errorMessage.value = '';
    
    // 向content script发送消息获取数据
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      // 检查是否在YouTube页面
      if (!tab.url?.includes('youtube.com/watch')) {
        errorMessage.value = '请在YouTube视频页面使用此扩展';
        isLoading.value = false;
        return;
      }
      
      // 添加错误处理和重试机制
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoData' });
        if (response && response.success) {
          views.value = response.views || 0;
          console.log('获取到观看量:', views.value);
        } else {
          errorMessage.value = response?.error || '无法获取视频数据';
          console.error('获取数据失败:', response);
        }
      } catch (messageError: any) {
        // 如果消息发送失败，尝试注入content script
        if (messageError.message.includes('Receiving end does not exist')) {
          console.log('Content script未加载，尝试注入...');
                      try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content-scripts/content.js']
              });
            
            // 等待一下再尝试发送消息
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const retryResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoData' });
            if (retryResponse && retryResponse.success) {
              views.value = retryResponse.views || 0;
              console.log('重试成功，获取到观看量:', views.value);
            } else {
              errorMessage.value = retryResponse?.error || '重试后仍无法获取数据';
            }
          } catch (injectionError) {
            console.error('注入content script失败:', injectionError);
            errorMessage.value = '无法注入内容脚本，请刷新页面后重试';
          }
        } else {
          throw messageError;
        }
      }
    } else {
      errorMessage.value = '无法获取当前标签页';
    }
  } catch (error) {
    console.error('获取页面数据失败:', error);
    errorMessage.value = '获取数据时发生错误';
  } finally {
    isLoading.value = false;
  }
};

// 重新计算收益
const recalculateRevenue = () => {
  console.log('重新计算收益:', totalRevenue.value);
};

// 组件挂载时获取数据
onMounted(() => {
  loadSettingsFromStorage();
  getCurrentPageData();
});
</script>

<template>
  <div class="revenue-calculator">
    <div class="header">
      <h1>💰 YouTube收益计算器</h1>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading">
      <div class="spinner"></div>
      <p>正在获取视频数据...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="errorMessage" class="error">
      <div class="error-icon">⚠️</div>
      <p class="error-text">{{ errorMessage }}</p>
      <button @click="getCurrentPageData" class="retry-btn">
        重试
      </button>
    </div>

    <!-- 主要内容 -->
    <div v-else class="content">
      <!-- 广告收益 -->
      <div class="section">
        <div class="section-header">
          <span class="section-icon">📺</span>
          <h3>广告收益</h3>
          <div class="views-info">
            <span class="views-label">观看量:</span>
            <span class="views-value">{{ formatNumber(views) }}</span>
          </div>
        </div>
        
        <div class="input-group">
          <label class="input-label">RPM (每千次观看收入)</label>
          <input 
            type="number" 
            v-model="rpm" 
            min="0.1" 
            max="20" 
            step="0.1" 
            class="input-field"
            placeholder="5.0"
          />
        </div>

        <div class="input-group">
          <label class="input-label">广告投放率: {{ adRate }}%</label>
          <div class="slider-container">
            <input 
              type="range" 
              v-model="adRate" 
              min="40" 
              max="80" 
              step="5" 
              class="slider"
            />
            <div class="slider-labels">
              <span>40%</span>
              <span>80%</span>
            </div>
          </div>
        </div>

        <div class="input-group">
          <label class="input-label">品牌合作收入 ($)</label>
          <input 
            type="number" 
            v-model="brandCollaboration" 
            min="0" 
            step="100" 
            class="input-field"
            placeholder="0"
          />
        </div>
      </div>

      <!-- 分成收入 -->
      <div class="section">
        <div class="section-header">
          <span class="section-icon">💎</span>
          <h3>分成收入</h3>
        </div>
        
        <div class="input-group">
          <label class="input-label">Premium分成 ($)</label>
          <input 
            type="number" 
            v-model="premiumShare" 
            min="0" 
            step="100" 
            class="input-field"
            placeholder="0"
          />
        </div>

        <div class="input-group">
          <label class="input-label">会员数量</label>
          <input 
            type="number" 
            v-model="membershipCount" 
            min="0" 
            class="input-field"
            placeholder="0"
          />
        </div>

        <div class="input-group">
          <label class="input-label">会员费 ($/月)</label>
          <input 
            type="number" 
            v-model="membershipFee" 
            min="0" 
            step="0.01" 
            class="input-field"
            placeholder="4.99"
          />
        </div>
      </div>

      <!-- 打赏/带货 -->
      <div class="section">
        <div class="section-header">
          <span class="section-icon">🎁</span>
          <h3>打赏/带货</h3>
        </div>
        
        <div class="input-group">
          <label class="input-label">打赏收入 ($)</label>
          <input 
            type="number" 
            v-model="superChat" 
            min="0" 
            step="10" 
            class="input-field"
            placeholder="0"
          />
        </div>

        <div class="input-group">
          <label class="input-label">带货收入 ($)</label>
          <input 
            type="number" 
            v-model="merchandise" 
            min="0" 
            step="100" 
            class="input-field"
            placeholder="0"
          />
        </div>
      </div>

      <!-- 总收益显示 -->
      <div class="total-section">
        <div class="total-label">预计总收入</div>
        <div class="total-value">${{ totalRevenue.toFixed(2) }} ≈ ¥{{ totalRevenueCNY.toFixed(2) }}</div>
      </div>

      <!-- 计算按钮 -->
      <div class="actions">
        <button @click="recalculateRevenue" class="calculate-btn">
          重新计算
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.revenue-calculator {
  width: 400px;
  min-height: 800px;
  background: #ffffff;
  color: #333333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  margin: 0;
  padding: 0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  overflow: hidden;
}

.header {
  text-align: center;
  padding: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.header h1 {
  margin: 0 0 6px 0;
  font-size: 20px;
  font-weight: 700;
  color: white;
}


.loading {
  text-align: center;
  padding: 50px 20px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  text-align: center;
  padding: 40px 20px;
}

.error-icon {
  font-size: 32px;
  margin-bottom: 16px;
}

.error-text {
  color: #dc3545;
  font-size: 14px;
  margin-bottom: 20px;
  font-weight: 500;
}

.retry-btn {
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: #c82333;
  transform: translateY(-1px);
}

.content {
  padding: 20px;
  background: #f8f9fa;
}

.section {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border: 1px solid #e9ecef;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  gap: 8px;
  flex-wrap: wrap;
}

.section-icon {
  font-size: 18px;
}

.section h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #212529;
}

.views-info {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.views-label {
  font-size: 12px;
  color: #6c757d;
  font-weight: 500;
}

.views-value {
  font-size: 16px;
  font-weight: 700;
  color: #495057;
}

.input-group {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.input-group:last-child {
  margin-bottom: 0;
}

.input-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #495057;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  min-width: 120px;
  flex-shrink: 0;
}

.input-field {
  flex: 1;
  padding: 8px 10px;
  border: 2px solid #e9ecef;
  border-radius: 6px;
  background: #ffffff;
  color: #495057;
  font-size: 14px;
  font-weight: 500;
  box-sizing: border-box;
  transition: all 0.2s ease;
}

.input-field::placeholder {
  color: #adb5bd;
  font-size: 13px;
}

.input-field:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
  transform: translateY(-1px);
}

.slider-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #e9ecef;
  outline: none;
  margin-bottom: 8px;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #6c757d;
  font-weight: 500;
}

.total-section {
  text-align: center;
  padding: 10px;
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
  margin-bottom: 20px;
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(255, 215, 0, 0.3);
  border: 2px solid #ffd700;
}

.total-label {
  font-size: 12px;
  font-weight: 600;
  color: #b8860b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.total-value {
  font-size: 32px;
  font-weight: 800;
  color: #b8860b;
  margin-bottom: 6px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.total-cny {
  font-size: 18px;
  font-weight: 700;
  color: #b8860b;
  opacity: 0.9;
}

.actions {
  padding: 0;
}

.calculate-btn {
  width: 100%;
  padding: 14px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
}

.calculate-btn:hover {
  background: linear-gradient(135deg, #218838 0%, #1ea085 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(40, 167, 69, 0.4);
}

.calculate-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
}
</style>
