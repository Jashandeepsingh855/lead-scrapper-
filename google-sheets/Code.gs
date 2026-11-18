// ============================================================
// LeadFlow CRM — Google Apps Script Backend (Code.gs)
// ============================================================
// DEPLOYMENT INSTRUCTIONS (3 steps):
//   1. Open your Google Sheet → Extensions → Apps Script
//   2. Paste this entire file, then click Save (Ctrl+S)
//   3. Click Deploy → New Deployment → Type: Web App
//      • Execute as: Me
//      • Who has access: Anyone
//      Click Deploy → Copy the Web App URL
//      Paste that URL into Vercel / .env.local as GOOGLE_SHEET_WEBHOOK_URL
// ============================================================

var SHEET_NAME = "Leads";

// Row 1 headers — do NOT change order
var HEADERS = [
  "id",
  "business_name",
  "city",
  "niche",
  "contact",
  "msg_sent",
  "replied",
  "demo_sent",
  "details_received",
  "in_progress",
  "delivered",
  "notes",
  "msg_sent_at",
  "last_updated"
];

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function buildIndex(sheet) {
  var data = sheet.getDataRange().getValues();
  var index = {};
  // col 0 = id, col 4 = contact
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][0]).trim();
    var contact = String(data[i][4]).trim();
    if (id) index["id:" + id] = i + 1; // 1-based row
    if (contact) index["contact:" + contact] = i + 1;
  }
  return index;
}

// GET — return all leads as JSON
function doGet() {
  try {
    var sheet = getSheet();
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ leads: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var headers = data[0];
    var leads = [];
    for (var i = 1; i < data.length; i++) {
      var row = {};
      for (var j = 0; j < headers.length; j++) {
        row[headers[j]] = data[i][j];
      }
      leads.push(row);
    }
    return ContentService.createTextOutput(JSON.stringify({ leads: leads }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ error: e.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// POST — handle append, update, and patch actions
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || "append";

    if (action === "append") {
      return handleAppend(payload.leads || []);
    } else if (action === "update") {
      return handleUpdate(payload.lead);
    } else {
      return jsonResponse({ error: "Unknown action: " + action });
    }
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function handleAppend(leads) {
  var sheet = getSheet();
  var index = buildIndex(sheet);
  var appended = 0;
  var skipped = 0;
  var now = new Date().toISOString();

  for (var i = 0; i < leads.length; i++) {
    var lead = leads[i];
    var id = String(lead.id || "").trim();
    var contact = String(lead.contact || "").trim();

    // Skip duplicates
    if ((id && index["id:" + id]) || (contact && index["contact:" + contact])) {
      skipped++;
      continue;
    }

    var row = [
      id,
      lead.business_name || "",
      lead.city || "",
      lead.niche || "",
      contact,
      false, // msg_sent
      false, // replied
      false, // demo_sent
      false, // details_received
      false, // in_progress
      false, // delivered
      "",    // notes
      "",    // msg_sent_at
      now    // last_updated
    ];
    sheet.appendRow(row);
    appended++;
    // Update index to avoid duplicate within same batch
    if (id) index["id:" + id] = true;
    if (contact) index["contact:" + contact] = true;
  }

  return jsonResponse({ ok: true, appended: appended, skipped: skipped });
}

function handleUpdate(lead) {
  if (!lead) return jsonResponse({ error: "No lead data." });
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var id = String(lead.id || "").trim();
  var targetRow = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === id) {
      targetRow = i + 1; // 1-based
      break;
    }
  }

  if (targetRow === -1) return jsonResponse({ error: "Lead not found: " + id });

  var now = new Date().toISOString();
  for (var j = 0; j < headers.length; j++) {
    var key = headers[j];
    if (key === "id") continue;
    if (key === "last_updated") {
      sheet.getRange(targetRow, j + 1).setValue(now);
    } else if (lead.hasOwnProperty(key)) {
      sheet.getRange(targetRow, j + 1).setValue(lead[key]);
    }
  }

  return jsonResponse({ ok: true, updated: id });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
