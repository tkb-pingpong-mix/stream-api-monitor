// src/components/SigninApiMonitor.vue
<template>
  <div class="stream-monitor">
    <header>
      <h1>社内API モニター</h1>
      <div class="auth-panel" v-if="!isAuthenticated">
        <h2>認証</h2>
        <div class="auth-form">
          <div class="form-group">
            <label for="apiUrl">API URL:</label>
            <input 
              v-model="apiUrl" 
              type="text" 
              id="apiUrl"
              placeholder="https://api.example.com/signin" 
              :disabled="isStreaming"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label for="userName">ユーザー名:</label>
            <input 
              v-model="userName" 
              type="text" 
              id="userName"
              placeholder="username" 
              :disabled="isStreaming"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label for="password">パスワード:</label>
            <input 
              v-model="password" 
              type="password" 
              id="password"
              placeholder="password" 
              :disabled="isStreaming"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label for="code">認証コード:</label>
            <input 
              v-model="code" 
              type="text" 
              id="code"
              placeholder="code" 
              :disabled="isStreaming"
              class="form-input"
            />
          </div>
          <button 
            @click="authenticate" 
            :disabled="isAuthenticating || !canAuthenticate"
            class="auth-btn"
          >
            {{ isAuthenticating ? '認証中...' : '認証' }}
          </button>
        </div>
      </div>
      <div class="controls">
        <div class="stream-info" v-if="isAuthenticated">
          <div class="auth-status">
            <span class="auth-label">認証済み:</span>
            <span class="auth-value">{{ userName }}</span>
            <button @click="signOut" class="signout-btn">サインアウト</button>
          </div>
        </div>
        <button 
          @click="startStream" 
          :disabled="isStreaming || !isAuthenticated"
          class="start-btn"
        >
          ストリーム開始
        </button>
        <button 
          @click="stopStream" 
          :disabled="!isStreaming"
          class="stop-btn"
        >
          ストリーム停止
        </button>
        <button 
          @click="clearMessages"
          class="clear-btn"
        >
          ログクリア
        </button>
      </div>
    </header>

    <div class="status-bar">
      <div class="status">
        <span class="label">状態:</span>
        <span :class="['status-value', statusClass]">
          {{ statusText }}
        </span>
      </div>
      <div class="metrics">
        <div class="metric">
          <span class="label">受信メッセージ:</span>
          <span class="value">{{ messagesReceived }}</span>
        </div>
        <div class="metric">
          <span class="label">最終メッセージ:</span>
          <span class="value">{{ lastMessageTime }}</span>
        </div>
        <div class="metric">
          <span class="label">接続時間:</span>
          <span class="value">{{ connectionDuration }}</span>
        </div>
      </div>
    </div>

    <div class="stream-container">
      <h2>ストリームデータ</h2>
      <div class="stream-data" ref="streamDataContainer">
        <div 
          v-for="(message, index) in messages" 
          :key="index" 
          :class="['message', `type-${message.type}`]"
        >
          <div class="message-header">
            <span class="timestamp">{{ formatTimestamp(message.timestamp) }}</span>
            <span class="message-type">{{ getMessageTypeName(message.type) }}</span>
          </div>
          <pre class="message-content">{{ message.content }}</pre>
        </div>
        <div v-if="messages.length === 0" class="no-messages">
          メッセージはまだありません。認証後、「ストリーム開始」ボタンをクリックしてください。
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onBeforeUnmount, nextTick, watch } from 'vue';

interface StreamMessage {
  content: string;
  timestamp: Date;
  type: 'data' | 'info' | 'error' | 'auth';
}

interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    // 他の必要なユーザー情報
  };
  // 他の認証レスポンス情報
}

