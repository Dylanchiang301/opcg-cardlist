/** 主要處理：
 * SQL 的相關操作 
 * 下載的卡牌資料整理後存入到 sql 之中
 */
const sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const Logger = require('./Logger')

class SQLiteHandle {
    /**
     * SQLite DB 存取類別
     * @param {string} scriptDirectory 腳本目錄的路徑
     */
    constructor(scriptDirectory) {
        this.scriptDirectory = scriptDirectory;
        this.dbPath = path.join(scriptDirectory, 'db', 'cards.db');
        this.logger = new Logger(scriptDirectory) // 日誌記錄器
    }

    /**
     * 檢查是否存在 'DB' 資料夾，若存在則刪除後重新建立
     */
    checkDbFolder() {
        const dbDir = path.join(this.scriptDirectory, 'db');
        try {
            if (fs.existsSync(dbDir)) {
                fs.rmSync(dbDir, { recursive: true, force: true });
                console.log(`已刪除資料夾: ${dbDir}`);
            }
            fs.mkdirSync(dbDir, { recursive: true });
            console.log(`已建立資料夾: ${dbDir}`);
        } catch (err) {
            this.logger.logErrorMessage(`checkDbFolder : ${err.message}`);
        }
    }

    /**
     * 將卡片系列名稱及系列ID存入資料庫
     * @param {Object} seriesCardlistData 卡片系列名稱和ID對應的物件
     */
    async saveCardSeriesList(seriesCardlistData) {
        if (typeof seriesCardlistData !== 'object' || seriesCardlistData === null) {
            throw new Error('seriesCardlistData must be a non-null object');
        }
        const db = new sqlite3(this.dbPath);
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS cards_series (
                    series_id TEXT PRIMARY KEY,
                    series_name TEXT
                );
            `);
            const stmt = db.prepare('INSERT OR REPLACE INTO cards_series (series_id, series_name) VALUES (?, ?)');
            const insertMany = db.transaction((cardSeries) => {
                for (const [seriesId, seriesName] of cardSeries) {
                    stmt.run(seriesId, seriesName);
                }
            });
            insertMany(Object.entries(seriesCardlistData));
            console.log('卡牌系列資料 - 已存入資料庫');
        } catch (error) {
            this.logger.logErrorMessage(`saveCardSeriesList Error : ${error.message} ,Data: ${JSON.stringify(seriesCardlistData)}`);
        } finally {
            db.close();
        }
    }

    /**
     * 從資料庫中讀取卡片系列的資料並轉換為物件
     * @returns {Object} 包含所有卡片信息的物件，key: series_id / value: series_name
     */
    async loadCardInfo() {
        const db = new sqlite3(this.dbPath);
        const cardInfos = {};
        try {
            const rows = db.prepare('SELECT series_id, series_name FROM cards_series').all();
            for (const row of rows) {
                cardInfos[row.series_id] = row.series_name;
            }
        } catch (err) {
            this.logger.logErrorMessage(`loadCardInfo : ${err.message}`);
        } finally {
            db.close();
        }
        return cardInfos;
    }

    /**
    * 將網站上取得的系列卡片資訊儲存到資料庫
    * @param {Array} cardSeriesList 卡片系列資訊
    */
    async saveSeriesDatabase(cardSeriesList) {
        console.log(cardSeriesList, 'cardSeriesList');
        const db = new sqlite3(this.dbPath);
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS cards_info (
                    cid INTEGER PRIMARY KEY AUTOINCREMENT,
                    card_id TEXT,
                    card_name TEXT,
                    card_species TEXT,
                    card_type TEXT,
                    img_src TEXT,
                    cost INT,
                    power INT,
                    counter INT,
                    color TEXT,
                    feature TEXT,
                    effect TEXT,
                    get_info TEXT,
                    series_id TEXT
                );
            `);

