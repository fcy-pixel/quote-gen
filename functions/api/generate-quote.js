import { QUOTE_TEMPLATE_B64 } from '../../src/quote-template-b64.js';

// JSZip bundled inline for Cloudflare Pages Functions
// We use dynamic import from node_modules via nodejs_compat
import JSZip from 'jszip';

export async function onRequestPost({ request }) {
  try {
    const fields = await request.json();

    // Decode template
    const binaryStr = atob(QUOTE_TEMPLATE_B64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const zip = await JSZip.loadAsync(bytes.buffer);
    const docXml = await zip.file('word/document.xml').async('string');

    // Fill all placeholders
    let filled = docXml;
    const placeholders = [
      '支付來源', '申請人姓名', '申請人職務', '申請人職級',
      '物品名稱', '物品用途', '預計費用',
      '推薦供應商', '物品數量',
      '供應商1_總價', '供應商2_名稱', '供應商2_總價',
      '送貨日期', '付款日期', '報價日期', '批核人',
    ];

    for (const key of placeholders) {
      const val = (fields[key] ?? '').toString().trim();
      filled = filled.replaceAll(`{{${key}}}`, escapeXml(val));
    }

    zip.file('word/document.xml', filled);
    const outBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

    return new Response(outBytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="quote.docx"',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