export default defineComponent({
  name: 'SigninApiMonitor',
  
  setup() {
    // 認証関連の状態
    const isAuthenticated = ref(false);
    const isAuthenticating = ref(false);
    const apiUrl = ref('');
    const userName = ref('');
    const password = ref('');
    const code = ref('');
    const token = ref('');
    
    // ストリーム関連の状態
    const isStreaming = ref(false);
    const startTime = ref<Date | null>(null);
    const messagesReceived = ref(0);
    const messages = ref<StreamMessage[]>([]);
    const streamDataContainer = ref<HTMLElement | null>(null);
    
    // API接続用
    let eventSource: EventSource | null = null;
    
    // コンピューテッドプロパティ
    const canAuthenticate = computed(() => {
      return apiUrl.value && userName.value && password.value && code.value;
    });
    
    const statusText = computed(() => {
      if (isAuthenticating.value) return '認証中...';
      if (!isAuthenticated.value) return '未認証';
      if (isStreaming.value) return '接続中';
      return '切断';
    });
    
    const statusClass = computed(() => {
      if (isAuthenticating.value) return 'connecting';
      if (!isAuthenticated.value) return 'unauthenticated';
      if (isStreaming.value) return 'connected';
      return 'disconnected';
    });
    
    const lastMessageTime = computed(() => {
      if (messages.value.length === 0) return 'なし';
      const lastMsg = messages.value[messages.value.length - 1];
      return formatTimestamp(lastMsg.timestamp);
    });
    
    const connectionDuration = computed(() => {
      if (!isStreaming.value || !startTime.value) return '00:00:00';
      
      const now = new Date();
      const diff = now.getTime() - startTime.value.getTime();
      
      // Format as HH:MM:SS
      const hours = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const minutes = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const seconds = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      
      return `${hours}:${minutes}:${seconds}`;
    });
    
    // メソッド
    const formatTimestamp = (date: Date): string => {
      return date.toLocaleTimeString('ja-JP', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        fractionalSecondDigits: 3 
      });
    };
    
    const getMessageTypeName = (type: string): string => {
      const typeMap: Record<string, string> = {
        'data': 'データ',
        'info': '情報',
        'error': 'エラー',
        'auth': '認証'
      };
      return typeMap[type] || type.toUpperCase();
    };
    
    const addMessage = (content: string, type: 'data' | 'info' | 'error' | 'auth' = 'data') => {
      const message: StreamMessage = {
        content,
        timestamp: new Date(),
        type
      };
      
      messages.value.push(message);
      messagesReceived.value++;
      
      // Auto-scroll to latest message
      nextTick(() => {
        if (streamDataContainer.value) {
          streamDataContainer.value.scrollTop = streamDataContainer.value.scrollHeight;
        }
      });
    };
    
    const authenticate = async () => {
      if (isAuthenticating.value || !canAuthenticate.value) return;
      
      isAuthenticating.value = true;
      
      try {
        // 認証APIにリクエスト
        addMessage(`認証リクエスト: ${apiUrl.value}`, 'auth');
        
        const response = await fetch(apiUrl.value, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            user_name: userName.value,
            password: password.value,
            code: code.value
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`認証エラー: ${response.status} ${response.statusText}\n${errorText}`);
        }
        
        const data: AuthResponse = await response.json();
        
        // トークンを保存
        token.value = data.token;
        isAuthenticated.value = true;
        
        addMessage(`認証成功: ${data.user.name} (${data.user.id})`, 'auth');
      } catch (error) {
        addMessage(`認証失敗: ${error.message}`, 'error');
        isAuthenticated.value = false;
        token.value = '';
      } finally {
        isAuthenticating.value = false;
      }
    };
    
    const signOut = () => {
      // ストリームを停止
      stopStream();
      
      // 認証状態をリセット
      isAuthenticated.value = false;
      token.value = '';
      
      addMessage('サインアウトしました', 'auth');
    };
    
    const startStream = () => {
      if (isStreaming.value || !isAuthenticated.value) return;
      
      try {
        // 基本のストリームURLを構築（実際のAPIに合わせて調整）
        const streamUrl = apiUrl.value.replace('/signin', '/stream');
        
        // EventSourceを作成
        const eventSourceUrl = new URL(streamUrl);
        const eventSourceInit: EventSourceInit = {
          withCredentials: true
        };
        
        addMessage(`ストリーム接続開始: ${streamUrl}`, 'info');
        
        // EventSourceの作成と設定
        eventSource = new EventSource(streamUrl, eventSourceInit);
        
        // 接続開始イベント
        eventSource.onopen = (event) => {
          isStreaming.value = true;
          startTime.value = new Date();
          addMessage('ストリーム接続確立', 'info');
        };
        
        // メッセージ受信イベント
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            addMessage(JSON.stringify(data, null, 2), 'data');
          } catch (error) {
            // JSONでない場合はそのまま表示
            addMessage(event.data, 'data');
          }
        };
        
        // エラーイベント
        eventSource.onerror = (event) => {
          addMessage(`ストリームエラー発生`, 'error');
          
          if (eventSource && eventSource.readyState === EventSource.CLOSED) {
            stopStream();
          }
        };
        
        // カスタムイベントの購読（APIに合わせて調整）
        eventSource.addEventListener('update', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            addMessage(`更新イベント: ${JSON.stringify(data, null, 2)}`, 'data');
          } catch (error) {
            addMessage(`更新イベント: ${event.data}`, 'data');
          }
        });
        
        isStreaming.value = true;
        startTime.value = new Date();
      } catch (error) {
        addMessage(`ストリーム開始エラー: ${error.message}`, 'error');
        stopStream();
      }
    };
    
    const stopStream = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      
      if (isStreaming.value) {
        isStreaming.value = false;
        addMessage('ストリーム接続終了', 'info');
      }
    };
    
    const clearMessages = () => {
      messages.value = [];
      if (!isStreaming.value) {
        messagesReceived.value = 0;
      }
    };
    
    // コンポーネントのクリーンアップ
    onBeforeUnmount(() => {
      stopStream();
    });
    
    return {
      // 状態
      isAuthenticated,
      isAuthenticating,
      apiUrl,
      userName,
      password,
      code,
      isStreaming,
      messagesReceived,
      messages,
      lastMessageTime,
      connectionDuration,
      streamDataContainer,
      statusText,
      statusClass,
      canAuthenticate,
      
      // メソッド
      authenticate,
      signOut,
      startStream,
      stopStream,
      clearMessages,
      formatTimestamp,
      getMessageTypeName
    };
  }
});
</script>