            const stmt = db.prepare(`
                INSERT INTO cards_info (card_id, card_name, card_species, card_type, img_src, cost, power, counter, color, feature, effect, get_info, series_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const cardInfo of cardSeriesList) {
                stmt.run(
                    cardInfo.card_id,
                    cardInfo.card_name,
                    cardInfo.card_species,
                    cardInfo.card_type,
                    cardInfo.img_src,
                    cardInfo.cost,
                    cardInfo.power,
                    cardInfo.counter,
                    cardInfo.color,
                    cardInfo.feature,
                    cardInfo.effect,
                    cardInfo.get_info,
                    cardInfo.series_id
                );
            }
        } catch (err) {
            this.logger.logErrorMessage(`saveSeriesDatabase : ${err.message}`);
        } finally {
            db.close();
        }
    }

    /**
     * 正規化資料庫，將卡片資訊正規化
     * 建立不同圖片資訊表
     */
    async normalizeDatabase() {
        const db = new sqlite3(this.dbPath);
        try {
            // 創建新的 cards_info 表
            db.exec(`
                CREATE TABLE IF NOT EXISTS new_cards_info AS
                SELECT 
                    row_number() OVER (ORDER BY card_id) AS cid,
                    card_id,
                    card_name,
                    card_type,
                    cost,
                    power,
                    counter,
                    color,
                    feature,
                    effect
                FROM cards_info
            `);

            // 創建圖片表 cards_image_info
            db.exec(`
                CREATE TABLE IF NOT EXISTS cards_image_info (
                    cid INTEGER,
                    img_src TEXT,
                    card_species TEXT,
                    get_info TEXT,
                    series_id TEXT,
                    is_diff INTEGER
                );
            `);

            // 移動數據到圖片表
            const rows = db.prepare(`
                SELECT card_id, img_src, card_species, get_info, series_id FROM cards_info
            `).all();

            const insertStmt = db.prepare(`
                INSERT INTO cards_image_info (cid, img_src, card_species, get_info, series_id, is_diff)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const row of rows) {
                const isDiff = /_p\d+\.png$/.test(row.img_src) ? 1 : 0; // 判斷是否為異圖卡，是異圖的src會有 _p數字
                const cid = db.prepare(`SELECT cid FROM new_cards_info WHERE card_id = ?`).get(row.card_id)?.cid;
                insertStmt.run(cid, row.img_src, row.card_species, row.get_info, row.series_id, isDiff);
            }

            // 刪除舊表並重命名
            db.exec('DROP TABLE IF EXISTS cards_info;');
            db.exec('ALTER TABLE new_cards_info RENAME TO cards_info;');

        } catch (err) {
            this.logger.logErrorMessage(`normalizeDatabase : ${err.message}`);
        } finally {
            db.close();
        }
    }

    /**
     * 取得欲下載的檔案資訊
     * @returns {Array} 欲下載的檔案資訊清單
     */
    fetchCardInfoWithSeriesId() {
        const db = new sqlite3(this.dbPath);
        const cardInfoList = [];
        try {
            const rows = db.prepare(`
                    SELECT ci.cid, cii.img_src, sc.series_name 
                    FROM cards_image_info cii 
                    INNER JOIN cards_info ci ON ci.cid = cii.cid
                    INNER JOIN cards_series sc ON cii.series_id = sc.series_id
                    ORDER BY sc.series_name, sc.series_id
                `).all();

            for (const row of rows) {
                cardInfoList.push({
                    cid: row.cid,
                    img_src: row.img_src,
                    series_name: row.series_name
                });
            }
        } catch (err) {
            this.logger.logErrorMessage(`fetchCardInfoWithSeriesId : ${err.message}`);
        } finally {
            db.close();
        }
        return cardInfoList;
    }

    /**
     * 將檔案資訊儲存到資料庫
     * @param {number} cid 圖片所屬卡片的cid
     * @param {string} filePath 檔案的實際路徑
     */
    async saveFileInfo(cid, filePath) {
        const db = new sqlite3(this.dbPath);
        try {
            db.exec(`
                    CREATE TABLE IF NOT EXISTS files_info (
                        cid INTEGER,
                        file_path TEXT
                    );
                `);

            const stmt = db.prepare(`
                    INSERT INTO files_info (cid, file_path) VALUES (?, ?)
                `);
            stmt.run(cid, filePath);
        } catch (err) {
            this.logger.logErrorMessage(`saveFileInfo : ${err.message}`);
        } finally {
            db.close();
        }
    }

}

module.exports = SQLiteHandle;
