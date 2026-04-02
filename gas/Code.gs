// ============================================================
// Report_PV — Google Apps Script バックエンド
// スプレッドシート ID を下記に設定してください
// ============================================================
const SPREADSHEET_ID = '1gS2PeVAkegCXwkI6Xvub8jMuIIEPB54WQSbV39sgmE4';

// CORS ヘッダー付きレスポンスを生成
function createCorsResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ---- GET: データ取得 ----
function doGet(e) {
  const action = e.parameter.action || '';

  try {
    if (action === 'getSheets') {
      return createCorsResponse(getSheets());
    }
    if (action === 'getRows') {
      const sheetName = e.parameter.sheet || '';
      return createCorsResponse(getRows(sheetName));
    }
    return createCorsResponse({ error: 'Unknown action' });
  } catch (err) {
    return createCorsResponse({ error: err.message });
  }
}

// ---- POST: データ書き込み ----
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || '';

    if (action === 'appendRow') {
      return createCorsResponse(appendRow(body.sheet, body.row));
    }
    if (action === 'createSheet') {
      return createCorsResponse(createNewSheet(body.sheetName));
    }
    return createCorsResponse({ error: 'Unknown action' });
  } catch (err) {
    return createCorsResponse({ error: err.message });
  }
}

// ---- シート一覧を取得 ----
function getSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets().map(s => s.getName());
  return { success: true, sheets: sheets };
}

// ---- 指定シートの全行を取得 ----
function getRows(sheetName) {
  if (!sheetName) return { error: 'sheetName is required' };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { error: `Sheet "${sheetName}" not found` };

  const lastRow = sheet.getLastRow();
  if (lastRow === 0) return { success: true, rows: [] };

  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  return {
    success: true,
    rows: data.map(row => row.map(cell => {
      // Date オブジェクトを ISO 文字列に変換
      if (cell instanceof Date) return cell.toISOString().split('T')[0];
      return cell;
    }))
  };
}

// ---- 指定シートに行を追加 ----
function appendRow(sheetName, row) {
  if (!sheetName) return { error: 'sheetName is required' };
  if (!Array.isArray(row)) return { error: 'row must be an array' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);

  // シートが存在しなければ作成
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.appendRow(row);
  return { success: true };
}

// ---- 新規シートを作成 ----
function createNewSheet(sheetName) {
  if (!sheetName) return { error: 'sheetName is required' };
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  if (ss.getSheetByName(sheetName)) {
    return { error: `Sheet "${sheetName}" already exists` };
  }

  ss.insertSheet(sheetName);
  return { success: true, message: `Sheet "${sheetName}" created` };
}
