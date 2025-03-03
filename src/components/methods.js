methods: {
  /**
   * Stream APIに接続してデータの受信を開始する
   * @param url Stream APIのエンドポイントURL
   * @param headers リクエストヘッダー（オプション）
   * @param params クエリパラメータ（オプション）
   */
  startStreamConnection(url: string, headers?: Record<string, string>, params?: Record<string, string>): void {
    if (this.isStreaming) return;
    
    try {
      // パラメータをURLに追加
      const apiUrl = new URL(url);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (key && value) {
            apiUrl.searchParams.append(key, value);
          }
        });
      }
      
      const finalUrl = apiUrl.toString();
      this.addMessage(`ストリーム接続開始: ${finalUrl}`, 'info');
      
      // ヘッダーを準備
      const requestHeaders = new Headers();
      requestHeaders.append('Connection', 'keep-alive');
      requestHeaders.append('Accept', '*/*');
      requestHeaders.append('Accept-Encoding', 'gzip, deflate, br');
      
      // 認証トークンがあれば追加
      if (this.idToken) {
        requestHeaders.append('Authorization', `Bearer ${this.idToken}`);
      }
      
      // 追加ヘッダーがあれば追加
      if (headers) {
        Object.entries(headers).forEach(([key, value]) => {
          if (key && value) {
            requestHeaders.append(key, value);
          }
        });
      }
      
      // Fetch APIでストリーム接続
      fetch(finalUrl, {
        method: 'GET',
        headers: requestHeaders,
        credentials: 'include'
      }).then(response => {
        if (!response.ok) {
          throw new Error(`HTTP エラー ${response.status}: ${response.statusText}`);
        }
        
        this.isStreaming = true;
        this.startTime = new Date();
        this.addMessage('ストリーム接続確立', 'info');
        
        // レスポンスボディのリーダーを取得
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('ストリームの読み取りに失敗しました');
        }
        
        // テキストデコーダーを作成
        const decoder = new TextDecoder();
        let buffer = '';
        
        // ストリームを処理する関数
        const processStream = async () => {
          try {
            while (this.isStreaming) {
              const { done, value } = await reader.read();
              
              if (done) {
                this.addMessage('ストリーム終了', 'info');
                this.stopStreamConnection();
                break;
              }
              
              // デコードして処理
              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              
              // 行単位で処理
              let newlineIndex;
              while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex).trim();
                buffer = buffer.substring(newlineIndex + 1);
                
                if (line) {
                  try {
                    // JSONとして解析
                    const data = JSON.parse(line);
                    this.addMessage(JSON.stringify(data, null, 2), 'data');
                    
                    // データ受信イベントを発火（コンポーネント外部で処理できるようにする）
                    this.$emit('stream-data', data);
                  } catch (e) {
                    // JSONでない場合はそのまま表示
                    this.addMessage(line, 'data');
                    this.$emit('stream-data', line);
                  }
                }
              }
            }
          } catch (error) {
            this.addMessage(`ストリーム処理エラー: ${error.message}`, 'error');
            this.stopStreamConnection();
            this.$emit('stream-error', error);
          }
        };
        
        processStream();
      }).catch(error => {
        this.addMessage(`接続エラー: ${error.message}`, 'error');
        this.stopStreamConnection();
        this.$emit('stream-error', error);
      });
    } catch (error) {
      this.addMessage(`ストリーム開始エラー: ${error.message}`, 'error');
      this.stopStreamConnection();
      this.$emit('stream-error', error);
    }
  },
  
  /**
   * ストリーム接続を停止する
   */
  stopStreamConnection(): void {
    this.isStreaming = false;
    this.addMessage('ストリーム接続を停止しました', 'info');
    this.$emit('stream-disconnected');
  },
  
  /**
   * メッセージを追加する（ログ表示用）
   * @param content メッセージの内容
   * @param type メッセージのタイプ（'data'|'info'|'error'|'auth'）
   */
  addMessage(content: string, type: 'data' | 'info' | 'error' | 'auth' = 'data'): void {
    const message = {
      content,
      timestamp: new Date(),
      type
    };
    
    this.messages.push(message);
    this.messagesReceived++;
    
    // Auto-scroll to latest message
    this.$nextTick(() => {
      if (this.$refs.streamDataContainer) {
        const container = this.$refs.streamDataContainer as HTMLElement;
        container.scrollTop = container.scrollHeight;
      }
    });
  }
}