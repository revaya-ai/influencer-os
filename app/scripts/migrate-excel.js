/**
 * migrate-excel.js
 *
 * Reads Angela's "Miss Jones UGC Coordination.xlsx" spreadsheet and imports
 * influencers, campaigns, and campaign_influencer assignments into Supabase.
 *
 * Data sources (6 tabs):
 *   - "Influencers"            -> master roster (name, handle, content_type, location, rates)
 *   - "2025 Influencer Tracker" -> Q4 2025 campaign assignments
 *   - "2026 Influencer Tracker" -> Q1 2026 campaign assignments
 *   - "Budget"                 -> duplicate of tracker data (skipped, covered by trackers)
 *   - "2025 Budget Tracker"    -> budget summary (no influencer rows)
 *   - "2026 Budget Tracker"    -> budget summary (no influencer rows)
 *
 * Usage:
 *   node scripts/migrate-excel.js
 */

const XLSX = require('xlsx');
const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const EXCEL_PATH =
  '/Users/short/Desktop/Angela/Influencer-OS-workspace/Miss Jones UGC Coordination.xlsx';

const BRAND_IDS = {
  'Miss Jones': '8d77ae33-02c6-49cc-958f-5daac9dd621a',
  'Wine & Cola': '15f6b26f-8e4a-439b-b8aa-b59314c3ed08',
};

