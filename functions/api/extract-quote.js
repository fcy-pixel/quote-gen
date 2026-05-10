const SYSTEM_PROMPT = `你是一位香港學校採購報價單資料提取助手。從供應商報價單的圖片或文字中，準確提取相關欄位。

JSON 的 key 必須完全對應以下欄位名稱（只回傳找到的，找不到的不要包含）：

欄位名稱      說明／格式
供應商名稱    公司或商店的名稱
聯絡電話      電話號碼（如有）
物品名稱      報價的物品或服務名稱
物品數量      數量（純數字）
總價          含貨幣符號的總金額，例：$1,200 或 HK$500 或 ¥920
報價日期      日期（保留原文格式）

重要：
- 只提取報價單中明確出現的資料，絕對不可自行編造或推測任何欄位的內容
- 找不到的欄位一律不包含在 JSON 中
- 只返回 JSON，不加任何說明或 markdown 代碼框`;

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const apiKey = env.QWEN_API_KEY;
    if (!apiKey) return jsonError('QWEN_API_KEY 未設定');

    const baseUrl = env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

    if (body.images && Array.isArray(body.images) && body.images.length > 0) {
      return await extractWithVision(body.images, apiKey, baseUrl);
    }
    if (body.text?.trim()) {
      return await extractWithText(body.text, apiKey, baseUrl);
    }

    return jsonError('請提供 images 或 text');
  } catch (e) {
    return jsonError(e.message);
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

async function extractWithVision(images, apiKey, baseUrl) {
  const content = [
    ...images.slice(0, 3).map(img => ({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${img}` },
    })),
    { type: 'text', text: '這是供應商報價單的圖片，請按系統指示提取所有欄位，只返回 JSON。' },
  ];

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen-vl-max',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  return parseQwenResponse(resp);
}

async function extractWithText(text, apiKey, baseUrl) {
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `以下是供應商報價單的文字內容，請提取所有欄位：\n\n${text.slice(0, 8000)}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  return parseQwenResponse(resp);
}

async function parseQwenResponse(resp) {
  if (!resp.ok) {
    const err = await resp.text();
    return jsonError(`Qwen API 錯誤 ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = await resp.json();
  try {
    const raw = data.choices[0].message.content;
    const clean = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const fields = JSON.parse(clean);
    return new Response(JSON.stringify(fields), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch {
    return jsonError('AI 回應格式錯誤，請重試');
  }
}

function jsonError(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
