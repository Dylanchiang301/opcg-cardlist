/** 主要處理：
 *  1. 取得路徑
 *  2. 選擇 one piece 卡牌官網的語言
 */ 

const path = require('path');
const readline = require('readline');

class Common {
    /**
     * 獲取腳本目錄的路徑，考慮到打包後的情況
     * 
     * @param {string} scriptDirectory - 當前腳本文件的路徑
     * @returns {string} 調整後的腳本目錄路徑
     */
    getScriptDirectory(scriptDirectory) {
        // 如果是打包後的可執行文件，使用 process.execPath
        if (process.pkg) {
            return path.dirname(process.execPath);
        } else {
            // 否則使用原始的腳本目錄
            return path.dirname(path.resolve(scriptDirectory));
        }
    }

    /**
     * 提示用戶選擇網站語言版本並返回對應的 URL。
     * 
     * 該方法將提示用戶輸入 'Y' 或 'N' 來選擇日文版網頁URL或繁體中文版網頁URL。
     * - 'Y' 代表選擇日文版網站，將返回對應的日文版 URL。
     * - 'N' 代表選擇繁體中文版網站，將返回對應的繁體中文版 URL。
     * 
     * 如果用戶輸入無效（非 'Y' 或 'N'），將繼續提示用戶直到輸入有效。
     * 
     * @returns {Promise<string>} 返回用戶選擇的語言對應的網址
     */
    async getUserChoiceLanguageUrl() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const askQuestion = () => {
            return new Promise((resolve) => {
                rl.question("是否選擇日文版網站？(Y/N)：", (choice) => {
                    choice = choice.trim().toUpperCase();
                    if (choice === 'Y' || choice === 'N') {
                        rl.close();
                        resolve(choice);
                    } else {
                        console.log("無效輸入，請輸入 'Y' 或 'N'。");
                        resolve(askQuestion());
                    }
                });
            });
        };

        const choice = await askQuestion();
        return choice === 'Y'
            ? 'https://www.onepiece-cardgame.com'
            : 'https://asia-tw.onepiece-cardgame.com';
    }

}

module.exports = Common;