const pool = new Pool({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.kmibjimhbdibrpbrbffr',
  password: 'Arc&Beam2026!1',
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert follower strings like "16.2K", "1.1M", "218k", 11000, "" -> integer or null */
function parseFollowerCount(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Math.round(raw);

  const s = String(raw).trim().replace(/,/g, '');
  const mK = s.match(/^([\d.]+)\s*[kK]$/);
  if (mK) return Math.round(parseFloat(mK[1]) * 1000);
  const mM = s.match(/^([\d.]+)\s*[mM]$/);
  if (mM) return Math.round(parseFloat(mM[1]) * 1000000);
  const num = parseFloat(s);
  return isNaN(num) ? null : Math.round(num);
}

/** Strip $ and commas, return number or null */
function parseRate(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim().replace(/[$,]/g, '');
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

/** Clean handle: remove leading @, trailing spaces */
function cleanHandle(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (s.startsWith('@')) s = s.slice(1);
  // Skip if it looks like an email or URL
  if (s.includes('@') || s.includes('http') || s.includes('.com')) return null;
  // Remove parenthetical notes like "ginafoodie (YT)"
  s = s.replace(/\s*\(.*?\)\s*$/, '').trim();
  if (!s) return null;
  return s;
}

/** Extract the first email from a cell that might contain manager info */
function cleanEmail(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const match = s.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match ? match[0].toLowerCase() : null;
}

/** Determine primary platform from IG handle, TikTok handle presence */
function detectPlatform(igHandle, tiktokHandle) {
  const hasIG = igHandle && String(igHandle).trim();
  const hasTT = tiktokHandle && String(tiktokHandle).trim();
  if (hasIG && !hasTT) return 'instagram';
  if (!hasIG && hasTT) return 'tiktok';
  // If both, default to instagram (primary platform for Miss Jones)
  if (hasIG && hasTT) return 'instagram';
  return null;
}

/** Convert Excel serial date number to JS Date */
function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel epoch: 1900-01-01, but has a leap year bug (day 60 = Feb 29, 1900 doesn't exist)
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

/** Determine pipeline stage from row data */
function determinePipelineStage(row, headers) {
  const get = (col) => {
    const idx = headers.indexOf(col);
    return idx >= 0 ? String(row[idx] || '').trim().toLowerCase() : '';
  };

  const paid = get('Paid?') || get('Paid');
  const contentReceived = get('Content Recieved'); // typo in spreadsheet
  const contentPosted = get('Content Posted Organically ') || get('Content Posted Organically');
  const w9 = get('W9 Recieved');
  const invoice = get('Invoice');
  const partnershipPost = get('Partnership Post');

  if (paid === 'yes' || paid === 'y') return 'paid';
  if (invoice === 'yes' || invoice === 'y') return 'invoice_received';
  if (w9 === 'yes' || w9 === 'y') return 'w9_done';
  if (contentReceived === 'yes' || contentReceived === 'y') return 'content_received';
  if (partnershipPost === 'yes' || partnershipPost === 'y') return 'brief_sent';
  return 'contacted';
}

function determineW9Status(row, headers) {
  const idx = headers.indexOf('W9 Recieved');
  if (idx < 0) return 'pending';
  const val = String(row[idx] || '').trim().toLowerCase();
  if (val === 'yes' || val === 'y') return 'received';
  return 'pending';
}

function determineInvoiceStatus(row, headers) {
  const idx = headers.indexOf('Invoice');
  if (idx < 0) return 'pending';
  const val = String(row[idx] || '').trim().toLowerCase();
  if (val === 'yes' || val === 'y') return 'received';
  return 'pending';
}

function determinePaymentStatus(row, headers) {
  const paidIdx = headers.indexOf('Paid?') >= 0 ? headers.indexOf('Paid?') : headers.indexOf('Paid');
  if (paidIdx < 0) return 'unpaid';
  const val = String(row[paidIdx] || '').trim().toLowerCase();
  if (val === 'yes' || val === 'y') return 'paid';
  if (val === 'no') return 'unpaid';
  return 'unpaid';
}

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

function extractInfluencersFromRoster(wb) {
  const ws = wb.Sheets['Influencers'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // Headers at row 0
  const influencers = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[0] || '').trim();
    if (!name) continue;

    const igHandle = cleanHandle(r[2]);
    const tiktokHandle = cleanHandle(r[4]);
    const igFollowers = parseFollowerCount(r[3]);
    const ttFollowers = parseFollowerCount(r[5]);
    const platform = detectPlatform(r[2], r[4]);
    const handle = platform === 'tiktok' ? (tiktokHandle || igHandle) : (igHandle || tiktokHandle);
    const followerCount = platform === 'tiktok' ? (ttFollowers || igFollowers) : (igFollowers || ttFollowers);

    // Parse rate from Rates column (col 8) - take first number if multiline
    let rate = null;
    const rateRaw = String(r[8] || '').trim();
    if (rateRaw) {
      const rateMatch = rateRaw.match(/\$?([\d,]+)/);
      if (rateMatch) rate = parseRate(rateMatch[0]);
    }

    influencers.push({
      name,
      handle,
      email: cleanEmail(r[1]),
      platform,
      content_type: String(r[6] || '').trim() || null,
      location: String(r[7] || '').trim() || null,
      rate,
      follower_count: followerCount,
      ig_handle: igHandle,
      tiktok_handle: tiktokHandle,
    });
  }
  return influencers;
}

function extractInfluencersFromTracker(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find header row (contains "Name" and "Email")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].includes('Name') && rows[i].includes('Email')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const headers = rows[headerIdx].map(String);
  const nameIdx = headers.indexOf('Name');
  const emailIdx = headers.indexOf('Email');
  const igHandleIdx = headers.indexOf('IG Handle');
  const igFollowerIdx = headers.indexOf('Follower Count (~)');
  const tiktokIdx = headers.indexOf('TikTok Handle');
  // TikTok follower count is the second "Follower Count (~)"
  const ttFollowerIdx = headers.indexOf('Follower Count (~)', igFollowerIdx + 1);
  const contentTypeIdx = headers.indexOf('Content Type');
  const priceIdx = headers.indexOf('Price');

  const influencers = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[nameIdx] || '').trim();
    if (!name) continue;
    // Skip summary/section header rows
    if (name === 'GIRL SCOUTS' || name.startsWith('Q') || name.includes('TTL')) continue;

    const igHandle = cleanHandle(r[igHandleIdx]);
    const tiktokHandle = tiktokIdx >= 0 ? cleanHandle(r[tiktokIdx]) : null;
    const platform = detectPlatform(r[igHandleIdx], tiktokIdx >= 0 ? r[tiktokIdx] : '');
    const handle = platform === 'tiktok' ? (tiktokHandle || igHandle) : (igHandle || tiktokHandle);
    const igFollowers = parseFollowerCount(r[igFollowerIdx]);
    const ttFollowers = ttFollowerIdx >= 0 ? parseFollowerCount(r[ttFollowerIdx]) : null;
    const followerCount = platform === 'tiktok' ? (ttFollowers || igFollowers) : (igFollowers || ttFollowers);

    influencers.push({
      name,
      handle,
      email: cleanEmail(r[emailIdx]),
      platform,
      content_type: contentTypeIdx >= 0 ? (String(r[contentTypeIdx] || '').trim() || null) : null,
      location: null,
      rate: priceIdx >= 0 ? parseRate(r[priceIdx]) : null,
      follower_count: followerCount,
    });
  }
  return influencers;
}

/**
 * Merge influencer records: de-duplicate by name (case-insensitive).
 * Prefer non-null values, take highest follower count, take rate from tracker over roster.
 */
