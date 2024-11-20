const path = require('path')
const Common = require('./functions/Common.js');
const DriverHandle = require('./functions/DriverHandle.js');
const SQLiteHandle = require('./functions/SQLiteHandle.js');
const ImageDownload = require('./functions/ImageDownload.js');
const Logger = require('./functions/Logger.js')


const common = new Common();
const scriptDirectory = common.getScriptDirectory(__filename);
const dbHandle = new SQLiteHandle(scriptDirectory);
const imageDownload = new ImageDownload(scriptDirectory);
const driverHandle = new DriverHandle(scriptDirectory);
const logger = new Logger(scriptDirectory);

const targetSeries = process.argv.slice(2);

dbHandle.checkDbFolder();
imageDownload.checkImageFolder();


(async ()=>{
    try {
        // 選擇網站語言(Y:日文 N:中文)
        const languageUrl = await common.getUserChoiceLanguageUrl();

        // 將所有的卡片資料存入資料庫
        await driverHandle.handleAllCardList(languageUrl,targetSeries);
        console.log("儲存卡片資料至資料庫完畢！");

        // 資料庫正規化
        await dbHandle.normalizeDatabase();
        console.log("資料庫正規化完成！");

        // 逐一讀取卡片資料
        const allCardsInfo = dbHandle.fetchCardInfoWithSeriesId();
        console.log('取出儲存資料');

        // 逐一取出 系列ID(series_id) 並處理
        for( const cardInfo of allCardsInfo){
            await imageDownload.downloadImage(
                cardInfo.cid,
                cardInfo.img_src,
                cardInfo.series_name,
                languageUrl
            );
        }

        console.log("下載全部系列卡牌圖片已完成！！！")
    } catch (error) {
        logger.logErrorMessage(`錯誤訊息： ${error.message}`);
        console.log(`錯誤訊息： ${error.message}`)
    }
})();
