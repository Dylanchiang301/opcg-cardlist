/** 主要處理：
 *  記錄執行中錯誤訊息
 */
const fs = require('fs');
const path = require('path');

class Logger {
    /**
     * Logger 類別建構子
     * @param {string} scriptDirectory - 腳本目錄的路徑
     */
    constructor(scriptDirectory) {
        this.scriptDirectory = scriptDirectory;
    }

    /**
     * 寫入錯誤訊息至指定路徑
     * @param {string} message - 錯誤訊息
     */
    logErrorMessage(message) {
        try {
            // 創建 log 文件夾（如果不存在）
            const logFolder = path.join(this.scriptDirectory, 'log');
            if (!fs.existsSync(logFolder)) {
                fs.mkdirSync(logFolder, { recursive: true });
            }

            // 獲取當前日期
            const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            // 設置日誌文件名
            const logFile = path.join(logFolder, `${currentDate}.txt`);
            const currentTime = new Date().toLocaleTimeString();

            // 準備日誌訊息
            const logMessage = `[${currentTime}] : ${message}\n`;

            // 追加寫入日誌文件
            fs.appendFileSync(logFile, logMessage, 'utf8');
        } catch (error) {
            console.error(`Error while logging: ${error.message}`);
        }
    }
}

module.exports = Logger;