function mergeInfluencers(allRecords) {
  const map = new Map(); // lowercase name -> merged record

  for (const rec of allRecords) {
    const key = rec.name.toLowerCase().replace(/\s+/g, ' ');
    if (map.has(key)) {
      const existing = map.get(key);
      // Fill nulls
      existing.handle = existing.handle || rec.handle;
      existing.email = existing.email || rec.email;
      existing.platform = existing.platform || rec.platform;
      existing.content_type = existing.content_type || rec.content_type;
      existing.location = existing.location || rec.location;
      // Take the higher rate (usually from the tracker, more recent)
      if (rec.rate && (!existing.rate || rec.rate > existing.rate)) {
        existing.rate = rec.rate;
      }
      // Take the higher follower count
      if (rec.follower_count && (!existing.follower_count || rec.follower_count > existing.follower_count)) {
        existing.follower_count = rec.follower_count;
      }
    } else {
      map.set(key, { ...rec });
    }
  }

  return Array.from(map.values());
}

/**
 * Extract campaign assignments from a tracker sheet.
 * Returns array of { influencerName, retailer, campaign, product, deliverable, price,
 *   pipelineStage, w9Status, invoiceStatus, paymentStatus, postingDate, quarter }
 */
function extractAssignments(wb, sheetName, quarter) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].includes('Name') && rows[i].includes('Email')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const headers = rows[headerIdx].map(String);
  const nameIdx = headers.indexOf('Name');
  const retailerIdx = headers.indexOf('Retailer');
  const campaignIdx = headers.indexOf('Campaign');
  const productIdx = headers.indexOf('Product');
  const deliverableIdx = headers.indexOf('Deliverables');
  const priceIdx = headers.indexOf('Price');
  const postingDateIdx = headers.indexOf('Posting Date');

  const assignments = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[nameIdx] || '').trim();
    if (!name) continue;
    if (name === 'GIRL SCOUTS' || name.startsWith('Q') || name.includes('TTL')) continue;

    // Build a campaign name from retailer + campaign/product
    let retailer = retailerIdx >= 0 ? String(r[retailerIdx] || '').trim() : '';
    const campaignName = campaignIdx >= 0 ? String(r[campaignIdx] || '').trim() : '';
    const product = productIdx >= 0 ? String(r[productIdx] || '').trim() : '';
    const deliverable = deliverableIdx >= 0 ? String(r[deliverableIdx] || '').trim() : '';
    const price = priceIdx >= 0 ? parseRate(r[priceIdx]) : null;

    // 2026 sheet doesn't have "Retailer" column - it's embedded in "Campaign" field
    // The Campaign column in 2026 contains retailer name like "Whole Foods ", "Walmart "
    if (!retailer && campaignIdx >= 0) {
      // In 2026 sheet, col 7 is labeled "Campaign" but actually contains retailer
      // and col 8 has the actual campaign/product name
      // Check headers: 2026 has Campaign at idx 7, Product at idx 8
      retailer = campaignName;
    }

    // Normalize retailer names
    retailer = retailer.replace(/\s+$/, '');
    if (retailer === 'WF' || retailer === 'WFM' || retailer.startsWith('Whole Foods')) retailer = 'Whole Foods';
    if (retailer === 'WM' || retailer === 'WMT' || retailer.startsWith('Walmart')) retailer = 'Walmart';
    if (retailer.startsWith('Costco')) retailer = 'Costco';
    if (retailer.startsWith('Sprouts')) retailer = 'Sprouts';

    if (!retailer) continue; // skip rows without a retailer

    // Build campaign display name from retailer + campaign/product
    let fullCampaignName = '';
    if (campaignName && campaignName !== retailer) {
      fullCampaignName = `${retailer} - ${campaignName}`;
    } else if (product) {
      fullCampaignName = `${retailer} - ${product}`;
    } else {
      fullCampaignName = retailer;
    }
    // Clean up weird combos
    fullCampaignName = fullCampaignName.replace(/\s+/g, ' ').trim();

    const postingDate = postingDateIdx >= 0 ? excelDateToJS(r[postingDateIdx]) : null;

    assignments.push({
      influencerName: name,
      retailer,
      campaignName: fullCampaignName,
      product: product || null,
      deliverable: deliverable || null,
      price,
      pipelineStage: determinePipelineStage(r, headers),
      w9Status: determineW9Status(r, headers),
      invoiceStatus: determineInvoiceStatus(r, headers),
      paymentStatus: determinePaymentStatus(r, headers),
      postingDate,
      quarter,
    });
  }

  return assignments;
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

