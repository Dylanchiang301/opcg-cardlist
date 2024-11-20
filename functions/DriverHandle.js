/** 主要處理：
 *  1. 爬蟲作業
 *  2. 將卡牌的資料存入到資料庫當中
 */

const puppeteer = require('puppeteer');
const Common = require('./Common');
const Logger = require('./Logger');
const SQLiteHandle = require('./SQLiteHandle');

class DriverHandle {

    // 設置等待執行的方法
    static sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * 爬蟲相關類別
     * @param {string} scriptDirectory 腳本目錄的路徑
     */
    constructor(scriptDirectory) {
        this.logger = new Logger(scriptDirectory); // 日誌記錄器
        this.dbHandle = new SQLiteHandle(scriptDirectory); // 資料庫存取類別
        this.common = new Common(); // 通用方法類別
    }

    /**
     * 關閉 cookie 同意提示框，避免干擾爬蟲操作。
     * @param {puppeteer.Page} page 爬蟲頁面
     */
    async cookieSuggestionClose(page) {
        try {
            const closeButton = await page.waitForSelector('#onetrust-close-btn-container button', { timeout: 10000 });
            await closeButton.click();
            console.log("Cookie 關閉成功，稍後 5 秒...");
            await DriverHandle.sleep(5000);
        } catch (err) {
            console.log("無法找到 Cookie 關閉按鈕，可能頁面不需要");
        }
    }

    /**
     * 爬蟲執行，取得全部系列列表
     * @param {string} languageUrl 用戶選擇的語言對應的網址
     */
    async getCardSeriesList(languageUrl) {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        try {
            await page.goto(`${languageUrl}/cardlist`);
            await this.cookieSuggestionClose(page);

            // 找到選擇系列的select元素並匯整option的內容。 seriesName:系列名稱 seriesId:系列編號
            const options = await page.$$eval('.formsetDefaultArea .seriesCol select option', (elements) =>
                elements.map((option) => ({
                    seriesName: option.textContent.trim(),
                    seriesId: option.value.trim()
                })).filter(option => option.seriesId) // 過濾空值
            );

            // 將資料整理為物件，為了要存取卡牌資料使用，整理後的 key:value → 系列編號:系列名稱
            const optionDict = {};
            for (const { seriesId, seriesName } of options) {
                const processedText = this.common.processSeriesName(seriesName);
                optionDict[seriesId] = processedText;
            }

            // 儲存 系列資料
            await this.dbHandle.saveCardSeriesList(optionDict);
            console.log("卡牌系列列表 - 儲存成功");

        } catch (err) {
            // 記錄錯誤
            this.logger.logErrorMessage(`getCardSeriesList : ${err.message}`);
        } finally {
            await browser.close();
        }
    }

    /**
     * 爬蟲執行，取得指定系列的卡表細節資訊
     * @param {string} seriesId 系列 ID
     * @param {string} languageUrl 用戶選擇的語言對應的網址
     */
    async handleSeriesCardlist(seriesId, languageUrl) {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        try {
            const url = `${languageUrl}/cardlist/?series=${seriesId}`;
            await page.goto(url);
            console.log("稍後 5 秒...");
            await DriverHandle.sleep(5000);

            await this.cookieSuggestionClose(page);

            const cards = await page.$$eval('.resultCol .modalCol', (modalCols, seriesId) =>
                modalCols.map((modalCol) => {
                    const frontCol = modalCol.querySelector('.frontCol img'); //圖片
                    const backCol = modalCol.querySelector('.backCol'); // 卡牌細節資訊

                    const imgSrc = frontCol ? frontCol.getAttribute('data-src').split('?')[0] : '';
                    const cardName = frontCol ? frontCol.getAttribute('alt') : ''; //角色名稱
                    const cardId = modalCol.querySelector('.infoCol span:nth-child(1)').textContent.trim(); //卡片編號：OP05-002
                    const cardSpecies = modalCol.querySelector('.infoCol span:nth-child(2)').textContent.trim(); //卡牌稀有度分類：L/ UC/ R/ SR
                    const cardType = modalCol.querySelector('.infoCol span:nth-child(3)').textContent.trim(); //卡牌種類：領導、角色、事件、場地

                    const costValue = backCol.querySelector('.cost')?.childNodes[1]?.nodeValue?.trim() || '0'; //使用費用數
                    const powerValue = backCol.querySelector('.power')?.childNodes[1]?.nodeValue?.trim() || '0'; //力量值
                    const counterValue = backCol.querySelector('.counter')?.childNodes[1]?.nodeValue?.trim() || '0'; //卡牌側防值
                    const colorValue = backCol.querySelector('.color')?.childNodes[1]?.nodeValue?.trim() || '-'; //卡牌顏色
                    const featureValue = backCol.querySelector('.feature')?.childNodes[1]?.nodeValue?.trim() || '-'; //卡牌特征：四皇/赤髪海賊団
                    const effectValue = backCol.querySelector('.text')?.innerHTML.replace(/<h3[^>]*>.*?<\/h3>/gi, '').replace(/<br\s*\/?>/gi, ' ').trim() || '-'; //卡牌效果
                    const getInfo = backCol.querySelector('.getInfo')?.innerHTML.replace(/<h3[^>]*>.*?<\/h3>/gi, '').replace(/<br\s*\/?>/gi, ' ').trim() || '-'; //卡片取得的系列

                    return {
                        card_id: cardId,
                        card_name: cardName,
                        card_species: cardSpecies,
                        card_type: cardType,
                        img_src: imgSrc,
                        cost: parseInt(costValue, 10) || 0,
                        power: parseInt(powerValue, 10) || 0,
                        counter: parseInt(counterValue, 10) || 0,
                        color: colorValue,
                        feature: featureValue,
                        effect: effectValue,
                        get_info: getInfo,
                        series_id: seriesId
                    };
                }),
                seriesId
            );

            await this.dbHandle.saveSeriesDatabase(cards);
            console.log(`系列 ID ${seriesId} 的卡表已成功處理並儲存`);
        } catch (err) {
            this.logger.logErrorMessage(`handleSeriesCardlist : ${err.message}`);
        } finally {
            await browser.close();
        }
    }

    /**
     * 處理全系列卡表，儲存資訊至資料庫
     * @param {string} languageUrl 用戶選擇的語言對應的網址
     */
    async handleAllCardList(languageUrl, targetSeries) {
        try {
            // 爬蟲取得卡牌系列列表
            await this.getCardSeriesList(languageUrl);

            // 讀取卡片系列列表，並執行各個系列的卡表內容處理
            const allCardListInfos = await this.dbHandle.loadCardInfo();

            for (const [seriesId, seriesName] of Object.entries(allCardListInfos)) {
                if (targetSeries.length == 0 || targetSeries.includes(seriesId)) {
                    console.log(seriesId,'又進來的')
                    await this.handleSeriesCardlist(seriesId, languageUrl);
                }
            }
        } catch (err) {
            this.logger.logErrorMessage(`handleAllCardList : ${err.message}`);
        }
    }
}

module.exports = DriverHandle;