<style scoped>
.stream-monitor {
  font-family: 'Arial', sans-serif;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  color: #333;
  background-color: #f8f9fa;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

header {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e0e0e0;
}

h1 {
  margin: 0 0 15px 0;
  font-size: 24px;
  color: #2c3e50;
}

h2 {
  font-size: 18px;
  margin: 0 0 10px 0;
  color: #2c3e50;
}

.auth-panel {
  background-color: #fff;
  border-radius: 6px;
  padding: 15px;
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.auth-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

label {
  font-weight: bold;
  font-size: 14px;
  color: #555;
}

.form-input {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: inherit;
}

.auth-btn {
  background-color: #2c3e50;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.2s;
  align-self: flex-end;
}

.auth-btn:hover:not(:disabled) {
  background-color: #1a2530;
}

.auth-btn:disabled {
  background-color: #95a5a6;
  cursor: not-allowed;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 15px;
}

.stream-info {
  flex-grow: 1;
  margin-right: 10px;
}

.auth-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.auth-label {
  font-weight: bold;
  color: #6c757d;
}

.auth-value {
  font-family: monospace;
  background-color: #f1f8ff;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #d1e5ff;
}

.signout-btn {
  background-color: #6c757d;
  color: white;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.signout-btn:hover {
  background-color: #5a6268;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.start-btn {
  background-color: #4caf50;
  color: white;
}

.start-btn:hover:not(:disabled) {
  background-color: #3d8b40;
}

.stop-btn {
  background-color: #f44336;
  color: white;
}

.stop-btn:hover:not(:disabled) {
  background-color: #d32f2f;
}

.clear-btn {
  background-color: #9e9e9e;
  color: white;
}

.clear-btn:hover {
  background-color: #757575;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #e9ecef;
  padding: 10px 15px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.status {
  display: flex;
  align-items: center;
  gap: 5px;
}

.status-value {
  font-weight: bold;
  padding: 4px 8px;
  border-radius: 12px;
}

.connected {
  background-color: #4caf50;
  color: white;
}

.disconnected {
  background-color: #9e9e9e;
  color: white;
}

.connecting {
  background-color: #ff9800;
  color: white;
}

.unauthenticated {
  background-color: #f44336;
  color: white;
}

.metrics {
  display: flex;
  gap: 15px;
}

.metric {
  display: flex;
  align-items: center;
  gap: 5px;
}

.label {
  font-weight: bold;
  color: #6c757d;
}

.value {
  font-family: monospace;
}

.stream-container {
  background-color: white;
  border-radius: 4px;
  padding: 15px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stream-data {
  height: 400px;
  overflow-y: auto;
  background-color: #f5f5f5;
  border-radius: 4px;
  padding: 10px;
  border: 1px solid #e0e0e0;
}

.message {
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 4px;
  background-color: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  font-size: 12px;
}

.timestamp {
  color: #6c757d;
}

.message-type {
  font-weight: bold;
}

.message-content {
  margin: 0;
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 13px;
  overflow-x: auto;
}

.type-data {
  border-left: 3px solid #2196f3;
}

.type-info {
  border-left: 3px solid #ff9800;
  background-color: #fff8e1;
}

.type-error {
  border-left: 3px solid #f44336;
  background-color: #ffebee;
}

.type-auth {
  border-left: 3px solid #9c27b0;
  background-color: #f3e5f5;
}

.no-messages {
  text-align: center;
  color: #9e9e9e;
  padding: 20px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .auth-form {
    grid-template-columns: 1fr;
  }
  
  .status-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .metrics {
    flex-direction: column;
    gap: 5px;
  }
}
</style>