async function checkExistingData(client) {
  const res = await client.query('SELECT COUNT(*) as cnt FROM influencers');
  return parseInt(res.rows[0].cnt, 10);
}

async function insertInfluencers(client, influencers) {
  let inserted = 0;
  let skipped = 0;
  const idMap = new Map(); // lowercase name -> uuid

  for (const inf of influencers) {
    // Check if already exists by name
    const existing = await client.query(
      'SELECT id FROM influencers WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [inf.name]
    );

    if (existing.rows.length > 0) {
      idMap.set(inf.name.toLowerCase().replace(/\s+/g, ' '), existing.rows[0].id);
      skipped++;
      continue;
    }

    const result = await client.query(
      `INSERT INTO influencers (name, handle, email, platform, content_type, location, rate, follower_count, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        inf.name,
        inf.handle,
        inf.email,
        inf.platform,
        inf.content_type,
        inf.location,
        inf.rate,
        inf.follower_count,
        null,
      ]
    );
    idMap.set(inf.name.toLowerCase().replace(/\s+/g, ' '), result.rows[0].id);
    inserted++;
    console.log(`  [influencer] Inserted: ${inf.name} (${inf.platform || 'unknown'}, ${inf.follower_count || '?'} followers)`);
  }

  console.log(`\n  Influencers: ${inserted} inserted, ${skipped} skipped (already exist)\n`);
  return idMap;
}

async function insertCampaigns(client, assignments) {
  // De-duplicate campaigns by (campaignName + quarter)
  const campaignSet = new Map();
  for (const a of assignments) {
    const key = `${a.campaignName}::${a.quarter}`;
    if (!campaignSet.has(key)) {
      // Find the earliest posting date for this campaign as the deadline
      campaignSet.set(key, {
        name: a.campaignName,
        retailer: a.retailer,
        quarter: a.quarter,
        product: a.product,
        postingDeadline: a.postingDate,
      });
    } else {
      // Update posting deadline to latest date
      const existing = campaignSet.get(key);
      if (a.postingDate && (!existing.postingDeadline || a.postingDate > existing.postingDeadline)) {
        existing.postingDeadline = a.postingDate;
      }
      // Accumulate products
      if (a.product && existing.product && !existing.product.includes(a.product)) {
        existing.product = `${existing.product}, ${a.product}`;
      }
    }
  }

  const campaignIdMap = new Map(); // key -> uuid
  let inserted = 0;
  let skipped = 0;
  const brandId = BRAND_IDS['Miss Jones']; // All campaigns are Miss Jones

  for (const [key, campaign] of campaignSet) {
    // Check existing
    const existing = await client.query(
      'SELECT id FROM campaigns WHERE LOWER(name) = LOWER($1) AND quarter = $2 AND brand_id = $3 LIMIT 1',
      [campaign.name, campaign.quarter, brandId]
    );

    if (existing.rows.length > 0) {
      campaignIdMap.set(key, existing.rows[0].id);
      skipped++;
      continue;
    }

    const result = await client.query(
      `INSERT INTO campaigns (brand_id, retailer, name, quarter, products, posting_deadline, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        brandId,
        campaign.retailer,
        campaign.name,
        campaign.quarter,
        campaign.product,
        campaign.postingDeadline,
        campaign.quarter === 'Q4 2025' ? 'completed' : 'active',
      ]
    );
    campaignIdMap.set(key, result.rows[0].id);
    inserted++;
    console.log(`  [campaign] Inserted: ${campaign.name} (${campaign.quarter}, ${campaign.retailer})`);
  }

  console.log(`\n  Campaigns: ${inserted} inserted, ${skipped} skipped (already exist)\n`);
  return campaignIdMap;
}

