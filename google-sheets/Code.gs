// ============================================================
// LeadFlow CRM — Google Apps Script Backend (Code.gs)
// ============================================================
// 3-STEP SETUP INSTRUCTIONS:
//   1. Open your Google Sheet → Extensions → Apps Script
//   2. Replace everything in Code.gs with this code, then Save (Ctrl+S / Cmd+S)
//   3. Click "Deploy" → "Manage Deployments" → Edit (pencil icon)
//      • Set Version to: "New version"
//      • Click Deploy
// ============================================================

var SHEET_NAME = "Leads";

// Row 1 Headers (Exact order required)
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
    if (id) index["id:" + id] = i + 1; // 1-based row number
    if (contact) index["contact:" + contact] = i + 1;
  }
  return index;
}

// GET: Returns all leads as JSON
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

// POST: Handles appending and upserting leads
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || "append";

    if (action === "append") {
      return handleAppend(payload.leads || []);
    } else if (action === "update" || action === "upsert") {
      return handleUpdate(payload.lead);
    } else {
      return jsonResponse({ error: "Unknown action: " + action });
    }
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// Appends only new leads, skipping duplicates by contact or id
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

    // Prevent duplicate entries
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
      Boolean(lead.msg_sent),
      Boolean(lead.replied),
      Boolean(lead.demo_sent),
      Boolean(lead.details_received),
      Boolean(lead.in_progress),
      Boolean(lead.delivered),
      lead.notes || "",
      lead.msg_sent_at || "",
      now
    ];
    sheet.appendRow(row);
    appended++;

    if (id) index["id:" + id] = true;
    if (contact) index["contact:" + contact] = true;
  }

  return jsonResponse({ ok: true, appended: appended, skipped: skipped });
}

// Upsert: Updates lead if exists by id/contact, or appends it as new row
function handleUpdate(lead) {
  if (!lead) return jsonResponse({ error: "No lead provided" });
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var id = String(lead.id || "").trim();
  var contact = String(lead.contact || "").trim();
  var targetRow = -1;

  for (var i = 1; i < data.length; i++) {
    var rowId = String(data[i][0]).trim();
    var rowContact = String(data[i][4]).trim();
    if ((id && rowId === id) || (contact && rowContact === contact)) {
      targetRow = i + 1;
      break;
    }
  }

  var now = new Date().toISOString();

  // If already in sheet, update matching fields
  if (targetRow !== -1) {
    for (var j = 0; j < headers.length; j++) {
      var key = headers[j];
      if (key === "id") continue;
      if (key === "last_updated") {
        sheet.getRange(targetRow, j + 1).setValue(now);
      } else if (lead.hasOwnProperty(key)) {
        sheet.getRange(targetRow, j + 1).setValue(lead[key]);
      }
    }
    return jsonResponse({ ok: true, action: "updated", id: id || contact });
  }

  // If NOT in sheet yet, automatically append it!
  var row = [
    id,
    lead.business_name || "",
    lead.city || "",
    lead.niche || "",
    contact,
    lead.hasOwnProperty("msg_sent") ? Boolean(lead.msg_sent) : true,
    Boolean(lead.replied),
    Boolean(lead.demo_sent),
    Boolean(lead.details_received),
    Boolean(lead.in_progress),
    Boolean(lead.delivered),
    lead.notes || "",
    lead.msg_sent_at || now,
    now
  ];
  sheet.appendRow(row);
  return jsonResponse({ ok: true, action: "appended", id: id || contact });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
