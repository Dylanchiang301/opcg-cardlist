/** 主要處理：
 *  卡牌圖片的下載
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Common = require('./Common.js');
const Logger = require('./Logger');
const SQLiteHandle = require('./SQLiteHandle');

class ImageDownload {
    /**
     * 圖片下載類別建構子
     * @param {string} scriptDirectory - 腳本目錄的路徑
     */
    constructor(scriptDirectory) {
        this.logger = new Logger(scriptDirectory); // 日誌記錄器
        this.dbHandle = new SQLiteHandle(scriptDirectory); // 資料庫存取類別
        this.common = new Common(); // 通用方法類別
        this.scriptDirectory = scriptDirectory;
    }

    /**
     * 檢查是否存在 'Image' 資料夾，若存在則刪除後重新建立
     */
    checkImageFolder() {
        try {
            const imageDir = path.join(this.scriptDirectory, 'images');
            // 如果目錄存在，刪除它
            if (fs.existsSync(imageDir)) {
                fs.rmSync(imageDir, { recursive: true, force: true });
                console.log(`已刪除資料夾: ${imageDir}`);
            }

            // 創建新目錄
            fs.mkdirSync(imageDir, { recursive: true });
            console.log(`已建立資料夾: ${imageDir}`);
        } catch (err) {
            this.logger.logErrorMessage(`checkImageFolder: ${err.message}`);
        }
    }

    /**
     * 下載檔案到指定目錄下
     * @param {number} cid - 圖片所屬卡片的 cid (識別碼)
     * @param {string} imgSrc - 圖片網址
     * @param {string} seriesName - 系列名稱
     */
    async downloadImage(cid, imgSrc, seriesName, languageUrl) {
        // 創建系列目錄
        const dirPath = path.join(this.scriptDirectory, 'images', seriesName);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // 組合成完整的 URL
        const downLoadUrl = new URL(imgSrc, languageUrl).toString();

        // 從 URL 提取檔名
        const fileName = path.basename(downLoadUrl);

        // 圖片保存完整路徑
        const filePath = path.join(dirPath, fileName);

        // 下載圖片
        const response = await axios.get(downLoadUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(filePath, response.data);
        // console.log(`圖片已保存到 ${filePath}`);

        // 將檔案資訊儲存到資料庫
        await this.dbHandle.saveFileInfo(cid, filePath);
    } catch(err) {
        this.logger.logErrorMessage(`downloadImage: ${err.message}`);
    }
}

module.exports = ImageDownload;