async function insertAssignments(client, assignments, influencerIdMap, campaignIdMap) {
  let inserted = 0;
  let skipped = 0;
  let noMatch = 0;

  for (const a of assignments) {
    const infKey = a.influencerName.toLowerCase().replace(/\s+/g, ' ');
    const campKey = `${a.campaignName}::${a.quarter}`;

    const influencerId = influencerIdMap.get(infKey);
    const campaignId = campaignIdMap.get(campKey);

    if (!influencerId) {
      console.log(`  [warning] No influencer match for: "${a.influencerName}"`);
      noMatch++;
      continue;
    }
    if (!campaignId) {
      console.log(`  [warning] No campaign match for: "${a.campaignName}" (${a.quarter})`);
      noMatch++;
      continue;
    }

    // Check for existing assignment (unique constraint: campaign_id + influencer_id)
    const existing = await client.query(
      'SELECT id FROM campaign_influencers WHERE campaign_id = $1 AND influencer_id = $2 LIMIT 1',
      [campaignId, influencerId]
    );

    if (existing.rows.length > 0) {
      skipped++;
      continue;
    }

    await client.query(
      `INSERT INTO campaign_influencers (campaign_id, influencer_id, pipeline_stage, deliverable, w9_status, invoice_status, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        campaignId,
        influencerId,
        a.pipelineStage,
        a.deliverable,
        a.w9Status,
        a.invoiceStatus,
        a.paymentStatus,
      ]
    );
    inserted++;
  }

  console.log(`\n  Assignments: ${inserted} inserted, ${skipped} skipped (duplicates), ${noMatch} no match\n`);
  return { inserted, skipped, noMatch };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('==============================================');
  console.log('  InfluencerOS Excel Migration');
  console.log('==============================================\n');

  // 1. Read Excel
  console.log('[1] Reading Excel file...');
  const wb = XLSX.readFile(EXCEL_PATH);
  console.log(`    Sheets found: ${wb.SheetNames.join(', ')}\n`);

  // 2. Extract influencers from all sources
  console.log('[2] Extracting influencer data...');
  const rosterInfluencers = extractInfluencersFromRoster(wb);
  console.log(`    Influencers tab (roster): ${rosterInfluencers.length} records`);

  const tracker2025Influencers = extractInfluencersFromTracker(wb, '2025 Influencer Tracker');
  console.log(`    2025 Influencer Tracker: ${tracker2025Influencers.length} records`);

  const tracker2026Influencers = extractInfluencersFromTracker(wb, '2026 Influencer Tracker');
  console.log(`    2026 Influencer Tracker: ${tracker2026Influencers.length} records`);

  // Merge and de-duplicate
  const allInfluencers = mergeInfluencers([
    ...tracker2025Influencers,
    ...tracker2026Influencers,
    ...rosterInfluencers,
  ]);
  console.log(`    After de-duplication: ${allInfluencers.length} unique influencers\n`);

  // 3. Extract campaign assignments
  console.log('[3] Extracting campaign assignments...');
  const assignments2025 = extractAssignments(wb, '2025 Influencer Tracker', 'Q4 2025');
  console.log(`    2025 assignments: ${assignments2025.length}`);

  const assignments2026 = extractAssignments(wb, '2026 Influencer Tracker', 'Q1 2026');
  console.log(`    2026 assignments: ${assignments2026.length}`);

  const allAssignments = [...assignments2025, ...assignments2026];
  console.log(`    Total assignments: ${allAssignments.length}\n`);

  // 4. Connect to database and insert
  console.log('[4] Connecting to Supabase...');
  const client = await pool.connect();

  try {
    const existingCount = await checkExistingData(client);
    console.log(`    Existing influencers in DB: ${existingCount}\n`);

    // Start transaction
    await client.query('BEGIN');

    console.log('[5] Inserting influencers...');
    const influencerIdMap = await insertInfluencers(client, allInfluencers);

    console.log('[6] Inserting campaigns...');
    const campaignIdMap = await insertCampaigns(client, allAssignments);

    console.log('[7] Inserting campaign assignments...');
    const assignmentResult = await insertAssignments(
      client,
      allAssignments,
      influencerIdMap,
      campaignIdMap
    );

    await client.query('COMMIT');
    console.log('[OK] Transaction committed.\n');

    // 5. Verify
    console.log('[8] Verification...');
    const infCount = await client.query('SELECT COUNT(*) as cnt FROM influencers');
    const campCount = await client.query('SELECT COUNT(*) as cnt FROM campaigns');
    const assignCount = await client.query('SELECT COUNT(*) as cnt FROM campaign_influencers');
    const payCount = await client.query('SELECT COUNT(*) as cnt FROM payments');

    console.log('');
    console.log('==============================================');
    console.log('  MIGRATION SUMMARY');
    console.log('==============================================');
    console.log(`  Influencers in DB:      ${infCount.rows[0].cnt}`);
    console.log(`  Campaigns in DB:        ${campCount.rows[0].cnt}`);
    console.log(`  Assignments in DB:      ${assignCount.rows[0].cnt}`);
    console.log(`  Payments in DB:         ${payCount.rows[0].cnt}`);
    console.log('==============================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Migration failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
